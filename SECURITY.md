# Security

Last reviewed: **2026-09-27**

## Supported versions

Fixes go to `main` and into the next release; older releases are not patched.

## Reporting a vulnerability

Report security problems privately through GitHub: **Security → Report a vulnerability** in this repository (private vulnerability reporting). Please do not open a public issue for them, and do not include anything that could identify people in Iran.

## Repository protection

- secret scanning with push protection: a push containing a recognised key is refused;
- `main` cannot be deleted or force-pushed; release tags `v*` cannot be changed or deleted;
- GitHub Actions: read-only token by default, only GitHub's own actions, pinned to exact commits (Dependabot proposes updates); workflows from forks need approval;
- CodeQL code scanning and Dependabot alerts are on.

## Secrets

No credentials are committed. `.env` is ignored and excluded from production build artifacts.

Credential-bearing integrations:

- `CLOUDFLARE_RADAR_API_TOKEN` — server-side only; use `Account > Radar > Read`, never a Global API Key;
- `INTERNET_SOCIETY_PULSE_API_TOKEN` — server-side only;
- optional `GLOBALPING_API_TOKEN` — server-side only;
- `GLOBALPING_CONTROL_KEY` — server-only operator control for active measurements and must never be exposed to the browser;
- `RIPE_ATLAS_API_KEY` — server-side only; needs only "Schedule a new measurement" (and optionally "Get information about your credits");
- `TELEGRAM_BOT_TOKEN` — server-side only; the bot needs only the right to post in its channels.

M-Lab, APNIC, Access Now STOP, OONI, RIPE (public data), IODA, Tor, Psiphon statistics, Censored Planet, Citizen Lab, PeeringDB, IHR, GDELT and passive RIPE RIS Live integration paths do not require stored credentials.

Commits in this repository use the maintainer's anonymous GitHub address; personal e-mail addresses, home paths and IP addresses must never appear in commits or files.

## Network exposure

Default bind address is `127.0.0.1`. For production Internet exposure:

1. keep Node on loopback/private networking where practical;
2. terminate HTTPS at a maintained reverse proxy/managed ingress;
3. apply access control if the dashboard is operationally sensitive;
4. rate-limit public requests at the proxy (the server also limits new Overview computations, new reports and unique lookups per visitor address; set `TRUST_PROXY=1` behind exactly one proxy so it sees real addresses). The server's own requests to `/api/overview` (feed, widget, reports, sources page) carry a key made at each start and are not charged to any visitor;
5. set `PUBLIC_URL`: links that are stored or sent to others (feed, open data, reports, Telegram posts) use it, or the server's own address, never the request's `Host` header; Telegram posts need it;
6. never serve the public dashboard from a home connection: visitors see the address of the machine that answers;
7. log only metadata needed for operations and avoid credentials/raw sensitive probe identities.

## Browser security headers

The dashboard and every page (reports, updates, tools, sources) set:

- same-origin Content-Security-Policy (`script-src 'self'`, `connect-src 'self'` on the dashboard, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`);
- `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` without camera, microphone, location, payment or USB;
- `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Resource-Policy: same-origin`;
- `Strict-Transport-Security` once `PUBLIC_URL` is https.

JSON answers are `same-origin` too; only what is meant for other sites (`/widget.svg`, `/feed.xml`, `/data/*.json`) is `cross-origin`, the open data also with `Access-Control-Allow-Origin: *`. The server cuts off requests whose headers take longer than 20 s or whose request takes longer than 30 s to arrive.

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

Active checks from probes in Iran are off by default. The collector's RIPE Atlas and Globalping paths need `MONITOR_COLLECTOR=1` and `ACTIVE_MEASUREMENTS_ENABLED=true` (RIPE Atlas also a key and credits); the protected on-demand route `/api/globalping/measure` needs `GLOBALPING_ACTIVE_ENABLED=true` and a server-only `GLOBALPING_CONTROL_KEY`.

The probes belong to private hosts in Iran. Targets are therefore limited to services whose use is not punishable in Iran (the six mass services and the AI services, fixed in `lib/active-collector.mjs` and guarded by a test); news, opposition and circumvention sites are never targets.

Controls include:

- only probes on networks registered in Iran;
- DNS lookups and TLS/HTTPS handshakes only, never page content; at most one round every six hours;
- a credit check before each RIPE Atlas round;
- maximum five probes per on-demand Globalping request, measurement-type allowlist and server-side hourly rate limit;
- rejection of localhost/private/link-local/CGNAT/reserved/documentation destinations and URL credentials.

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

Some Iranian networks are registered to private persons. Registry names are shown only when they name an organisation (`publicNetworkName` in `lib/asn-names.mjs`), in every table, API answer and log; otherwise the network appears by its number.

The dashboard keeps its state under `var/`: the local measurement store (`var/store/monitor.db`, only the fields the dashboard needs, never raw measurement bodies), the last good answer per source, finished reports, feed entries and history. None of it identifies measurement participants, and `var/` is never served.

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

The separate live-source workflow performs credential-free public-source acceptance and a bounded passive RIS Live subscription handshake. It runs only when started by hand, does not enable active measurements and does not print server-side credentials.
