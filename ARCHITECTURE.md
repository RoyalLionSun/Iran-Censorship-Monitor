# Architecture

Last verified: **2026-09-12**

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
  |      +--> Internet Society Pulse (token gated, selected-window context)
  |      \--> claim-based interpretation + source-health/technical observations
  |
  +--> /api/circumvention       --> OONI Tor/Psiphon/Signal/WhatsApp/Telegram
  +--> /api/routing-updates     --> bounded RIPEstat BGP update drilldown
  +--> /api/globalping/probes   --> passive Iran probe inventory
  +--> /api/globalping/measure  --> protected active measurement (disabled by default)
  +--> /api/globalping/measurement/:id
  +--> /api/targets             --> Citizen Lab Iran list
  +--> /api/stop                --> Access Now #KeepItOn STOP Iran incident context
  +--> /api/intelligence        --> STOP + Pulse + conservative shutdown correlation + GDELT discovery
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

`public/app.js` is a small loader. The established dashboard application remains in `public/app-core.js`. `public/v11-context.js` adds the M-Lab/APNIC/STOP presentation and context export. `public/v18-situation.js` composes the unreleased v1.9 default Overview and moves the established source cards, charts and drill-down into the Technical analysis view without refetching data.

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

`lib/interpretation.mjs` is the public interpretation contract. It evaluates connectivity, interference, routing, quality and shutdown claims separately. Each claim has independent severity, confidence, verification and coverage fields; attribution is a separate object. The summary deliberately has no global severity and no numeric health score.

`lib/assessment.mjs` retains source observations, source health and the bounded control-/data-plane comparison for technical compatibility, then exposes the claim model as `assessment.interpretation`. It no longer merges OONI, RIPE, IODA or Radar into a global critical/corroborated state. Coverage currently uses eligible source-family counts within a dimension, but does not prove per-event time, scope or evidence-lineage alignment. Confidence and verification therefore do not promote multi-source event claims automatically. Counts never increase severity.

The real `index.html` → `app.js` → `app-core.js` loading path emits a direct overview lifecycle event. Missing/legacy `assessment.interpretation` and failed requests show explicit EN/FA error states instead of an indefinite loading screen. Browser verification has a dedicated real-app deterministic gate in addition to the older presentation fixtures. A Node.js process that predates changed server-side module files must be restarted to load the new interpretation contract; a static-JS refresh alone cannot update cached server modules. Automatic nationwide shutdown establishment is disabled pending per-incident time, scope and lineage verification.

IODA and generic Radar event counts are observations, not impact values. Only suitable source-native impact/scope metadata may determine connectivity severity. OONI source-native confirmation confirms only the measured blocking claim. Censored Planet `partial` data remains visible but is excluded from automatic support/confidence; only fully `observed` results are eligible. Missing data never becomes a normal state.

The complete normative contract, including the five axes, shutdown requirements and negative-claim coverage rule, is in [INTERPRETATION.md](INTERPRETATION.md).

The following are intentionally **not** additional independent censorship votes:

- M-Lab throughput/RTT;
- APNIC IPv6 capability/preference;
- RIPE RIS Live route events;
- Tor/circumvention usage;
- PeeringDB/IHR topology;
- Globalping probe presence;
- Access Now STOP;
- Internet Society Pulse;
- STOP/Pulse correlation candidates;
- GDELT/articles;
- contextual specialist reports.

STOP may cite OONI, Radar, IODA or other sensors already present. The adapter therefore preserves evidence URLs and maps recognized root-source lineage rather than double-counting the incident record. Pulse is likewise contextual; a STOP/Pulse overlap never creates a new independent vote.

## Iran scoping and validation

- Country is fixed to `IR` for runtime measurement adapters.
- ASN input is normalized and validated.
- General query ranges are ISO dates and capped at 120 days; individual adapters may apply stricter windows.
- OONI target filters accept absolute HTTP/HTTPS URLs only.
- OONI list truncation is surfaced and truncated anomaly rates are excluded from assessment.
- RIPE Atlas probe discovery follows pagination with a safety cap.
- RIPE Atlas daily history uses one `ping-stats` request per selected probe with bounded concurrency because the live service currently rejects multi-probe requests with HTTP 400.
- RIPE Atlas `partial` coverage remains visible but is excluded from automatic corroboration/divergence decisions.
- Historical RIPEstat routing-status requests include the selected-window timestamp; returned alignment is exposed as `aligned`, `latest` or `unknown`.
- Unknown BGP time alignment lowers routing confidence and suppresses control-/data-plane divergence.
- RIPEstat BGP update drilldown is limited to the final 48 hours and 250 records and exposes historical horizon limitations.
- M-Lab requests use only Iran country or Iran+selected-ASN aggregate paths.
- APNIC requests use Iran economy or Iran+selected-ASN IPv6 datasets; raw sample counts are retained.
- Access Now STOP is filtered to Iran and selected-window overlap; `Ongoing` and `Unknown` status are not conflated.
- Internet Society Pulse accepts only explicit Iran identifiers (`IR`, `Iran`, `Iran (Islamic Republic of)`), validates required start timestamps and selected-window overlap, and fails closed on malformed Iran records or invalid intervals.
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

`lib/pulse.mjs` provides the token-gated current Internet Society Pulse shutdown context for the same selected window. It preserves verification level, cause, type and affected-region context, rejects malformed Iran records, deduplicates identical normalized records and marks every event `independentTechnicalVote: false`.

`lib/shutdown-context.mjs` compares STOP and Pulse only as analyst context. It emits `possibleSameIncident:true` only when date intervals overlap and both records normalize to the same broad scope class (`national`, `regional`, or `service`). It always emits `automaticMerge:false`; unknown/conflicting scope or date non-overlap does not correlate. The detailed contract is documented in `SHUTDOWN_CONTEXT.md`.

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
