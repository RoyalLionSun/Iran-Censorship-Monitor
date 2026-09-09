# Data Sources

Last reviewed: **2026-09-09**  
Release source set: **v1.4.0**

## Source taxonomy

Presence in the runtime does not mean an independent censorship sensor. Measurement, data plane, performance/protocol context, topology, circumvention, routing/control-plane evidence and curated/OSINT context remain separate.

| Source | Access | Runtime role | Assessment role |
|---|---|---|---|
| OONI | Public API | censorship/application measurements | eligible technical signal |
| Censored Planet | Public GraphQL | remote interference + CenAlert | investigation/technical context |
| RIPE Atlas | Public API | active-probe RTT/loss | eligible data-plane signal only with sufficient coverage |
| IODA | Public API | connectivity/outage signals | eligible data-plane signal |
| Cloudflare Radar | Radar Read token | traffic/outages/anomalies/BGP/protocol mix | only where assessment explicitly permits |
| RIPEstat / RIPE RIS / RPKI | Public API | BGP visibility/prefix/neighbour/update plus route-origin authorization context | control-plane/divergence + route-integrity context |
| RIPE RIS Live | Public stream | passive announcements/withdrawals | control-plane context only |
| Route Views via CAIDA BGPStream | Public broker + `bgpreader`/Route Views live resources | second passive routing collector | control-plane context only |
| CAIDA ASRank | Public API | ASN rank, customer cone, degree and inferred AS relationships | topology context only |
| M-Lab NDT | Public JSON aggregate | throughput/minimum-RTT | performance context only |
| APNIC Labs IPv6 | Public JSON measurement | IPv6 capability/preference | protocol/deployment context only |
| Tor Metrics | Public CSV | Iran direct/bridge/transport estimate bounds plus global BridgeDB demand | circumvention context only |
| Ookla Open Data | Public quarterly objects | reviewed object/provenance contract; Iran aggregation not yet admitted | performance context only; no censorship/throttling vote |
| Globalping | Public API / optional token | passive inventory; protected active tests | probe presence is not a vote |
| PeeringDB | Public API | operator-maintained topology | context only |
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

### RIPEstat / RIPE RIS / RIS Live / RPKI

BGP visibility, prefixes, neighbours, announcements and withdrawals are control-plane evidence. The optional RIS Live collector is bounded to validated prefix scope, passive and separate from the dashboard process. RPKI preserves upstream route-origin authorization states. None of these alone proves working end-user Internet or censorship intent.

### Route Views / CAIDA BGPStream

CAIDA BGPStream tooling accesses **Route Views live** resources. BGPStream is an access/normalization framework, not itself a sensor. Consuming RIPE data through BGPStream remains RIPE evidence and must not be counted again. Route Views events remain control-plane context only.

### CAIDA ASRank

ASRank adds selected-ASN rank, customer-cone, degree and inferred relationship context. It derives partly from routing inputs overlapping existing sources, so it must not inflate routing-source independence and remains `topology-context` with `independentCensorshipVote:false`.

### M-Lab / APNIC

M-Lab preserves sample counts and performance context. APNIC IPv6 preserves experiment counts and capability/preference context. Performance/protocol variation is not automatically censorship or throttling attribution.

### Tor Metrics / BridgeDB — v1.4

- Iran Tor transport observations are retained as published lower/upper estimate bounds;
- exact client counts are not invented from those intervals;
- directional change is supported only where paired intervals do not overlap;
- overlapping/touching intervals remain indeterminate;
- BridgeDB requested-transport demand is global and is labelled **GLOBAL · not Iran-specific**;
- BridgeDB is excluded from Iran incident correlation;
- Tor/BridgeDB remain context only with `independentCensorshipVote:false`.

### Tor ↔ Access Now STOP temporal context — v1.4

Tor transport bounds can be compared with STOP incident windows only as temporal context. A date-window match does not establish causality, blocking, political intent or a new independent technical vote. Missing paired observations remain `no_data`; partial upstream coverage remains `partial`.

### Ookla Open Data — v1.4 feasibility contract

The repository contains a bounded contract for official quarterly fixed/mobile public Ookla objects. An Iran aggregate is **not** published yet because a defensible result requires a reviewed country-boundary dataset and spatial join. Bounding-box shortcuts, fabricated national values and automatic throttling/censorship conclusions are prohibited.

### Globalping / topology

Globalping passive inventory is the default; active measurements remain disabled by default and protected. PeeringDB, IHR and ASRank provide topology/dependency context only.

### STOP / Pulse / GDELT / Citizen Lab

STOP and Pulse are curated context and can cite technical sources already present; they never automatically add an independent vote. GDELT is discovery context. Citizen Lab is a target inventory, not current blocking evidence.

## Circumvention source review

Psiphon and Ceno/eQualitie remain useful Iran circumvention/resilience context, but no stable supported public machine-readable Iran time-series API was established. No unsupported runtime telemetry adapter or chart scraping is admitted.

## Owned-probe evidence family

The release includes the owned-probe **laboratory architecture**, not authorization for an Iran pilot. Accepted observations are `owned-probe` evidence and all owned probes remain one source family. They cannot inflate independent-source counts.

VPN transport and NIN interpretations are gated by [PROTOCOL_VPN_NIN_EVIDENCE.md](PROTOCOL_VPN_NIN_EVIDENCE.md). Province/SIM segmentation remains disabled under [PROVINCE_SIM_FEASIBILITY.md](PROVINCE_SIM_FEASIBILITY.md). Repository policy remains `deploymentAuthorized:false` until separate external pilot gates and explicit authorization are satisfied.

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
