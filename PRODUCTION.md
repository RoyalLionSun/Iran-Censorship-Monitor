# Production Deployment

## Recommended topology

```text
Internet / administrator network
        |
      HTTPS
        v
Reverse proxy (TLS, access control, rate limit)
        |
  127.0.0.1:4173
        v
Iran Censorship Monitor / Node.js
        |
        +--> OONI / Censored Planet
        +--> RIPE Atlas / RIPEstat / IODA
        +--> M-Lab / APNIC / Tor / Globalping
        +--> PeeringDB / IHR / Access Now / Citizen Lab / GDELT
        \--> Cloudflare Radar / Internet Society Pulse (optional tokens)

Optional separate operator service
        |
        +--> RIPEstat prefix scope
        +--> RIPE RIS Live passive stream
        \--> /opt/iran-censorship-monitor/var/ris-live/
```

The web service and the optional RIS Live collector are separate processes. Starting the dashboard does not start continuous routing collection.

## Build

```bash
npm ci
npm run check
npm run build
```

Copy `dist/` to the target host.

The verified v1.1 runtime baseline passes 73/73 deterministic tests, production build, secret checks and runtime/404 smoke tests.

## Dashboard systemd unit

Create `/etc/systemd/system/iran-censorship-monitor.service`:

```ini
[Unit]
Description=Iran Censorship Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=iran-monitor
Group=iran-monitor
WorkingDirectory=/opt/iran-censorship-monitor
Environment=NODE_ENV=production
EnvironmentFile=-/etc/iran-censorship-monitor.env
ExecStart=/usr/bin/node /opt/iran-censorship-monitor/server.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/tmp

[Install]
WantedBy=multi-user.target
```

The dashboard service itself does not require persistent application-data write access. Adjust hardening directives to your distribution and reverse-proxy setup.

Create `/etc/iran-censorship-monitor.env` only if needed:

```text
HOST=127.0.0.1
PORT=4173
CACHE_TTL_MS=120000
CLOUDFLARE_RADAR_API_TOKEN=
INTERNET_SOCIETY_PULSE_API_TOKEN=
GLOBALPING_API_TOKEN=
GLOBALPING_ACTIVE_ENABLED=false
GLOBALPING_CONTROL_KEY=
GLOBALPING_SERVER_RUNS_PER_HOUR=10
```

Protect the file:

```bash
chmod 600 /etc/iran-censorship-monitor.env
chown root:root /etc/iran-censorship-monitor.env
```

Then:

```bash
systemctl daemon-reload
systemctl enable --now iran-censorship-monitor
curl -fsS http://127.0.0.1:4173/api/health
```

## Public-source acceptance

From the deployed tree:

```bash
npm run verify:public
npm run verify:ris-live
npm run verify:radar   # only when the Radar token is configured
```

`verify:public` exercises the real server API against credential-free public sources and accepts legitimate source-specific `observed`, `partial` or `no_data` states according to the verifier rules. It must not convert network/systemic errors into successful zero measurements.

`verify:ris-live` performs a bounded passive handshake against RIPE RIS Live for one RIPEstat-derived prefix. It does not trigger a measurement and does not claim full production prefix coverage.

The verified development live gate passed both the real public-server source check and the RIS Live handshake.

## Optional RIPE RIS Live collector

Start manually first:

```bash
npm run collect:ris -- --asn AS58224 --duration-seconds 300
```

For continuous collection omit `--duration-seconds` after validating the intended scope and output permissions:

```bash
npm run collect:ris -- --asn AS58224
```

Defaults and limits:

- ASN must exist in `data/asns.json`;
- default scope comes from RIPEstat currently announced prefixes;
- maximum automatic prefix scope: 200;
- no silent scope truncation;
- optional narrower `--prefix-file` supported;
- output: `var/ris-live/`;
- daily JSONL rotation;
- default retention: 7 days;
- maximum retention: 30 days.

For production, run the collector as a **separate service/user/process** and grant write access only to its output directory. Example unit:

```ini
[Unit]
Description=Iran Censorship Monitor RIPE RIS Live Collector - AS58224
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=iran-ris
Group=iran-ris
WorkingDirectory=/opt/iran-censorship-monitor
ExecStart=/usr/bin/node /opt/iran-censorship-monitor/scripts/collect-ris-live.mjs --asn AS58224 --output-dir /opt/iran-censorship-monitor/var/ris-live --retention-days 7
Restart=on-failure
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/iran-censorship-monitor/var/ris-live

[Install]
WantedBy=multi-user.target
```

Create and secure the output directory before enabling that unit. Do not point the collector at a web-served directory. The JSONL records can include prefixes, peer/RRC identifiers, peer IPs, AS paths and next-hop metadata from RIPE.

## Reverse proxy requirements

- TLS 1.2+ / TLS 1.3;
- preserve the application's security headers or strengthen them;
- optionally add HTTP authentication/SSO/IP allow-listing;
- add request-rate limits if exposed beyond a trusted operator network;
- do not expose Radar/Pulse/Globalping control credentials to browser JavaScript;
- do not expose `var/ris-live/` or other operator data directories.

## Monitoring the monitor

At minimum alert on:

- `/api/health` unavailable;
- repeated upstream source errors;
- sustained source freshness degradation;
- dashboard process restarts;
- TLS certificate expiry at the reverse proxy;
- if RIS Live collection is enabled: stale `status-ASxxxxx.json`, repeated reconnects and disk/retention failures.

A source returning `no_data`, `partial`, `token_required` or a rate-limit state is not automatically the same as the monitor being unhealthy. Alert logic should distinguish application failure from an upstream-specific state.

## Cloudflare Radar acceptance test

After configuring `CLOUDFLARE_RADAR_API_TOKEN`, run:

```bash
npm run verify:radar
```

The check is read-only and never prints the credential. A DNS/TLS/API error is a failed acceptance check; do not treat `radarConfigured: true` alone as proof of a working upstream connection.

## Active Globalping warning

Do not enable Globalping active measurements on an Internet-facing deployment without a server-only control key, reverse-proxy access controls and an explicit operational reason. Passive Globalping inventory does not require active mode.

RIPE RIS Live is unrelated to Globalping active measurements: it is a passive public routing stream and does not send probes into Iran.
