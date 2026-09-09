# Changelog

## 1.1.0 — development — 2026-09-09

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
- added APNIC Labs Iran/ASN IPv6 capability/preference context with preserved raw experiment counts.

### Shutdown / intelligence context

- added token-gated Internet Society Pulse shutdown context;
- added curated Iran-specialist source registry and allowlisted GDELT professional-report discovery;
- added machine-readable Access Now #KeepItOn STOP Iran incident ingestion from the official public dataset;
- preserved STOP evidence links and recognized underlying sensor lineage;
- explicitly marks STOP as contextual and never an independent technical vote;
- exposes the STOP dataset publication horizon through 2025 rather than implying complete 2026 incident coverage.

### Safety and integrity

- active Globalping remains disabled by default, control-key protected, Iran-vantage-only, target-restricted and rate-limited;
- no province/VPN national status is fabricated;
- no risky in-country trigger/fuzzing workflow is included;
- M-Lab slowdown and APNIC IPv6 changes remain contextual rather than automatic censorship/throttling claims;
- source review rejected scraping Google Transparency Traffic because Google does not provide a supported data download for that feature;
- Proton/Psiphon/Filterwatch/ASL19/NetBlocks remain high-value contextual sources where no stable continuous public feed was established.

### Verification / maintenance

- deterministic suite expanded from 42 tests to **55 tests**, all passing on the APNIC integration commit;
- production build, secret scan and runtime/404/traversal smoke tests pass;
- GitHub Actions dependencies updated from deprecated v4 action runtimes to current exact pinned action commits as part of the release-gate maintenance pass.

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
