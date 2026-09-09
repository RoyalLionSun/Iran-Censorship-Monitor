# Current State — v1.1.0 development

Version: **1.1.0-dev**  
Audit date: **2026-09-09**  
Development branch: **`develop/v1.1`**

Verified runtime baseline before this documentation-only release pass: **`fc59d4be80a49a84a1ea221b28ad3310617c0439`**.

## Canonical branch model

- `main` remains the verified v1.0.1 production baseline at `f668d556c78e9a0750b47059afd523fa3aae4679`.
- `develop/v1.1` is the only current v1.1 development basis.
- Historical bootstrap/transport branches or ZIP/prototype snapshots are audit material only.
- No v1.1 work is merged directly into `main` before the final release gate.

## Implemented measurement and intelligence layers

### Censorship/interference

- OONI Iran-scoped measurements, raw explorer and circumvention/messaging tests;
- Censored Planet GraphQL interference-rate context and CenAlert events.

### Data plane / connectivity

- RIPE Atlas public-probe RTT/loss context using bounded per-probe `ping-stats` requests;
- RIPE Atlas partial coverage remains visible but is excluded from automatic corroboration/divergence decisions;
- IODA routing/active-probing signals and outage events;
- Cloudflare Radar traffic, anomalies and outage annotations when a Radar Read token is configured.

### Performance/degradation context

- M-Lab NDT country/ASN daily aggregate throughput and minimum-RTT data;
- histogram buckets collapsed to one daily summary point rather than counted as independent observations;
- sample-size gate before relative degradation context is calculated;
- a concrete M-Lab GCS `404 NoSuchKey` for an unpublished aggregate is represented as `no_data`, while transport/server/parser failures remain errors;
- no M-Lab performance change is automatically labeled censorship or intentional throttling.

### Control plane

- RIPEstat / RIPE RIS visibility, announced prefixes and observed neighbours;
- bounded on-demand BGP announcement/withdrawal drilldown with AS paths and collector metadata;
- pre-January-2024 drilldown horizon reported as unavailable rather than zero events;
- optional passive RIPE RIS Live collector for continuous prefix-scoped announcements/withdrawals;
- RIS Live starts only by explicit operator command, uses registered Iran ASNs and refuses unscoped or silently truncated prefix sets;
- route events are explicitly control-plane evidence and never an independent censorship vote.

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

### Dashboard presentation

- M-Lab performance context is visible without entering the censorship assessment;
- APNIC IPv6/sample context is visible without entering the censorship assessment;
- Access Now STOP incidents and evidence lineage are exposed in the intelligence view;
- a separate context CSV export avoids conflating contextual evidence with the existing technical export;
- the established dashboard core was preserved as `public/app-core.js`; the v1.1 context layer observes the same API responses instead of generating duplicate upstream requests.

## Methodological rules enforced

- No fabricated measurement values or synthetic no-data replacements.
- BGP control-plane visibility is separate from user-path/data-plane reachability.
- OONI/Censored Planet anomalies do not automatically equal confirmed censorship.
- Traffic/performance degradation does not automatically establish government action or throttling intent.
- Context sources do not increase independent-source counts when they cite measurements already present in the dashboard.
- Missing province/VPN/NIN measurements remain missing rather than inferred from country/ASN telemetry.
- Control/data-plane divergence is an inference label with explicit boundaries, not a measured censorship mechanism.
- `partial` or `no_data` source states are never promoted into full technical corroboration.

## Source-review result — 2026-09-09

A professional source review was performed after M-Lab and STOP integration.

**Integrated:** APNIC Labs IPv6 because it adds a distinct client-side protocol-deployment measurement, exposes raw sample counts, supports Iran and ASN granularity, and provides a stable public machine-readable JSON path.

**Retained as context rather than runtime sensors:** Proton VPN Observatory, Psiphon operational reporting, Miaan/Filterwatch, ASL19 and NetBlocks. They provide valuable Iran/circumvention/incident analysis but no stable continuous public machine-readable feed was established that would justify presenting them as live sensors.

**Not scraped:** Google Transparency Report traffic graphs. Google states that Traffic-feature data is not downloadable, so the project does not reverse-engineer or scrape the visualization as a pseudo-API.

Additional APNIC DNS/protocol datasets remain possible future context sources, but are not added merely to increase source count; provenance overlap and interpretability must be reviewed first.

## Active-measurement safety

Globalping active measurements require explicit server configuration and a server-only control key. Targets are restricted by type/scope and private, loopback, link-local, CGNAT, reserved/documentation destinations and URL credentials are rejected. Passive probe inventory remains the default.

RIPE RIS Live is passive routing collection, not active probing. Automatic scope is derived from current RIPEstat announced prefixes for a selected allowlisted ASN; the collector refuses empty/oversized scope instead of falling back to an unscoped firehose.

## Validation status

The verified runtime baseline `fc59d4be…` passed:

- **73/73 deterministic tests**;
- `npm ci` with zero reported package vulnerabilities;
- `npm run check`;
- production build;
- committed-token/private-key scan;
- `.env` absence check;
- `/api/health` runtime smoke test;
- root HTTP 200;
- unknown-path HTTP 404;
- traversal-style HTTP 404;
- normal GitHub Actions CI run **`34323940265`** — success;
- public live-source acceptance run **`34323940251`** — success;
- passive RIPE RIS Live handshake: **AS58224 / `217.218.96.0/20` / HTTP 200**.

Live acceptance for `2026-08-27..2026-09-09`, scope `AS58224`, returned valid source states including OONI `ok`, RIPE Atlas `no_data`, IODA observed, Tor observed, M-Lab `no_data`, APNIC observed, RIPEstat observed, Globalping passive inventory `no_data`, Censored Planet partial, PeeringDB observed, IHR observed, five matching STOP incidents and five Citizen Lab targets. GDELT returned HTTP 429 and remains optional rate-limited discovery context rather than a release-blocking technical sensor.

## Operational boundary

The ordinary Node dashboard server has no database and persists no upstream payloads to disk; its caches are in memory.

The separately invoked RIS Live collector intentionally persists routing events to `var/ris-live/` as daily JSONL plus an ASN status file. Default retention is seven days and the configured maximum is 30 days. `var/` is ignored by Git and is not served by the dashboard.

Live-source acceptance validates that public upstream paths work from GitHub-hosted ordinary outbound networking at the verified point in time. It does not guarantee future upstream availability.

## Not implemented / intentionally deferred

- CAIDA BGPStream collector integration;
- owned security-reviewed in-country Iran probe mesh;
- trustworthy province-level continuous telemetry;
- national live WireGuard/OpenVPN/V2Ray/Outline availability;
- white-SIM versus ordinary-SIM measurement;
- robust continuous NIN-versus-global end-user reachability;
- automatic ingestion of contextual providers without a stable/defensible machine-readable feed.

## Remaining v1.1 release work

1. Commit this documentation-only release-state refresh and verify its resulting CI/live gates.
2. Re-run the final `main...develop/v1.1` branch/security diff and confirm `var/`, credentials and generated runtime data are absent.
3. Update/close Issue #1 according to the final verified release state.
4. Decide whether the verified v1.1 candidate should be merged into `main`.
