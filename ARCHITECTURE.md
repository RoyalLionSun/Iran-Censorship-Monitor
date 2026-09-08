# Architecture

Last verified: **2026-09-08**

## Design goal

The application is a monitoring/work surface, not an editorial or campaign page. It prioritizes state, scope, source agreement, measurement provenance, and uncertainty above decorative content.

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
  |      +--> Tor Metrics
  |      +--> Cloudflare Radar (token gated)
  |      \--> multi-source assessment
  |
  +--> /api/circumvention --> OONI Tor/Psiphon/Signal/WhatsApp/Telegram
  +--> /api/ooni/*        --> OONI explorer/detail support
  +--> /api/providers     --> OONI + RIPE Atlas per selected Iranian ASN
  +--> /api/config        --> static source/ASN registry and capabilities
  \--> static files       --> public/
```

## Why the browser does not call upstream APIs directly

All external API requests are made server-side. This provides:

- one place for input validation and Iran-only scoping;
- an in-memory cache and request timeout;
- protection of the optional Radar token;
- a strict browser Content-Security-Policy using `connect-src 'self'`;
- normalized API payloads for the UI;
- explicit partial-source failure handling.

## Frontend

`public/index.html`, `public/styles.css`, and `public/app.js` form a dependency-free client.

Primary areas:

1. sticky monitoring header;
2. scope/date/test filters;
3. multi-source assessment strip;
4. compact KPI grid;
5. OONI anomaly timeline;
6. corroboration/source review;
7. RIPE Atlas RTT/loss chart;
8. Cloudflare Radar Iran/ASN traffic, outage, traffic-anomaly and BGP context;
9. IODA routing/probing signals;
10. Tor direct/bridge estimates;
11. OONI circumvention/messaging matrix;
12. event feed;
13. provider/ASN comparison;
14. local VPN field-measurement calculator;
15. OONI raw measurement explorer;
16. source provenance register.

The layout uses a 12-column responsive grid and compact typography suitable for 1920×1080 and 2560×1440 monitoring workstations.

## Internal API

### `GET /api/health`

Process health, current timestamp, Radar configuration state.

### `GET /api/config`

Country restriction, monitored ASN registry, source registry, default date range, supported OONI tests, and live-capability flags.

### `GET /api/overview`

Query parameters:

- `asn=AS...` or `ALL`
- `since=YYYY-MM-DD`
- `until=YYYY-MM-DD`
- `testName=<supported OONI test>`
- optional `target=https://...` for `web_connectivity`

Returns OONI, RIPE Atlas, IODA, Tor Metrics, optional Cloudflare Radar, and a derived corroboration assessment. Sources fail independently.

Radar query scope is enforced server-side: HTTP/outage/traffic-anomaly requests use `location=IR` plus the selected ASN when present; BGP hijack queries use `involvedAsn` for ASN scope or `involvedCountry=IR` for country scope.

### `GET /api/circumvention`

Queries OONI Tor, Psiphon, Signal, WhatsApp, and Telegram test observations for the selected scope.

### `GET /api/providers`

Runs OONI and RIPE Atlas collection for the ten curated Iranian networks. Concurrency is capped at three providers to avoid unnecessary upstream load.

### `GET /api/ooni/measurements`

Loads a small list of OONI measurement IDs for inspection.

### `GET /api/ooni/measurement/:uid`

Loads one OONI measurement using the current singular measurement endpoint, with metadata endpoint fallback.

## Validation boundaries

- Date ranges are ISO dates and capped by adapter-specific limits.
- This deployment is hard-restricted to country code `IR`.
- ASN input is normalized and validated.
- OONI target input accepts only absolute `http:`/`https:` URLs.
- OONI list requests are capped at 1000 rows and truncation is surfaced.
- RIPE probe discovery follows API pagination with a 10-page/5000-probe safety cap; if that cap is reached, `probeListTruncated` is surfaced.
- External requests have a 12-second timeout and shared in-memory cache.

## Assessment model

`lib/assessment.mjs` combines only independent sources suitable for disruption corroboration:

- OONI
- RIPE Atlas
- Cloudflare Radar (when configured; country/ASN scope aligned with the selected dashboard scope)
- IODA

Tor Metrics is deliberately excluded from automated disruption scoring and shown as contextual evidence only.

Possible states:

- `insufficient-data`
- `observed`
- `elevated`
- `corroborated`
- `strongly-corroborated`

The output is explicitly a **measurement-signal assessment**, not political attribution, intent determination, or proof of national-scale impact beyond the selected scope.

## State and storage

The server has no database and stores no user submissions. Upstream payloads are cached only in process memory for the configured TTL.

Manually entered VPN field measurements are stored exclusively in the browser's `localStorage`. They are not uploaded to the server and are not mixed into national monitoring signals.

## Build

`npm run build` creates `dist/` containing only the runtime files:

- `public/`
- `lib/`
- `data/`
- `server.mjs`
- `package.json`
- `.env.example`
- build metadata

## v1.1 evidence architecture

The runtime deliberately keeps these evidence families distinct:

```text
OONI + Censored Planet                 censorship/interference measurements
RIPE Atlas + IODA + Cloudflare Radar   data-plane/connectivity signals
RIPEstat / RIPE RIS                    BGP control plane
Globalping                             Iran vantage inventory / protected active probing
Tor Metrics                            circumvention context and transport bounds
PeeringDB + IHR AS Hegemony            topology/dependency context
Citizen Lab                            test-target inventory
Pulse + curated OSINT + GDELT          contextual intelligence, never sensor votes
```

The correlation layer may identify **control/data-plane divergence**, but contextual sources do not increase the independent-technical-source count. This prevents double counting when an article or curated shutdown record ultimately derives from OONI, Cloudflare, IODA or another sensor already present.

### Additional internal API (v1.1)

- `GET /api/routing-updates` — selected-ASN RIPEstat BGP drilldown, max 48 h effective window and 250 records.
- `GET /api/globalping/probes` — passive Iran probe inventory.
- `POST /api/globalping/measure` — disabled-by-default, authenticated/rate-limited Iran-only active test.
- `GET /api/globalping/measurement/:id` — read active-measurement result.
- `GET /api/targets` — Citizen Lab Iran target inventory/search.
- `GET /api/intelligence` — curated source registry plus professional-domain GDELT discovery.

