# v1.3 Source Review — topology, route security and circumvention context

Reviewed: **2026-09-09**

## CAIDA ASRank — admitted

Official interface: `https://api.asrank.caida.org/v2/restful/`

Decision: **admit as topology context**.

Why it adds information:

- selected-ASN rank and customer-cone size;
- inferred peer/customer/provider relationship context;
- macroscopic dependency/topology perspective distinct from PeeringDB's operator-maintained exchange/facility metadata and IHR's path-hegemony metric.

Independence limitation:

ASRank derives topology from CAIDA Ark active measurements plus BGP data including Route Views and RIPE NCC. It therefore does **not** create a new independent routing/censorship vote merely because the provider is CAIDA. Runtime output is marked `topology-context` and `independentCensorshipVote:false`.

The official service documents a monthly update cadence. The adapter uses selected-ASN endpoints only and a bounded relationship result set.

## RIPEstat RPKI — admitted

Official interfaces:

- `rpki-validation`: validity of a prefix/origin-AS combination;
- `rpki-history`: VRP-count history by ASN/prefix/country/trust anchor.

Decision: **admit as route-origin-integrity context inside the RIPE source family**.

The adapter:

- resolves currently announced prefixes for the selected ASN;
- validates at most 16 prefixes per overview request, with explicit truncation/coverage metadata;
- uses at most three concurrent validation requests;
- preserves `valid`, `invalid_asn`, `invalid_length` and `unknown` states;
- loads bounded monthly IPv4/IPv6 VRP history;
- marks all results `independentCensorshipVote:false` and `routingSourceFamily:'ripe'`.

An invalid or unknown RPKI state is **not** a censorship or hijack verdict. ROA mistakes, max-length mistakes and incomplete RPKI deployment are plausible alternatives.

## Psiphon — contextual only

Official Psiphon reporting continues to expose highly valuable Iran circumvention-demand evidence. In a June 2026 Psiphon report, the organization stated that it observed more than 9.5 million unique daily users inside Iran on 30 January 2026 during severe restrictions and described large diaspora-operated Conduit capacity.

Psiphon's privacy documentation also confirms that the network internally measures protocol, connection duration, transferred bytes and coarse geography/ISP data and can use aggregated data to understand censorship events.

Decision: **do not create a runtime telemetry adapter**.

Reason: this review did not establish a stable, public, machine-readable Psiphon analytics feed that exposes the underlying time series under a supported API contract. Blog/report values remain analyst/context evidence and must carry publication date/provenance rather than being scraped into synthetic telemetry.

## Ceno / eQualitie — contextual only

Ceno publishes useful circumvention/resilience information and documents privacy-preserving anonymized metrics. Public materials describe country-level participation and technical metrics such as peer-to-peer volume, connection success/latency and bridge/injector behavior.

Decision: **do not create a runtime telemetry adapter**.

Reason: no stable public machine-readable Iran time-series API was established in this review. Public factsheets and reports remain contextual evidence. Chart/page scraping is prohibited.

## Proton VPN Observatory / NetBlocks / Kentik

These remain useful external context where public reports are available, but no new continuous runtime adapter is admitted without a stable supported public machine interface and a clear independence/provenance model.

## Admission rule

A v1.3 source is admitted to runtime only when it supplies a defensible new dimension and has:

1. identifiable root provider and methodology;
2. stable supported machine-readable access;
3. Iran/ASN-relevant scope;
4. explicit coverage/failure semantics;
5. interpretable relationship to the claimed dimension;
6. overlap/independence review;
7. no hidden source-count or censorship-vote inflation.
