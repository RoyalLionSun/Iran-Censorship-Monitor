# Data Sources

Last verified against current provider documentation: **2026-09-08**

## Runtime-integrated sources

| Source | Access | Runtime role | Authentication | Dashboard use |
|---|---|---|---|---|
| OONI | Public API | Censorship/application measurements | None | timeline, anomaly/confirmation context, mechanism hints, circumvention/messaging table, measurement explorer |
| RIPE Atlas | Public API | Active-probe path observations | None | probe coverage, RTT, missing-ping/packet-loss context, provider comparison |
| IODA | Public API | Routing/active-probing/connectivity signals and outage events | None | connectivity chart, outage events, corroboration |
| Tor Metrics | Public CSV | Tor direct and bridge user estimates | None | circumvention context only |
| Cloudflare Radar | API | HTTP traffic, outage annotations, traffic anomalies, BGP hijack context | Radar Read token | country context, events, optional corroboration |

## OONI

Base: `https://api.ooni.io/`

Used endpoints:

- `/api/v1/measurements`
- `/api/v1/measurement/{uid}`
- metadata fallback `/api/v1/measurement_meta?measurement_uid=...`

Queries are always restricted to `probe_cc=IR`; an ASN is passed as `probe_asn` when selected. Input target is only sent for `web_connectivity`.

Supported test names in this application:

- `web_connectivity`
- `dns_consistency`
- `http_header_field_manipulation`
- `ndt`
- `tor`
- `psiphon`
- `signal`
- `whatsapp`
- `telegram`

**Important integrity control:** the list API is constrained to at most 1000 returned rows. If exactly 1000 rows are returned, the application marks the result `truncatedAtApiLimit=true` and does not use the derived anomaly rate in the automated disruption assessment.

OONI anomalies are signals requiring contextual interpretation; they are not treated as automatic proof of blocking.

## RIPE Atlas

Base: `https://atlas.ripe.net/api/v2/`

Used endpoints:

- `/probes/?country_code=IR&status=1&asn_v4=...`
- `/measurements/1001/results/?start=...&stop=...&probe_ids=...`

Probe discovery follows API pagination (`next`) instead of assuming the first 500 results are complete. A 10-page safety cap is enforced; reaching it is exposed via `probeListTruncated`.

Built-in measurement 1001 is used for path RTT and missing-result/loss context. These measurements describe paths to the measurement target and are **not** labeled as national Internet availability.

## IODA

Base: `https://api.ioda.inetintel.cc.gatech.edu/v2/`

Used interfaces:

- `/signals/raw/{entityType}/{entityCode}`
- `/outages/events` with fallback to entity path form for API compatibility

Scope is country `IR` when no ASN is selected, otherwise the numeric ASN.

IODA combines multiple Internet-disruption observation families such as routing visibility and active probing. The application presents outage events as disruption signals and does not infer censorship intent from them.

Date range is capped at 90 days in line with the practical raw-signal viewing window.

## Tor Metrics

Base: `https://metrics.torproject.org/`

Used CSV datasets:

- `userstats-relay-country.csv`
- `userstats-bridge-country.csv`

Country is fixed to `ir`. Direct-user estimates preserve Tor Metrics' lower/upper expected bounds. A value below the lower bound is displayed only as a possible censorship-related signal, not proof of censorship.

Tor Metrics changed client-counting behavior in January 2026; long-term comparisons across that methodological change require care.

## Cloudflare Radar

Base: `https://api.cloudflare.com/client/v4/radar/`

Used interfaces:

- `http/timeseries`
- `annotations/outages`
- `traffic_anomalies`
- `bgp/hijacks/events`

A token with `Account > Radar > Read` is required. If it is absent, the source remains explicitly in `token_required` state. There is no fabricated fallback. The token is sent only in the server-side `Authorization: Bearer` header and never appears in API URLs or browser responses.

Radar scope rules in v1.0.1:

- HTTP traffic: `location=IR`, plus `asn=<selected ASN>` when an ASN is selected.
- Outages: `location=IR`, plus the selected ASN when applicable.
- Traffic anomalies: `location=IR`, plus the selected ASN when applicable.
- BGP hijacks: `involvedAsn=<selected ASN>` for ASN scope, otherwise `involvedCountry=IR`.
- Aggregation: 15 minutes for <=2 days, 1 hour for <=14 days, 1 day for <=90 days, 1 week above that.
- Radar `confidenceInfo.level` is retained as metadata; it is not converted into censorship attribution.

Country-level requests use `location=IR`. BGP uses `involvedAsn=<ASN>` for ASN-scoped monitoring or `involvedCountry=IR` for all-networks scope.

## Context/reference sources registered but not automatically ingested

The source register also contains:

- Censored Planet
- CAIDA BGPStream
- Access Now / #KeepItOn

They remain provenance/context resources in v1.0.0 and are **not** presented as live-ingested runtime measurements. This distinction is intentional.

## Local VPN field measurements

WireGuard/OpenVPN/Shadowsocks tunnel performance is not sourced from a real Iran probe fleet in this project. The field-measurement panel therefore starts empty and accepts only measurements entered by the operator. Entries remain in local browser storage.

This avoids falsely presenting manually entered or synthetic tunnel values as nationwide telemetry.

## Caching and failure behavior

- Server-side in-memory cache default: 120 seconds.
- Upstream timeout default: 12 seconds per request.
- `/api/overview` isolates source failures; one unavailable upstream source does not erase observations from the others.
- No source failure is converted into a zero-value observation.

## v1.1 additional runtime sources

### Censored Planet GraphQL / CenAlert

The server queries `https://data.censoredplanet.org/query` for Iran interference-rate context plus CenAlert time series/events. Remote measurements complement OONI's volunteer-probe model. Unexpected responses, control failures and behavioral anomalies remain separate concepts; none is automatically promoted to proven censorship.

### RIPEstat / RIPE RIS

Selected-ASN routing context includes BGP visibility, announced prefixes and observed neighbours. Raw BGP updates are loaded only on demand, capped to the final 48 hours of the selected window and 250 records. The BGP-update drilldown explicitly reports pre-January-2024 windows as unavailable rather than `0 updates`.

### Globalping

The default integration is passive Iran probe discovery. Optional active `ping`, `traceroute`, `mtr`, `dns` and `http` tests are disabled by default, restricted to Iran vantage points, capped at five probes, rate-limited, protected by an operator control key and reject localhost/private/reserved targets. Probe presence itself is not a censorship signal.

### Tor bridge transports

Country × transport data is represented using Tor Metrics' derived **lower/upper bounds**. The dashboard does not invent an exact per-transport Iranian client count.

### PeeringDB and Internet Health Report

PeeringDB provides operator-maintained topology metadata; IHR AS Hegemony provides BGP-path dependency concentration for a selected origin ASN. Both are topology/chokepoint context, not live censorship votes.

### Citizen Lab Iran test list

The Iran list is loaded as a searchable target inventory. Inclusion means "candidate for censorship testing", not "currently blocked".

### Internet Society Pulse

Pulse is token-gated curated shutdown context with verification levels. Because Pulse may itself rely on technical sources already present here, it is never counted as an additional independent raw sensor.

### GDELT + professional OSINT registry

GDELT DOC 2.0 is an **on-demand discovery** layer for recent professional reporting. Results are filtered to a curated domain allowlist. Articles remain context until their underlying evidence lineage is reviewed. A separate registry tracks Iran-specialist research and circumvention sources such as ASL19, Miaan/Filterwatch, Access Now, NetBlocks, Psiphon, Proton, Ceno and ARTICLE 19.

## Valuable open sources not yet treated as live runtime sensors

- **M-Lab NDT:** valuable for throughput/RTT/loss and throttling analysis, but its research data path is primarily BigQuery/GCS rather than a simple zero-auth low-latency endpoint suitable for this zero-dependency runtime. It remains a planned ingestion/aggregation layer instead of being faked as a live REST sensor.
- **Access Now STOP:** important verified shutdown history/context; currently retained as an intelligence source rather than scraped into the live technical assessment.
- **RIS Live / CAIDA BGPStream:** valuable for continuous streaming BGP event processing; planned as a later collector process rather than blocking request/response dashboard calls.
- **Psiphon / Proton / Ceno:** useful circumvention-demand/context signals where public reports exist, but no fabricated continuous API telemetry is created.
