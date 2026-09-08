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
Iran Internet Monitor / Node.js
        |
        +--> OONI
        +--> RIPE Atlas
        +--> IODA
        +--> Tor Metrics
        \--> Cloudflare Radar (optional token)
```

## Build

```bash
npm run check
npm run build
```

Copy `dist/` to the target host.

## Example systemd unit

Create `/etc/systemd/system/iran-internet-monitor.service`:

```ini
[Unit]
Description=Iran Internet Monitor
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=iran-monitor
Group=iran-monitor
WorkingDirectory=/opt/iran-internet-monitor
Environment=NODE_ENV=production
EnvironmentFile=-/etc/iran-internet-monitor.env
ExecStart=/usr/bin/node /opt/iran-internet-monitor/server.mjs
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

The service itself does not require persistent write access. Adjust hardening directives to your distribution and reverse-proxy setup.

Create `/etc/iran-internet-monitor.env` only if needed:

```text
HOST=127.0.0.1
PORT=4173
CACHE_TTL_MS=120000
CLOUDFLARE_RADAR_API_TOKEN=
```

Protect the file:

```bash
chmod 600 /etc/iran-internet-monitor.env
chown root:root /etc/iran-internet-monitor.env
```

Then:

```bash
systemctl daemon-reload
systemctl enable --now iran-internet-monitor
curl -fsS http://127.0.0.1:4173/api/health
```

## Reverse proxy requirements

- TLS 1.2+ / TLS 1.3;
- preserve the application's security headers or strengthen them;
- optionally add HTTP authentication/SSO/IP allow-listing;
- add request-rate limits if exposed beyond a trusted operator network;
- do not expose the Radar token to browser JavaScript.

## Monitoring the monitor

At minimum alert on:

- `/api/health` unavailable;
- repeated upstream source errors;
- sustained source freshness degradation;
- process restarts;
- TLS certificate expiry at the reverse proxy.

A source returning `no_data` is not the same as the monitor being unhealthy.

## Cloudflare Radar acceptance test

After configuring `CLOUDFLARE_RADAR_API_TOKEN`, run:

```bash
npm run verify:radar
```

The check is read-only and never prints the credential. It reports the HTTP-series point count, traffic-anomaly count, outage count, BGP-event count and source-specific errors. A DNS/TLS/API error is a failed acceptance check; do not treat `radarConfigured: true` alone as proof of a working upstream connection.
