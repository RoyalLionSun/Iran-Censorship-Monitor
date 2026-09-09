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
```

## Why the browser does not call upstream APIs directly

External requests are server-side to provide:

- Iran-only input scoping and validation;
- consistent timeout/cache/failure behavior;
- optional credential protection;
- strict browser `connect-src 'self'` CSP;
- normalized payloads and explicit source-specific no-data/error states;
- bounded concurrency/rate controls;
- one place to enforce provenance and measurement safety boundaries.

## Evidence families

```text
Censorship/interference      OONI, Censored Planet
Data plane/connectivity      RIPE Atlas, IODA, Cloudflare Radar
Performance context          M-Lab NDT
Protocol/deployment context  Radar protocol distributions, APNIC IPv6
Control plane                RIPEstat / RIPE RIS
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
- RIPEstat BGP update drilldown is limited to the final 48 hours and 250 records and exposes historical horizon limitations.
- M-Lab requests use only Iran country or Iran+selected-ASN aggregate paths.
- APNIC requests use Iran economy or Iran+selected-ASN IPv6 datasets; raw sample counts are retained.
- Access Now STOP is filtered to Iran and selected-window overlap; `Ongoing` and `Unknown` status are not conflated.

## Performance and protocol context

### M-Lab

M-Lab NDT daily aggregate statistics contain repeated daily summary fields across histogram buckets. `lib/mlab.mjs` collapses those buckets into one daily point and only calculates a relative recent-vs-baseline comparison when its sample gate is met. The result remains performance context.

### APNIC Labs IPv6

`lib/apnic.mjs` exposes raw IPv6 experiment counts and raw capability/preference percentages plus 30-day smoothed context. The raw `seen` count is never replaced by a smoothing-derived pseudo-sample count. A protocol shift alone is not a censorship classification.

## Contextual incident ingestion

`lib/accessnow.mjs` parses the official public STOP spreadsheet export. Required schema fields are validated before ingestion. Records include source URLs, shutdown type/extent, status, affected platforms/networks and contextual metadata. Records are explicitly marked `independentTechnicalVote: false`.

The currently published STOP corpus covers records through 2025. Later selected windows can include genuinely `Ongoing` historical records but must not be interpreted as complete coverage of newly starting post-2025 incidents.

## Active measurement safety

Globalping active measurements are disabled unless both explicit enablement and a server-only operator key are configured. Requests are Iran-vantage-only, type-limited, probe-count-limited and server-rate-limited. Private/loopback/link-local/CGNAT/reserved/documentation destinations and URL credentials are rejected.

## State and storage

The server has no database. Upstream responses are cached only in process memory for bounded TTLs.

Manually entered VPN field measurements remain in browser `localStorage`; they are not uploaded and never become national telemetry.

## Build and CI

`npm run build` copies the dependency-free runtime into `dist/`.

Permanent GitHub CI performs:

- `npm ci`;
- `npm run check`;
- production build;
- committed-secret and `.env` checks;
- local `/api/health` and root smoke tests;
- unknown/traversal path 404 checks.

GitHub Actions dependencies are pinned to verified commit SHAs in `.github/workflows/ci.yml`.
