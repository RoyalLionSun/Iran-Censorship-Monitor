# Changelog

## 1.1.0 — development — 2026-09-08

- shifted the product model from generic Internet monitoring toward Iran-specific censorship intelligence;
- added Censored Planet GraphQL/CenAlert, RIPEstat/RIS, Globalping, Citizen Lab targets, PeeringDB, IHR AS Hegemony, Pulse context and GDELT professional OSINT discovery;
- added control/data-plane divergence classification for high-BGP-visibility / severe-user-path-disruption patterns;
- added bounded on-demand BGP announcements/withdrawals with explicit pre-2024 data-horizon semantics;
- added Tor bridge transport lower/upper bounds and Cloudflare Radar protocol distributions;
- added disabled-by-default protected active measurement controls;
- expanded the dashboard with routing, interference, vantage coverage, topology, protocol mix, targets and intelligence panels;
- maintained strict separation between technical sensor votes and contextual/curated OSINT;
- offline deterministic suite: 42 tests passing; production build succeeds.

## 1.0.1 — 2026-09-08

- enabled the Cloudflare Radar integration path for a real server-side Radar Read token;
- added consistent Iran + selected-ASN scoping for HTTP traffic, outages and traffic anomalies;
- retained correct `involvedAsn` / `involvedCountry=IR` filtering for BGP hijack events;
- added range-aware Radar aggregation (15m / 1h / 1d / 1w);
- normalized Radar traffic-anomaly records instead of forwarding raw provider payloads;
- exposed Radar traffic-confidence metadata and anomaly counts in the dashboard;
- added Radar traffic anomalies to the incident feed;
- added a read-only `npm run verify:radar` acceptance check that never prints the credential;
- added four deterministic Radar tests; total offline suite is now 21 tests;
- no API token is included in source, Git or release artifacts.

## 1.0.0 — 2026-09-08

### Rebuilt

- reconstructed the incomplete prototype export as a standalone Node.js 20+ application;
- removed runtime dependency on non-exported prototype/tRPC framework modules;
- preserved the full original prototype export under `legacy/prototype-export/`.

### UI

- replaced the campaign/editorial presentation with a dense NOC/intelligence dashboard;
- reduced headline scale and vertical whitespace;
- moved filters, status, KPIs, and source confidence above the fold;
- added responsive 12-column monitoring grid;
- added explicit no-data/error/token-required states.

### Data

- retained and hardened OONI integration;
- retained and hardened RIPE Atlas integration;
- retained Cloudflare Radar as a real token-gated source;
- added IODA live connectivity/outage integration;
- added Tor Metrics direct/bridge context;
- added provider/ASN comparison;
- added OONI circumvention/messaging observations.

### Integrity

- removed simulated September 2022 dashboard values; the September preset now performs a real historical query;
- removed prefilled VPN demo profiles/values;
- added OONI 1000-row truncation guard and excluded truncated anomaly rates from automated assessment;
- added RIPE Atlas probe pagination and safety-cap disclosure;
- separated Tor context from automated disruption scoring;
- prevented claims of live WireGuard/OpenVPN national measurement without an actual probe fleet.

### Runtime/security

- eliminated third-party npm runtime dependencies;
- added `.env` loading without a package dependency;
- added response caching/timeouts and provider-query concurrency limits;
- added strict Content-Security-Policy and basic browser security headers;
- added production documentation and deterministic tests.
