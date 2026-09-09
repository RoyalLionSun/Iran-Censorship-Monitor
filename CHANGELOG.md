# Changelog

## 1.1.0 — 2026-09-09

### Evidence architecture

- shifted the product from generic Internet monitoring toward Iran-specific censorship intelligence;
- separated censorship/interference, data plane, control plane, performance, protocol/deployment, circumvention, topology and contextual incident/OSINT evidence;
- added control/data-plane divergence classification without treating BGP visibility as proof of user connectivity;
- maintained explicit source provenance/no-data semantics and prevented contextual sources from inflating independent technical corroboration.

### Technical sources

- added Censored Planet GraphQL/CenAlert;
- added RIPEstat / RIPE RIS routing visibility, announced prefixes, neighbours and bounded BGP update drilldown;
- added Globalping Iran passive probe inventory plus protected disabled-by-default active measurements;
- added PeeringDB topology and Internet Health Report AS-Hegemony dependency context;
- added Citizen Lab Iran test-target inventory;
- added Tor bridge-transport low/high bounds;
- added Cloudflare Radar HTTP/IP/TLS protocol distributions;
- added M-Lab NDT Iran/ASN aggregate throughput and minimum-RTT context with explicit sample gating;
- added APNIC Labs Iran/ASN IPv6 capability/preference context with preserved raw experiment counts;
- added an optional passive RIPE RIS Live collector for continuous prefix-scoped announcements/withdrawals.

### RIPE Atlas runtime hardening

- replaced the heavy raw Measurement 1001 historical result path with RIPE Atlas daily `ping-stats` aggregation after live acceptance exposed repeated timeouts;
- discovered through the real public API that `ping-stats` currently rejects multi-probe requests with HTTP 400 `Please specify only one probe`;
- changed the adapter to one bounded `ping-stats` request per selected Iran probe with limited concurrency;
- exposed incomplete probe coverage as `partial` instead of discarding all observations;
- excluded `partial` RIPE Atlas data from automatic corroboration and control/data-plane divergence decisions.

### M-Lab no-data hardening

- distinguished a concrete GCS `404 NoSuchKey` missing aggregate from transport/server/parser failures;
- returns `no_data` only for the exact unpublished aggregate scope;
- retained hard errors for DNS/TLS/network/5xx/parser failures;
- does not silently fall back from selected ASN scope to country scope.

### RIPE RIS Live collector

- added public HTTP JSON stream support using `X-RIS-Subscribe`;
- restricted collection to explicit registered Iran ASNs and validated prefix subscriptions;
- derives default scope from RIPEstat currently announced prefixes;
- caps automatic scope at 200 prefixes and 12,000 subscription bytes;
- fails closed on empty/oversized scope instead of silently truncating or opening a broad firehose;
- supports an explicit narrower operator prefix file;
- preserves announcement/withdrawal, RRC/peer, AS-path and next-hop provenance where available;
- marks all collected events as routing-control-plane evidence with `independentCensorshipVote: false`;
- added bounded reconnect backoff, daily JSONL rotation, status files and 7-day default / 30-day maximum retention;
- keeps runtime output under Git-ignored `var/ris-live/` and separate from the dashboard server process;
- added a passive live acceptance handshake, verified for AS58224 / `217.218.96.0/20` with HTTP 200.

### Shutdown / intelligence context

- added token-gated Internet Society Pulse shutdown context;
- added curated Iran-specialist source registry and allowlisted GDELT professional-report discovery;
- added machine-readable Access Now #KeepItOn STOP Iran incident ingestion from the official public dataset;
- preserved STOP evidence links and recognized underlying sensor lineage;
- explicitly marks STOP as contextual and never an independent technical vote;
- exposes the STOP dataset publication horizon through 2025 rather than implying complete 2026 incident coverage.

### Dashboard / export

- exposed M-Lab performance context in the dashboard without adding it to the censorship assessment;
- exposed APNIC IPv6 capability/preference and raw sample coverage without adding it to the censorship assessment;
- exposed Access Now STOP incident context and evidence lineage in the intelligence view;
- added a separate contextual CSV export so M-Lab/APNIC/STOP context is not semantically mixed with the established technical export;
- preserved the established application core in `public/app-core.js` and added a separate v1.1 context module that observes the same API responses rather than duplicating upstream requests.

### Safety and integrity

- active Globalping remains disabled by default, control-key protected, Iran-vantage-only, target-restricted and rate-limited;
- no province/VPN national status is fabricated;
- no risky in-country trigger/fuzzing workflow is included;
- M-Lab slowdown and APNIC IPv6 changes remain contextual rather than automatic censorship/throttling claims;
- RIPE RIS Live routing events remain control-plane evidence only;
- source review rejected scraping Google Transparency Traffic because no supported downloadable feed is available for the Traffic feature;
- Proton/Psiphon/Filterwatch/ASL19/NetBlocks remain high-value contextual sources where no stable continuous public feed was established.

### Verification / release

- deterministic suite expanded to **73 tests**;
- code-state live public-source acceptance run `34323940251` passed, including the passive RIPE RIS Live handshake;
- PR CI run `34334883650` passed;
- v1.1 was merged to `main` in merge commit `8a66e32947c0d4f82612f03ad72555c87fd56fe6`;
- post-merge `main` CI run `34337684528` passed all tests/checks, production build, secret/private-key scan and runtime smoke tests;
- GitHub Actions dependencies use exact pinned action commits rather than floating major tags;
- release documentation reflects the collector's intentional local JSONL persistence while keeping the ordinary dashboard server database-free and memory-cached.

## 1.0.1 — 2026-09-08

- enabled Cloudflare Radar integration with a real server-side Radar Read token;
- added consistent Iran + selected-ASN scoping for HTTP traffic, outages and traffic anomalies;
- retained correct `involvedAsn` / `involvedCountry=IR` BGP filtering;
- added range-aware Radar aggregation;
- normalized Radar traffic-anomaly records;
- exposed traffic-confidence metadata;
- added read-only `npm run verify:radar` acceptance check;
- kept credentials out of source/Git/build artifacts.

## 1.0.0 — 2026-09-08

### Rebuilt

- reconstructed the incomplete prototype export as a standalone Node.js 20+ application;
- removed runtime dependency on non-exported prototype/tRPC framework modules;
- preserved the original prototype export under `legacy/prototype-export/` for audit/reference only.

### UI / data

- replaced the campaign/editorial presentation with a dense monitoring dashboard;
- added explicit no-data/error/token-required states;
- hardened OONI and RIPE Atlas integration;
- added IODA, Tor Metrics, provider comparison and OONI circumvention/messaging observations.

### Integrity / runtime

- removed simulated September 2022 values and prefilled VPN demo telemetry;
- added OONI API-limit and RIPE Atlas probe-pagination guards;
- separated Tor context from automatic disruption scoring;
- prevented national WireGuard/OpenVPN claims without a real probe fleet;
- eliminated third-party npm runtime dependencies;
- added CSP/security headers, production documentation and deterministic tests.
