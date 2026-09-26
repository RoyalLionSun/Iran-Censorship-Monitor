# Architecture

Last verified: **2026-09-26**

## Design goal

Iran Censorship Monitor answers, for readers in and outside Iran, what people in Iran can reach on the internet, and keeps every statement traceable to a dated source. The Overview is written for non-technical readers; the Technical analysis keeps control plane, data plane, censorship measurements, performance/protocol context, circumvention and curated incident context separate, so uncertainty and source lineage stay visible.

## Runtime

```text
Browser (public/, service worker keeps the last answer for offline reading)
  |
  | same-origin HTTP
  v
Node.js HTTP server (server.mjs, no third-party runtime dependencies)
  |
  +--> /api/overview            one answer per network and period, from:
  |      +--> OONI (via the local store where it covers the period, else the OONI API)
  |      +--> Cloudflare Radar (token), IODA, RIPE Atlas, RIPEstat / RIPE RIS, RPKI
  |      +--> Tor Metrics, Psiphon Conduit statistics, APNIC Labs, M-Lab NDT
  |      +--> Censored Planet, PeeringDB, Internet Health Report, CAIDA ASRank
  |      +--> Internet Society Pulse (token), independent checks from the local store
  |      \--> claim-based interpretation (lib/interpretation.mjs) + source health
  |
  +--> /api/ooni/domains, /api/ooni/measurements, /api/ooni/domain-measurements
  +--> /api/circumvention, /api/outages, /api/history, /api/providers, /api/routing-updates
  +--> /api/stop, /api/intelligence, /api/targets, /api/asn-registry, /api/asn-coverage
  +--> /api/globalping/probes, /api/globalping/measure (protected, off by default)
  +--> /api/config, /api/health
  +--> /updates, /feed.xml        daily "what changed" entries (optional Telegram post)
  +--> /reports, /report          weekly (Saturday to Friday) and monthly reports
  +--> /widget.svg                embeddable status image
  +--> /data/latest.json, /data/YYYY-MM-DD.json, /data/index.json   open daily data (docs/API.md)
  \--> static files in public/

Collector (inside the server, off unless MONITOR_COLLECTOR=1)
  +--> OONI API, hourly small pages ---------------+
  +--> OONI raw files (OONI_S3_ENABLED=1, heavy) --+--> var/store/monitor.db (node:sqlite)
  +--> RIPE Atlas DNS/TLS (key + credits) --------+
  \--> Globalping DNS/HTTPS -----------------------+
       (active paths need ACTIVE_MEASUREMENTS_ENABLED=true)

Operator processes (not started by the server)
  +--> scripts/collect-ris-live.mjs, scripts/collect-bgpstream-routeviews.mjs
  +--> scripts/fetch-iran-asn-inventory.mjs --> var/asn-coverage/latest.json
  \--> scripts/active-round.mjs (a hand-started test round of the active paths)
```

## Browser composition

`public/app.js` is a small loader. `public/app-core.js` holds the source cards, charts and drill-down; `public/v18-situation.js` composes the Overview (headline, sections in order of importance, jump bar) and moves the technical material into the Technical analysis view without fetching it again. Dated context (who decides what is blocked, privileged access) comes from `public/context-items.js`; the further services and their domains from `public/service-findings.js`. All interface text is in `public/locales/` (English and Farsi); the page switches direction for Farsi.

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

Only measurements taken inside networks registered in Iran count as evidence of what people in Iran can reach.

```text
Access (inside Iranian networks)   OONI; independent checks from RIPE Atlas and Globalping probes
Traffic and outages                 Cloudflare Radar (traffic from Iranian networks)
Connectivity context                IODA, RIPE Atlas ping, RIPEstat / RIPE RIS (+ RIS Live, Route Views)
Outside-in context only             Censored Planet (never evidence of access)
Performance / protocol context      M-Lab NDT, Radar protocol distributions, APNIC Labs
Ways around the filter              OONI circumvention tests; Tor Metrics, Psiphon Conduit, APNIC WARP (usage)
Topology                            PeeringDB, IHR AS Hegemony, CAIDA ASRank, RPKI
Test inventory                      Citizen Lab Iran list
Curated incidents and documents     Internet Society Pulse, Access Now STOP, dated primary sources
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

`lib/shutdown-context.mjs` compares STOP and Pulse only as analyst context. It emits `possibleSameIncident:true` only when date intervals overlap and both records normalize to the same broad scope class (`national`, `regional`, or `service`). It always emits `automaticMerge:false`; unknown/conflicting scope or date non-overlap does not correlate. The detailed contract is documented in `docs/design-records/SHUTDOWN_CONTEXT.md`.

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

Active checks (RIPE Atlas, Globalping) run only when `ACTIVE_MEASUREMENTS_ENABLED=true` and the collector are set, and only from probes on networks registered in Iran. Targets are limited to services whose use is not punishable in Iran: the six mass services every round and the AI services in rotation (`lib/active-collector.mjs`); news, opposition and circumvention sites are never targets. Only DNS lookups and TLS/HTTPS handshakes, never page content, at most every six hours. The protected `/api/globalping/measure` route additionally needs a server-only operator key; private, loopback, reserved and credential-bearing destinations are rejected.

## State and storage

- `var/store/monitor.db` (node:sqlite): measurements written by the collector paths, only the fields the dashboard needs. The server answers from it where it covers the requested period.
- `var/last-good/entries/`: the last good answer per source and scope, one file each (only changed answers are written), with per-source quotas, so a rate-limited or failing source shows its latest data with a date instead of "no data".
- `var/feed/`, `var/data/`, `var/reports/`, `var/history/`, `var/anatomy/`: daily entries, open daily data, finished weekly and monthly reports, monthly service history and shutdown timelines, each written once.
- `var/asn-coverage/`, `var/asn-directory/`, `var/iran-asns.json`: network inventory snapshots; `var/ris-live/`: the optional routing collector (seven days by default, at most 30).
- In-process caches are bounded (`FETCH_CACHE_LIMIT`). `var/` is Git-ignored and never served.
- Manually entered VPN field measurements stay in the reader's browser (`localStorage`) and are never uploaded.

## Build and CI

`npm run build` copies the dependency-free runtime, operator scripts and verification tooling into `dist/`.

Permanent GitHub CI performs:

- `npm ci`;
- `npm run check`;
- production build;
- committed-token/private-key and `.env` checks;
- local `/api/health` and root smoke tests;
- unknown/traversal path 404 checks.

The separate live-source acceptance workflow (`npm run verify:public`, started by hand) verifies the real server API against credential-free public sources and performs a bounded passive RIPE RIS Live subscription handshake. Active measurements stay off during this gate.

GitHub Actions dependencies are pinned to verified commit SHAs.
