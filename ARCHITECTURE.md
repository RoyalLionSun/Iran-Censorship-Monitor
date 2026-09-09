# Architecture

Last verified: **2026-09-09**

## Design goal

Iran Censorship Monitor is a measurement/intelligence work surface, not an editorial page and not a generic uptime monitor. It keeps control plane, data plane, censorship measurements, performance/protocol context, circumvention and human-rights/OSINT context separable so uncertainty and source lineage remain visible.

## Runtime

```text
Browser
  |
  | same-origin HTTP
  v
Node.js HTTP server (server.mjs)
  |
  +--> /api/overview
  |      +--> OONI
  |      +--> RIPE Atlas
  |      +--> IODA
  |      +--> Cloudflare Radar (token gated)
  |      +--> Tor Metrics
  |      +--> M-Lab NDT
  |      +--> APNIC Labs IPv6
  |      +--> RIPEstat / RIPE RIS
  |      +--> Globalping passive inventory
  |      +--> Censored Planet
  |      +--> PeeringDB
  |      +--> Internet Health Report
  |      +--> Internet Society Pulse (token gated)
  |      \--> assessment from approved technical corroboration inputs only
  |
  +--> /api/circumvention       --> OONI Tor/Psiphon/Signal/WhatsApp/Telegram
  +--> /api/routing-updates     --> bounded RIPEstat BGP update drilldown
  +--> /api/globalping/probes   --> passive Iran probe inventory
  +--> /api/globalping/measure  --> protected active measurement (disabled by default)
  +--> /api/globalping/measurement/:id
  +--> /api/targets             --> Citizen Lab Iran list
  +--> /api/stop                --> Access Now #KeepItOn STOP Iran incident context
  +--> /api/intelligence        --> STOP + curated registry + GDELT discovery
  +--> /api/providers           --> bounded provider comparison
  +--> /api/ooni/*              --> raw measurement explorer
  +--> /api/config
  +--> /api/health
  \--> static files in public/

Operator process (not started by server)
  |
  +--> scripts/collect-ris-live.mjs
          +--> RIPEstat announced-prefix scope
          +--> RIPE RIS Live HTTP JSON stream
          \--> var/ris-live/*.jsonl + status-ASxxxxx.json
```

## Browser composition

`public/app.js` is a small loader. The established dashboard application remains in `public/app-core.js`. `public/v11-context.js` adds the M-Lab/APNIC/STOP presentation and context export.

The v1.1 context layer observes/clones the same successful same-origin API responses used by the core application rather than issuing a second set of upstream source requests. This keeps presentation additions separate from the assessment logic and avoids duplicate source load.

## Why the browser does not call upstream APIs directly

External requests are server-side to provide:

- Iran-only input scoping and validation;
- consistent timeout/cache/failure behavior;
- optional credential protection;
- strict browser `connect-src 'self'` CSP;
- normalized payloads and explicit source-specific no-data/error states;
- bounded concurrency/rate controls;
- one place to enforce provenance and measurement safety boundaries.

The RIS Live collector is also server/operator side and uses a fixed public RIPE endpoint with a validated prefix subscription. Runtime JSONL output is local and is not exposed through a browser route.

## Evidence families

```text
Censorship/interference      OONI, Censored Planet
Data plane/connectivity      RIPE Atlas, IODA, Cloudflare Radar
Performance context          M-Lab NDT
Protocol/deployment context  Radar protocol distributions, APNIC IPv6
Control plane                RIPEstat / RIPE RIS + optional RIPE RIS Live collector
Vantage inventory            Globalping
Circumvention context        Tor Metrics + contextual specialist reporting
Topology/chokepoints         PeeringDB, IHR AS Hegemony
Test inventory               Citizen Lab
Curated shutdown incidents   Access Now STOP, Internet Society Pulse
OSINT discovery              curated source registry, GDELT
```

These labels are architectural boundaries, not confidence rankings.

## Assessment model

`lib/assessment.mjs` combines only source observations explicitly approved for disruption corroboration. Existing inputs include OONI, RIPE Atlas, IODA and eligible Cloudflare Radar observations, with RIPEstat used for the separate control/data-plane divergence analysis.

The following are intentionally **not** additional independent censorship votes:

- M-Lab throughput/RTT;
- APNIC IPv6 capability/preference;
- RIPE RIS Live route events;
- Tor/circumvention usage;
- PeeringDB/IHR topology;
- Globalping probe presence;
- Access Now STOP;
- Internet Society Pulse;
- GDELT/articles;
- contextual specialist reports.

STOP may cite OONI, Radar, IODA or other sensors already present. The adapter therefore preserves evidence URLs and maps recognized root-source lineage rather than double-counting the incident record.

## Iran scoping and validation

- Country is fixed to `IR` for runtime measurement adapters.
- ASN input is normalized and validated.
- General query ranges are ISO dates and capped at 120 days; individual adapters may apply stricter windows.
- OONI target filters accept absolute HTTP/HTTPS URLs only.
- OONI list truncation is surfaced and truncated anomaly rates are excluded from assessment.
- RIPE Atlas probe discovery follows pagination with a safety cap.
- RIPE Atlas daily history uses one `ping-stats` request per selected probe with bounded concurrency because the live service currently rejects multi-probe requests with HTTP 400.
- RIPE Atlas `partial` coverage remains visible but is excluded from automatic corroboration/divergence decisions.
- RIPEstat BGP update drilldown is limited to the final 48 hours and 250 records and exposes historical horizon limitations.
- M-Lab requests use only Iran country or Iran+selected-ASN aggregate paths.
- APNIC requests use Iran economy or Iran+selected-ASN IPv6 datasets; raw sample counts are retained.
- Access Now STOP is filtered to Iran and selected-window overlap; `Ongoing` and `Unknown` status are not conflated.
- RIPE RIS Live accepts only an explicitly selected ASN from the Iran ASN registry. Default scope is that ASN's currently announced RIPEstat prefixes; empty or oversized scope fails closed. Automatic subscriptions are capped at 200 prefixes and 12,000 encoded header bytes.

## Performance and protocol context

### M-Lab

M-Lab NDT daily aggregate statistics contain repeated daily summary fields across histogram buckets. `lib/mlab.mjs` collapses those buckets into one daily point and only calculates a relative recent-vs-baseline comparison when its sample gate is met. The result remains performance context.

A concrete missing aggregate object returned as GCS `404 NoSuchKey` is represented as `no_data` for that exact scope. Network, parser, DNS/TLS and server failures remain errors; no ASN-to-country fallback is used.

### APNIC Labs IPv6

`lib/apnic.mjs` exposes raw IPv6 experiment counts and raw capability/preference percentages plus 30-day smoothed context. The raw `seen` count is never replaced by a smoothing-derived pseudo-sample count. A protocol shift alone is not a censorship classification.

## Contextual incident ingestion

`lib/accessnow.mjs` parses the official public STOP spreadsheet export. Required schema fields are validated before ingestion. Records include source URLs, shutdown type/extent, status, affected platforms/networks and contextual metadata. Records are explicitly marked `independentTechnicalVote: false`.

The currently published STOP corpus covers records through 2025. Later selected windows can include genuinely `Ongoing` historical records but must not be interpreted as complete coverage of newly starting post-2025 incidents.

## Passive continuous routing collection

`lib/rislive.mjs` and `scripts/collect-ris-live.mjs` provide a separate operator-controlled RIPE RIS Live collector.

Properties:

- public HTTP JSON stream using `X-RIS-Subscribe`;
- `UPDATE` messages only;
- prefix-scoped subscription including more-specific announcements/withdrawals;
- ASN must be registered in `data/asns.json`;
- default prefixes come from RIPEstat announced-prefix data;
- no silent prefix truncation;
- operator may provide an explicit narrower prefix file;
- announcement and withdrawal events preserve timestamp, RRC/peer provenance, path/next-hop fields where available;
- events carry `evidenceRole: routing-control-plane` and `independentCensorshipVote: false`;
- reconnect uses bounded deterministic backoff;
- daily JSONL rotation and bounded retention.

The collector is passive and is not started by `server.mjs`.

## Active measurement safety

Globalping active measurements are disabled unless both explicit enablement and a server-only operator key are configured. Requests are Iran-vantage-only, type-limited, probe-count-limited and server-rate-limited. Private/loopback/link-local/CGNAT/reserved/documentation destinations and URL credentials are rejected.

## State and storage

The dashboard server has no database. Upstream responses are cached only in process memory for bounded TTLs.

Manually entered VPN field measurements remain in browser `localStorage`; they are not uploaded and never become national telemetry.

The optional RIS Live collector intentionally persists local control-plane events under `var/ris-live/`. It writes one JSONL file per ASN/day plus a status file. Default retention is seven days; maximum configured retention is 30 days. `var/` is Git-ignored and is not served by the dashboard.

## Build and CI

`npm run build` copies the dependency-free runtime, operator scripts and verification tooling into `dist/`.

Permanent GitHub CI performs:

- `npm ci`;
- `npm run check`;
- production build;
- committed-token/private-key and `.env` checks;
- local `/api/health` and root smoke tests;
- unknown/traversal path 404 checks.

The separate live-source acceptance workflow verifies the real server API against credential-free public sources and performs a bounded passive RIPE RIS Live subscription handshake. Active Globalping remains disabled during this gate.

GitHub Actions dependencies are pinned to verified commit SHAs.
