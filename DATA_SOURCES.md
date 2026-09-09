# Data Sources

Last professionally reviewed: **2026-09-09**

## Source taxonomy

A source being present in the runtime does not mean it is an independent censorship sensor. The application distinguishes measurement, performance/protocol context, topology, circumvention, routing/control-plane evidence and curated/OSINT context.

| Source | Access | Runtime role | Assessment role |
|---|---|---|---|
| OONI | Public API | censorship/application measurements | eligible technical signal |
| Censored Planet | Public GraphQL | remote interference + CenAlert | investigation/technical context |
| RIPE Atlas | Public API | active-probe RTT/loss | eligible data-plane signal when complete enough |
| IODA | Public API | connectivity/outage signals | eligible data-plane signal |
| Cloudflare Radar | Radar Read token | traffic/outages/anomalies/BGP/protocol mix | eligible where assessment logic explicitly permits |
| RIPEstat / RIPE RIS | Public API | BGP visibility/prefix/neighbour/update context | control-plane/divergence context |
| RIPE RIS Live | Public HTTP JSON stream | passive continuous announcements/withdrawals | control-plane context only |
| M-Lab NDT | Public JSON aggregate | throughput/minimum-RTT degradation context | context only |
| APNIC Labs IPv6 | Public JSON measurement | client-side IPv6 capability/preference | context only |
| Tor Metrics | Public CSV | direct/bridge/transport estimates | circumvention context only |
| Globalping | Public API / optional token | passive probe inventory; protected active tests | probe presence is not a vote |
| PeeringDB | Public API | topology metadata | context only |
| IHR AS Hegemony | Public API | dependency/chokepoint context | context only |
| Citizen Lab Test Lists | Public CSV | Iran test-target inventory | inventory only |
| Internet Society Pulse | Token API | curated shutdown context | context only |
| Access Now #KeepItOn STOP | Public dataset | curated structured shutdown incidents | context only; lineage preserved |
| GDELT DOC 2.0 | Public API | professional-source discovery | OSINT context only |

## OONI

Base: `https://api.ooni.io/`

Used interfaces:

- `/api/v1/measurements`
- `/api/v1/measurement/{uid}`
- `/api/v1/measurement_meta?measurement_uid=...` fallback

Queries are fixed to `probe_cc=IR`, with optional selected `probe_asn`. OONI list responses at the configured API limit are marked truncated; their derived anomaly rate is excluded from automatic disruption classification.

Anomaly, confirmation and mechanism hints remain separate concepts.

## Censored Planet

Base: `https://data.censoredplanet.org/query`

The GraphQL adapter loads Iran interference-rate context and CenAlert time series/events. Unexpected responses, control failures and behavioral anomalies are investigation evidence, not automatically confirmed censorship.

## RIPE Atlas

Base: `https://atlas.ripe.net/api/v2/`

The dashboard discovers active Iran probes, optionally by ASN, and uses built-in measurement `1001` for RTT/loss path context. Probe pagination is followed with a bounded safety cap. Historical daily observations are loaded from the measurement `ping-stats` interface rather than the heavy raw-results stream.

Live acceptance exposed that the service currently returns HTTP 400 `Please specify only one probe` when multiple probe IDs are sent to the `ping-stats` endpoint. The adapter therefore performs one bounded request per selected probe with limited concurrency. Individual failures produce `partial` coverage; partial RIPE data remains visible but is excluded from automatic corroboration and control/data-plane divergence classification.

A `no_data` result means no usable observations were returned for the selected scope/window; it is not a zero-loss measurement and does not represent complete national availability.

## IODA

Base: `https://api.ioda.inetintel.cc.gatech.edu/v2/`

Raw routing/active-probing connectivity signals and outage events are loaded for Iran or a selected ASN. IODA events indicate disruption, not political intent.

## Cloudflare Radar

Base: `https://api.cloudflare.com/client/v4/radar/`

A server-side token restricted to `Account > Radar > Read` is required. The integration includes:

- HTTP time series;
- outages;
- traffic anomalies;
- BGP hijack context;
- HTTP protocol/version distribution;
- IP-version distribution;
- TLS-version distribution.

Iran and selected-ASN scope are applied according to each upstream endpoint's semantics. Missing credentials produce `token_required`, not fallback telemetry.

## RIPEstat / RIPE RIS

Selected ASN context includes routing visibility, announced prefixes, neighbours and bounded raw BGP announcements/withdrawals. The update drilldown is on-demand, limited to the final 48 hours/250 records, and reports pre-January-2024 data-horizon limitations explicitly.

BGP visibility is control-plane evidence and must not be interpreted as functioning end-user Internet access.

## RIPE RIS Live

Stream base: `https://ris-live.ripe.net/v1/stream/`

The optional collector uses the public JSON firehose with an `X-RIS-Subscribe` header and subscribes only to `UPDATE` messages for an explicit prefix set. It is not started by the dashboard server.

Default scope is derived from the currently announced RIPEstat prefixes of an allowlisted Iran ASN. Safety controls include:

- selected ASN must exist in `data/asns.json`;
- at least one valid IPv4/IPv6 CIDR is required;
- automatic scope is capped at 200 prefixes;
- subscription header is capped at 12,000 bytes;
- oversized scope fails closed instead of being silently truncated;
- an operator can provide an explicit narrower prefix file;
- announcements and withdrawals are emitted as separate route events;
- route events preserve RRC/peer/AS-path/next-hop provenance where the upstream message contains it;
- every event is `routing-control-plane` evidence and `independentCensorshipVote: false`.

Local output is daily JSONL under `var/ris-live/`, plus a status file. Default retention is seven days and maximum configured retention is 30 days.

The verified live gate successfully established a passive subscription for `AS58224` and prefix `217.218.96.0/20` with HTTP 200. That handshake validates the public subscription path, not the completeness of every ASN's production prefix set.

## M-Lab NDT

Public statistics base: `https://statistics.measurementlab.net/v0/`

Used aggregates:

- Iran country: `/AS/IR/<year>/histogram_daily_stats.json`
- Iran + ASN: `/AS/IR/asn/AS<number>/<year>/histogram_daily_stats.json`

M-Lab's daily histogram file repeats daily summary statistics across eight speed buckets. The adapter collapses those buckets to one daily point and preserves daily sample counts. Relative performance context uses only days meeting the adapter's explicit sample gate.

A concrete GCS `404 NoSuchKey` for a documented aggregate object is represented as `no_data` for that exact scope. DNS/TLS/network/parser/5xx failures remain errors and there is no silent ASN-to-country fallback.

M-Lab throughput/RTT changes are not independent censorship votes and do not by themselves establish intentional throttling.

## APNIC Labs IPv6

Primary country JSON:

`https://data1.labs.apnic.net/v6stats/v6economy/IR.json`

ASN form documented by APNIC:

`https://data1.labs.apnic.net/v6stats/v6economyas/IR/AS<number>.json`

For ASN scope the adapter also supports APNIC's own UI-linked JSON fallback:

`https://stats.labs.apnic.net/cgi-bin/json-table-v6.pl?x=IR<number>`

The payload contains raw experiment counts (`seen`), IPv6-capable/preferred counts and percentages plus 10/30/60/90-day smoothed values. The application preserves raw counts and exposes raw percentages plus 30-day context.

APNIC measurements add a client-side protocol/deployment perspective. They are not equivalent to BGP IPv6 announcement visibility and are not censorship attribution.

## Tor Metrics

Used country datasets include relay/direct users, bridge users and country×transport derived bounds. The dashboard does not invent exact transport-specific Iranian client counts when Tor provides lower/upper bounds.

Tor usage is circumvention context and never an automatic disruption vote.

## Globalping

Passive Iran probe inventory is enabled without active probing. Optional active `ping`, `traceroute`, `mtr`, `dns` and `http` operations remain disabled by default, Iran-vantage-only, capped, rate-limited and control-key protected. Probe availability itself says nothing about censorship state.

## PeeringDB + Internet Health Report

PeeringDB supplies operator-maintained topology metadata. IHR AS Hegemony supplies BGP-path dependency concentration for a selected origin ASN. Both help reason about chokepoints; neither is a live censorship vote.

## Citizen Lab Iran test list

The public Iran CSV is ingested as a searchable target inventory. Inclusion means a URL is a defensible censorship-testing candidate, not that it is currently blocked.

## Internet Society Pulse

Pulse is token-gated curated shutdown context with verification metadata. It can incorporate evidence from sources also used elsewhere in this dashboard and therefore never adds an automatic independent technical vote.

## Access Now #KeepItOn / STOP

The project uses Access Now's public Shutdown Tracker Optimization Project spreadsheet through the public Google Spreadsheet/Visualization CSV interface.

The adapter:

- requires the documented STOP schema and fails closed on schema loss;
- filters to Iran;
- applies selected-window overlap semantics;
- distinguishes `Ongoing` from `Unknown`;
- retains `info_source` and evidence links;
- maps recognized links to root source lineage (for example OONI/Radar/IODA/M-Lab/Censored Planet/RIPE Atlas);
- marks every record `independentTechnicalVote: false`.

The currently published STOP corpus covers records through **2025**. Later query windows can include historical incidents explicitly marked `Ongoing`; this must not be treated as complete coverage of newly starting 2026 incidents.

## GDELT + specialist registry

GDELT DOC 2.0 is on-demand professional-report discovery filtered to a curated domain allowlist. Articles are discovery/context until root evidence has been reviewed.

The separate intelligence registry contains specialist sources such as ASL19, Miaan/Filterwatch, Access Now, NetBlocks, Psiphon, Proton, Ceno and ARTICLE 19.

During the verified live gate GDELT returned HTTP 429. This remains an informational/rate-limited discovery failure and is not release-blocking because GDELT is not a technical sensor.

## 2026-09-09 source-review decisions

### Integrated

**APNIC Labs IPv6** was added because it contributes a distinct technical measurement dimension, supports Iran/ASN scope, publishes raw sample counts and exposes a stable public machine-readable JSON format.

### Valuable context, not promoted to continuous runtime sensors

- **Proton VPN Observatory:** strong circumvention-demand spikes, including Iran; no stable continuous public API established during review.
- **Psiphon:** valuable operational usage reporting, including major Iran user-volume observations; no stable continuous public telemetry feed established.
- **Miaan/Filterwatch and ASL19:** high-value Iran-specific technical/operational analysis, but report/study-oriented rather than a stable homogeneous runtime feed.
- **NetBlocks:** credible disruption reporting/observatory methodology; no public continuous machine-readable feed established for this integration.

These sources remain contextual rather than being scraped into pseudo-telemetry.

### Explicitly not scraped

**Google Transparency Report Traffic:** Google's own FAQ states that Traffic-feature data currently cannot be downloaded. The project therefore does not reverse-engineer the chart backend or treat scraped visualization values as a supported API.

### Deferred candidate families

APNIC exposes additional DNS/protocol measurements. They are not integrated in v1.1 merely to increase source count; independence, provenance overlap and Iran-specific interpretability must be reviewed before adding them.

CAIDA BGPStream remains a possible additional control-plane collector family; it is not required to claim the current RIPE RIS Live implementation complete.

## Caching and failure behavior

- Default shared in-memory cache: 120 seconds unless an adapter uses a longer source-appropriate TTL.
- Default external timeout: 12 seconds; individual sources use bounded source-specific limits where required.
- RIPE Atlas large historical responses are avoided through bounded per-probe daily stats requests rather than unbounded timeout increases.
- Source failures remain isolated.
- `partial`, `no_data`, `token_required` and hard `error` remain distinct states.
- No upstream failure is converted into a zero measurement.
