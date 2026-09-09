# Current State — v1.1.0 development

Version: **1.1.0-dev**  
Audit date: **2026-09-09**  
Development branch: **`develop/v1.1`**

## Canonical branch model

- `main` is the verified v1.0.1 production baseline.
- `develop/v1.1` is the only current v1.1 development basis.
- Historical bootstrap/transport branches or ZIP/prototype snapshots are audit material only.
- Permanent GitHub CI runs on pushes and pull requests against `main`.

## Implemented measurement and intelligence layers

### Censorship/interference

- OONI Iran-scoped measurements, raw explorer and circumvention/messaging tests;
- Censored Planet GraphQL interference-rate context and CenAlert events.

### Data plane / connectivity

- RIPE Atlas public-probe RTT/loss context;
- IODA routing/active-probing signals and outage events;
- Cloudflare Radar traffic, anomalies and outage annotations when a Radar Read token is configured.

### Performance/degradation context

- M-Lab NDT country/ASN daily aggregate throughput and minimum-RTT data;
- histogram buckets collapsed to one daily summary point rather than counted as independent observations;
- sample-size gate before relative degradation context is calculated;
- no M-Lab performance change is automatically labeled censorship or intentional throttling.

### Control plane

- RIPEstat / RIPE RIS visibility, announced prefixes and observed neighbours;
- bounded on-demand BGP announcement/withdrawal drilldown with AS paths and collector metadata;
- pre-January-2024 drilldown horizon reported as unavailable rather than zero events.

### Protocol/deployment context

- Cloudflare Radar HTTP version, IP version and TLS-version distributions;
- APNIC Labs Iran/ASN IPv6 capability and preference time series;
- APNIC raw experiment sample counts retained alongside raw percentages and 30-day smoothed context;
- APNIC protocol changes are not an independent censorship vote.

### Vantage / circumvention / topology

- Globalping Iran passive probe inventory;
- protected, disabled-by-default Globalping active measurement endpoint;
- Tor direct/bridge estimates and bridge-transport low/high bounds;
- PeeringDB topology context;
- Internet Health Report AS-Hegemony dependency/chokepoint context.

### Targets / shutdown incidents / OSINT

- Citizen Lab Iran test-target inventory;
- Internet Society Pulse token-gated shutdown context;
- Access Now #KeepItOn STOP structured Iran incident ingestion;
- STOP evidence links retained and mapped to known root technical sources when possible;
- STOP records explicitly never count as independent technical votes;
- curated Iran-intelligence source registry and allowlisted GDELT discovery.

## Methodological rules enforced

- No fabricated measurement values or synthetic no-data replacements.
- BGP control-plane visibility is separate from user-path/data-plane reachability.
- OONI/Censored Planet anomalies do not automatically equal confirmed censorship.
- Traffic/performance degradation does not automatically establish government action or throttling intent.
- Context sources do not increase independent-source counts when they cite measurements already present in the dashboard.
- Missing province/VPN/NIN measurements remain missing rather than inferred from country/ASN telemetry.
- Control/data-plane divergence is an inference label with explicit boundaries, not a measured censorship mechanism.

## Source-review result — 2026-09-09

A new professional source review was performed after M-Lab and STOP integration.

**Integrated:** APNIC Labs IPv6 because it adds a distinct client-side protocol-deployment measurement, exposes raw sample counts, supports Iran and ASN granularity, and provides a stable public machine-readable JSON path.

**Retained as context rather than runtime sensors:** Proton VPN Observatory, Psiphon operational reporting, Miaan/Filterwatch, ASL19 and NetBlocks. They provide valuable Iran/circumvention/incident analysis but no stable continuous public machine-readable feed was established that would justify presenting them as live sensors.

**Not scraped:** Google Transparency Report traffic graphs. Google explicitly states that Traffic-feature data is not downloadable, so the project does not reverse-engineer or scrape the visualization as a pseudo-API.

Additional APNIC DNS/protocol datasets remain possible future context sources, but are not added merely to increase source count; provenance overlap and interpretability must be reviewed first.

## Active-measurement safety

Globalping active measurements require explicit server configuration and a server-only control key. Targets are restricted by type/scope and private, loopback, link-local, CGNAT, reserved/documentation destinations and URL credentials are rejected. Passive probe inventory remains the default.

## Validation status

Current `develop/v1.1` has passed:

- **55/55 deterministic tests**;
- `npm ci` with zero reported package vulnerabilities;
- `npm run check`;
- production build;
- committed-secret scan;
- `.env` absence check;
- `/api/health` runtime smoke test;
- root HTTP 200;
- unknown-path HTTP 404;
- traversal-style HTTP 404;
- GitHub Actions CI run `34319449869` on the APNIC integration commit.

The CI action-runtime deprecation found during this gate is being removed by updating pinned GitHub Actions versions in the documentation/release-gate commit.

## Operational boundary

Deterministic tests validate parsers, scoping, security boundaries and no-data behavior. Live upstream freshness still depends on deployment-host DNS/HTTPS and upstream availability. A production-host live-source acceptance check remains required before merging v1.1 to `main`.

## Not implemented / intentionally deferred

- continuous RIPE RIS Live / CAIDA BGPStream collector process;
- owned security-reviewed in-country Iran probe mesh;
- trustworthy province-level continuous telemetry;
- national live WireGuard/OpenVPN/V2Ray/Outline availability;
- white-SIM versus ordinary-SIM measurement;
- robust continuous NIN-versus-global end-user reachability;
- automatic ingestion of contextual providers without a stable/defensible machine-readable feed.

## Remaining v1.1 release work

1. Complete this documentation/CI maintenance pass and verify the resulting CI run.
2. Perform live public-source acceptance on a host with ordinary outbound Internet/DNS.
3. Review dashboard presentation for the newly integrated M-Lab/APNIC/STOP context; no source may be presented with stronger semantics than its API/provenance supports.
4. Execute final release gate and decide whether to merge `develop/v1.1` to `main`.
