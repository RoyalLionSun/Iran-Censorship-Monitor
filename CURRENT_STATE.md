# Current State — v1.1.0 development

Version: **1.0.0**  
Audit date: **2026-09-08**

## Implemented

### Monitoring UI

- compact sticky header;
- ASN, OONI test, target, and date-range filters;
- 7/14/30-day quick ranges plus historical September 2022 query preset;
- multi-source assessment strip with confidence and scope;
- eight compact KPIs;
- responsive 12-column dashboard grid;
- OONI timeline and inferred signal-method labels;
- RIPE Atlas RTT/loss view;
- Cloudflare Radar traffic/event view;
- IODA signal/outage view;
- Tor direct/bridge usage context;
- OONI circumvention/messaging table;
- selected-window event feed;
- on-demand provider/ASN comparison;
- empty operator-entered VPN control/tunnel measurement panel;
- raw OONI measurement explorer;
- source/provenance register;
- CSV export of loaded observed data;
- print support.

### Backend/data layer

- server-side adapters for OONI, RIPE Atlas, IODA, Tor Metrics, and Cloudflare Radar;
- Iran-only query scoping;
- ASN/date/target validation;
- timeout and in-memory cache;
- independent source failure isolation;
- provider-query concurrency limits;
- OONI API-limit integrity guard;
- RIPE probe pagination and safety-cap reporting;
- multi-source corroboration assessment.

### Security/runtime

- no runtime third-party npm dependencies;
- no embedded secrets;
- optional Radar token held server-side;
- strict CSP preventing direct browser API calls;
- MIME sniffing protection;
- referrer policy;
- frame embedding disabled through CSP;
- `.env` excluded from Git.

### Testing

Deterministic tests cover:

- OONI mechanism classification;
- OONI aggregation and Iran-scoped query generation;
- OONI truncation exclusion from assessment;
- multi-source assessment states;
- date and ASN validation;
- IODA signal/event parsing;
- Tor direct/bridge CSV parsing;
- RIPE Atlas pagination and safety-cap behavior.

## Intentionally not implemented as fake telemetry

### WireGuard/OpenVPN live availability

There is no owned Iran probe fleet in the inherited project. The production UI therefore does not claim live national WireGuard/OpenVPN success rates.

To make this a real measurement source, deploy controlled probes and define:

- probe identity and location/ASN privacy model;
- control endpoint;
- WireGuard/OpenVPN endpoints;
- periodic test protocol;
- signed ingestion endpoint;
- clock synchronization;
- success/failure semantics;
- retention and operator-security policy.

### Province-level map

The inherited project does not contain a reliable province-level telemetry feed. No province heatmap is shown because mapping country-level/ASN data onto provinces would create false precision.

A province map should only be activated once the underlying observations have defensible province/geolocation granularity.

## Optional source not configured by default

Cloudflare Radar requires a real Radar Read API token. The production adapter is fully token-gated and supports Iran/ASN-scoped HTTP traffic, outages, traffic anomalies, BGP hijack context, adaptive time aggregation, and Radar confidence metadata. OONI, RIPE Atlas, IODA, and Tor Metrics remain usable without proprietary credentials.

## Known operational boundary in this build environment

The development sandbox used for this reconstruction could start the local service and run tests/builds, but external DNS resolution to public APIs was unavailable during the final local validation session. Therefore:

- request construction and response parsers are tested deterministically;
- local API/static serving is smoke-tested;
- upstream API contracts were checked against current provider documentation;
- end-to-end live upstream calls must be verified once deployed on a host with normal outbound Internet access.

## v1.1 implemented in the development branch

- Censored Planet GraphQL/CenAlert;
- RIPEstat/RIS visibility, prefix/neighbour context and bounded BGP drilldown;
- Globalping Iran probe inventory plus protected disabled-by-default active measurement API;
- Tor bridge transport lower/upper bounds;
- Cloudflare Radar HTTP protocol/version, IP version and TLS-version distributions;
- PeeringDB + IHR AS-Hegemony topology/chokepoint context;
- Citizen Lab Iran target inventory;
- token-gated Internet Society Pulse context;
- curated Iran-intelligence source registry and allowlisted GDELT discovery;
- control/data-plane divergence classification;
- dense UI panels for the new evidence families.

The offline deterministic suite currently contains **42 passing tests**. Live upstream reachability still depends on the deployment host.
