# Data Sources

Last reviewed: **2026-09-09**  
Production source set: **v1.1.0**  
Additional v1.2 development source: **Route Views via CAIDA BGPStream tooling**

## Source taxonomy

Presence in the runtime does not mean an independent censorship sensor. Measurement, data plane, performance/protocol context, topology, circumvention, routing/control-plane evidence and curated/OSINT context remain separate.

| Source | Access | Runtime role | Assessment role |
|---|---|---|---|
| OONI | Public API | censorship/application measurements | eligible technical signal |
| Censored Planet | Public GraphQL | remote interference + CenAlert | investigation/technical context |
| RIPE Atlas | Public API | active-probe RTT/loss | eligible data-plane signal only with sufficient coverage |
| IODA | Public API | connectivity/outage signals | eligible data-plane signal |
| Cloudflare Radar | Radar Read token | traffic/outages/anomalies/BGP/protocol mix | only where assessment explicitly permits |
| RIPEstat / RIPE RIS | Public API | BGP visibility/prefix/neighbour/update | control-plane/divergence context |
| RIPE RIS Live | Public stream | passive announcements/withdrawals | control-plane context only |
| Route Views via CAIDA BGPStream | Public broker + `bgpreader`/Route Views live resources | second passive routing collector | control-plane context only |
| M-Lab NDT | Public JSON aggregate | throughput/minimum-RTT | context only |
| APNIC Labs IPv6 | Public JSON measurement | IPv6 capability/preference | context only |
| Tor Metrics | Public CSV | direct/bridge/transport estimates | circumvention context only |
| Globalping | Public API / optional token | passive inventory; protected active tests | probe presence is not a vote |
| PeeringDB | Public API | topology | context only |
| IHR AS Hegemony | Public API | dependency/chokepoints | context only |
| Citizen Lab Test Lists | Public CSV | Iran target inventory | inventory only |
| Internet Society Pulse | Token API | curated shutdown context | context only |
| Access Now #KeepItOn STOP | Public dataset | curated shutdown incidents | context only; lineage preserved |
| GDELT DOC 2.0 | Public API | professional-source discovery | OSINT context only |

## Core source semantics

### OONI / Censored Planet

Iran scope and mechanism/anomaly metadata remain separate. An anomaly or control failure is not automatically confirmed censorship. OONI website/circumvention-site reachability is not reinterpreted as WireGuard/OpenVPN/V2Ray/Outline transport evidence.

### RIPE Atlas / IODA / Radar

RIPE Atlas uses bounded per-probe daily `ping-stats`; partial probe coverage remains visible but is excluded from automated corroboration/divergence. IODA and Radar provide connectivity/traffic context without establishing political intent. Radar credentials remain server-side.

### RIPEstat / RIPE RIS / RIS Live

BGP visibility, prefixes, neighbours, announcements and withdrawals are control-plane evidence. The optional RIS Live collector is bounded to validated prefix scope, passive and separate from the dashboard process. BGP visibility never proves working end-user Internet.

### Route Views / CAIDA BGPStream — v1.2

The v1.2 collector uses CAIDA BGPStream tooling to access **Route Views live** resources. Methodological distinction:

- BGPStream is an access/normalization framework, not itself a sensor;
- consuming RIPE data through BGPStream would remain RIPE evidence and must not be counted again;
- only Route Views collector/peer infrastructure supplies the second routing-source family;
- collection is passive, prefix-scoped and operator-started;
- output remains `routing-control-plane` evidence with `independentCensorshipVote:false`.

The CAIDA broker live gate verified the Route Views stream resource path using the live/FOREVER semantics required by libBGPStream.

### M-Lab / APNIC

M-Lab collapses repeated histogram buckets into one daily summary and preserves sample counts. A documented missing aggregate may be `no_data`; transport/parser/server failures remain errors. Performance degradation is not automatically throttling/censorship.

APNIC IPv6 preserves raw experiment counts, capable/preferred percentages and smoothed context. It is protocol/deployment context, not censorship attribution.

### Tor / Globalping / topology

Tor is circumvention context only. Globalping passive inventory is the default; active measurements remain disabled by default and protected. PeeringDB/IHR provide topology/dependency context only.

### STOP / Pulse / GDELT / Citizen Lab

STOP and Pulse are curated context and can cite technical sources already present; they never automatically add an independent vote. GDELT is discovery context. Citizen Lab is a target inventory, not current blocking evidence.

## v1.2 additional APNIC/DNS/protocol review

Reviewed but **not admitted as new runtime adapters**:

- APNIC HTTP/3 / QUIC;
- APNIC DNS over IPv6;
- APNIC DNS query-type / HTTPS-record dashboards.

They may provide useful deployment/protocol context, but the review did not establish a sufficiently stable supported machine-readable interface plus enough independent censorship interpretability to justify runtime integration. Visualization scraping or reverse-engineered pseudo-APIs remain prohibited.

See [SOURCE_REVIEW_V12.md](SOURCE_REVIEW_V12.md).

## Owned-probe evidence family — development only

The v1.2 fleet is not a public external source and is not production-authorized. Accepted observations are `owned-probe` evidence and all owned probes remain one source family. They cannot inflate independent-source counts.

VPN transport and NIN interpretations are gated by [PROTOCOL_VPN_NIN_EVIDENCE.md](PROTOCOL_VPN_NIN_EVIDENCE.md). Province/SIM segmentation remains disabled under [PROVINCE_SIM_FEASIBILITY.md](PROVINCE_SIM_FEASIBILITY.md).

## Source admission rule

A new continuous source must provide:

1. identifiable root provider/provenance;
2. stable supported machine-readable access;
3. Iran-relevant scope and explicit sample/coverage semantics;
4. explicit failure/no-data behavior;
5. interpretable relation to the claimed measurement dimension;
6. independence/overlap review against existing sources;
7. no hidden inflation of assessment source count.

Unsupported scraping, duplicated provenance or correlation-only telemetry is preferable as absent/contextual rather than promoted to a sensor.

## Failure behavior

`observed`, `partial`, `no_data`, `token_required`, rate-limited and hard `error` remain distinct states. No upstream failure is converted into a zero measurement or successful national status.
