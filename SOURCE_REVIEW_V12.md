# v1.2 Additional Source Review

Reviewed: 2026-09-09

Purpose: evaluate additional APNIC/DNS/protocol data without increasing source count for its own sake.

## APNIC HTTP/3 / QUIC

Official APNIC Labs statistics expose country and ASN views for HTTP/3/QUIC use and preserve sample counts in the presentation layer.

Decision: **defer runtime integration**.

Reasoning:

- useful protocol-deployment context;
- not a direct censorship sensor;
- strong overlap with existing protocol/deployment context rather than a new interference mechanism;
- no stable documented machine-readable interface was established in this review that meets the project's runtime provenance contract;
- scraping visualization internals would violate the project's supported-interface rule.

Candidate role if a stable supported API is later established: `protocol-context`, `independentCensorshipVote:false`.

## APNIC DNS over IPv6

APNIC Labs exposes public country/ASN views with sample counts for DNS-over-IPv6 usage.

Decision: **defer runtime integration**.

Reasoning:

- technically useful for resolver/IPv6 deployment context;
- overlaps the already integrated APNIC IPv6 capability/preference dimension;
- does not by itself distinguish censorship from resolver deployment or client behavior;
- no stable documented machine-readable endpoint was established during this review.

Candidate role if later admitted: `dns-protocol-context`, never an automatic censorship vote.

## APNIC DNS query-type / HTTPS-record dashboards

Public APNIC Labs dashboards expose aggregated DNS query-type information, including A/AAAA/HTTPS and related records.

Decision: **do not integrate now**.

Reasoning:

- interpretability for Iran censorship is indirect;
- provenance/independence relative to other large-provider telemetry requires explicit review;
- stable machine-readable runtime contract was not established;
- query-type mix changes could reflect application/client deployment rather than interference.

## OONI circumvention-tool evidence

OONI remains valuable for testing reachability of VPN/circumvention websites and services where its tests apply.

Decision: **do not reinterpret website measurements as transport-protocol tests**.

Blocking `openvpn.net`, a VPN provider website, or another circumvention site does not establish that OpenVPN, WireGuard, V2Ray, Outline, or another tunnel protocol is blocked. Actual protocol claims require controlled protocol endpoints and paired neutral controls under `PROTOCOL_VPN_NIN_EVIDENCE.md`.

## Source-admission rule carried forward

A new continuous source must add a defensible measurement dimension and satisfy all of:

1. identifiable root provider/provenance;
2. stable supported machine-readable access;
3. Iran-relevant scope and meaningful sample/coverage semantics;
4. explicit failure/no-data behavior;
5. interpretable relation to censorship rather than mere correlation;
6. independence/overlap review against existing sources;
7. no hidden inflation of the assessment source count.

Current decision: no additional APNIC/DNS/protocol runtime adapter is warranted by the reviewed interfaces. Retaining `no_data` or contextual absence is preferable to unsupported scraping or pseudo-independence.
