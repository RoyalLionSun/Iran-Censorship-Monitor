# Security

Last reviewed: **2026-09-09**

## Secrets

No credentials are committed. `.env` is ignored and excluded from production build artifacts.

Credential-bearing integrations:

- `CLOUDFLARE_RADAR_API_TOKEN` — server-side only; use `Account > Radar > Read`, never a Global API Key;
- `INTERNET_SOCIETY_PULSE_API_TOKEN` — server-side only;
- optional `GLOBALPING_API_TOKEN` — server-side only;
- `GLOBALPING_CONTROL_KEY` — server-only operator control for active measurements and must never be exposed to the browser.

M-Lab, APNIC, Access Now STOP, OONI, RIPE, IODA, Tor, Censored Planet, Citizen Lab, PeeringDB, IHR, GDELT and passive RIPE RIS Live integration paths do not require stored credentials in the current design.

## Network exposure

Default bind address is `127.0.0.1`. For production Internet exposure:

1. keep Node on loopback/private networking where practical;
2. terminate HTTPS at a maintained reverse proxy/managed ingress;
3. apply access control if the dashboard is operationally sensitive;
4. rate-limit public requests at the proxy;
5. log only metadata needed for operations and avoid credentials/raw sensitive probe identities.

## Browser security headers

Static responses set:

- same-origin Content-Security-Policy including `connect-src 'self'`;
- `frame-ancestors 'none'`;
- `base-uri 'self'`;
- `form-action 'self'`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`.

## External-fetch boundary

The browser does not fetch measurement providers directly. Server adapters use fixed upstream hosts and validated scoped parameters.

Examples:

- OONI target input is passed only as an API filter after absolute HTTP/HTTPS validation; the local server does not fetch the user-supplied target itself.
- M-Lab paths are built only from fixed Iran country scope, validated ASN and selected year.
- APNIC paths are built only from fixed Iran economy scope and validated ASN.
- Access Now STOP uses one fixed public spreadsheet export URL and filters returned rows server-side.
- RIPE Atlas uses fixed Measurement 1001 plus validated Iran probe/ASN/date scope.
- RIPE RIS Live uses one fixed public stream endpoint and a subscription generated only from validated CIDR prefixes.

## Active-measurement safety

Globalping active measurements are disabled by default. Enabling them requires `GLOBALPING_ACTIVE_ENABLED=true` and a server-only `GLOBALPING_CONTROL_KEY`.

Controls include:

- Iran vantage restriction;
- maximum five probes;
- measurement-type allowlist;
- server-side hourly rate limit;
- rejection of localhost/private/link-local/CGNAT/reserved/documentation destinations;
- rejection of URL credentials;
- control-key requirement for create/read active measurement routes.

Do not enable active mode on an Internet-facing service without reverse-proxy access controls and an explicit operational reason.

## Passive RIPE RIS Live collector safety

The RIS Live collector is separate from `server.mjs` and never starts automatically.

Controls include:

- required ASN from the repository's registered Iran ASN list;
- default prefix scope derived from RIPEstat announced prefixes for that ASN;
- explicit failure on empty scope;
- maximum 200 prefixes and maximum 12,000-byte encoded subscription;
- no silent truncation or fallback to an unscoped firehose;
- optional operator-provided narrower prefix file;
- `UPDATE` routing messages only;
- bounded reconnect backoff;
- bounded local retention.

RIS Live events are marked as routing/control-plane evidence and never become an independent censorship vote.

## In-country operational safety

This project does not include high-risk in-country trigger/fuzzing or censorship-evasion experiments. A future owned probe fleet must treat operator identity, source addresses, physical location, endpoints, timestamps and raw logs as sensitive security data. Public probe identifiers must be minimized.

## OSINT / incident integrity

Context is not promoted to technical corroboration merely by repetition.

Access Now STOP may cite OONI, Radar, IODA or other existing sensors. `lib/accessnow.mjs` retains source URLs and maps recognized root lineage while marking every STOP record `independentTechnicalVote: false`.

GDELT and professional reporting are discovery/context only. Any future correlation claiming independent corroboration must trace the evidence to root measurement sources first.

## Data sensitivity and persistence

The ordinary Node dashboard service has no database and does not persist upstream API payloads to disk. Its source caches are in process memory.

Manually entered local VPN field measurements remain in browser `localStorage` and are not uploaded.

The optional RIS Live collector **does** intentionally persist routing events under `var/ris-live/` as daily JSONL and a status file. These records can contain prefixes, timestamps, RRC/peer identifiers, peer IP addresses, AS paths and next-hop values supplied by RIPE RIS Live.

Operational requirements for collector storage:

- `var/` is ignored by Git and must remain outside source-control commits;
- the dashboard does not expose `var/` as static content;
- grant write access only to the dedicated collector service/user;
- do not place collector output in a web-served directory;
- default retention is seven days and configured retention is capped at 30 days;
- if logs are copied elsewhere, apply an equivalent or stricter retention/access policy.

## Dependency and CI supply-chain controls

The runtime has no third-party npm dependencies. Node.js and the host/reverse proxy remain patch-management responsibilities.

GitHub Actions used in permanent CI are pinned to exact verified commit SHAs instead of floating major tags. CI uses read-only repository contents permission, checks for committed token/private-key patterns and `.env`, builds the production artifact and runs local security smoke tests.

The separate live-source workflow performs credential-free public-source acceptance and a bounded passive RIS Live subscription handshake. It does not enable active Globalping measurements or print server-side credentials.
