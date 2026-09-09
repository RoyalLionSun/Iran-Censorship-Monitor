# Verification Report — v1.1.0 release

Date: **2026-09-09**  
Production branch: **`main`**  
Release merge commit: **`8a66e32947c0d4f82612f03ad72555c87fd56fe6`**

## Deterministic and production gates

The v1.1 release state passed the following GitHub Actions gates:

- code-state CI: `34323940265` — success;
- code-state public live-source acceptance: `34323940251` — success;
- release PR CI: `34334883650` — success;
- post-merge `main` CI: `34337684528` — success.

The deterministic suite contains **73 tests**, all passing.

CI verifies:

- `npm ci` and dependency audit;
- server/client/operator-script syntax;
- parser/scope/safety semantics;
- production build;
- committed Cloudflare-token pattern rejection;
- committed private-key marker rejection;
- `.env` absence;
- `/api/health` HTTP 200;
- static root HTTP 200;
- unknown path HTTP 404;
- traversal-style path HTTP 404.

GitHub Actions dependencies are pinned to exact verified commits rather than floating major tags.

## Deterministic test coverage

The 73-test suite covers, among other areas:

- ASN/date validation;
- OONI Iran scope, mechanism classification, anomaly/confirmation separation and API-limit exclusion;
- RIPE Atlas probe pagination, per-probe `ping-stats`, daily loss/RTT aggregation, pagination bounds and timeout/concurrency boundaries;
- exclusion of partial RIPE Atlas coverage from corroboration and control/data-plane divergence;
- IODA signal/event parsing;
- Tor direct/bridge and transport-bound parsing;
- Cloudflare Radar scope, aggregation, protocol summary and secret-free URL construction;
- RIPEstat visibility/neighbours, update parsing, historical horizon and 48-hour cap;
- RIPE RIS Live CIDR validation, prefix-scoped subscription construction, scope/header fail-closed behavior, HTTP stream request, UPDATE parsing, announcement/withdrawal separation, chunk decoding, RIPEstat scope resolution and bounded reconnect backoff;
- Censored Planet Iran/date scope and partial-error visibility;
- Globalping Iran probe filtering, active probe cap, SSRF/target restrictions and control-key behavior;
- Citizen Lab quoted CSV parsing;
- PeeringDB and IHR scope/parser behavior;
- Pulse Iran/verification parsing;
- GDELT recent-corpus and professional-domain filtering;
- control/data-plane divergence classification;
- M-Lab Iran/ASN paths, histogram-bucket collapse, sample-gated comparison, insufficient-data behavior, concrete GCS missing-object recognition and separation of no-data from transport/server errors;
- Access Now STOP official-sheet binding, robust CSV parsing, Iran/time overlap, evidence lineage, Ongoing-vs-Unknown semantics and schema fail-closed behavior;
- APNIC Labs IPv6 Iran/ASN URL scope, raw sample preservation, date/country/ASN filtering, smoothed context and explicit no-data behavior.

## Live public-source acceptance

Live-source run: **`34323940251` — success**  
Window: **`2026-08-27..2026-09-09`**  
Selected ASN: **`AS58224`**

| Source | Live result |
|---|---|
| OONI | `ok` |
| RIPE Atlas | `no_data` — valid non-error state |
| IODA | observed |
| Tor Metrics | observed |
| M-Lab NDT | `no_data` — valid non-error state |
| APNIC Labs IPv6 | observed |
| RIPEstat / RIPE RIS | observed |
| Globalping passive inventory | `no_data` |
| Censored Planet | partial |
| PeeringDB | observed |
| Internet Health Report | observed |
| Access Now STOP | 5 matching Iran incident records |
| Citizen Lab | targets returned |
| GDELT | HTTP 429; optional rate-limited discovery context only |

The gate completed with `LIVE ACCEPTANCE PASS`.

### RIPE Atlas runtime semantics

The earlier raw Measurement 1001 result path timed out on real upstream responses. The adapter was migrated to daily `ping-stats` aggregation.

The public service then exposed HTTP 400 `Please specify only one probe` for multi-probe `probe_ids`; production therefore sends one bounded request per selected probe with limited concurrency. A failed subset yields `partial`, and partial RIPE data remains visible but excluded from automated assessment/divergence.

### M-Lab no-data semantics

For the selected ASN/year, M-Lab returned a concrete GCS missing-object `404 NoSuchKey`. The adapter recognizes only that specific missing-aggregate condition as `no_data` for the exact scope.

DNS/TLS/network/parser/5xx failures remain hard errors, and there is no automatic ASN-to-country fallback.

## Passive RIPE RIS Live acceptance

The live-source workflow also runs `npm run verify:ris-live`.

Verified result:

```text
PASS RIPE RIS Live passive subscription handshake · AS58224 · 217.218.96.0/20 · HTTP 200
```

This verifies the public stream endpoint and `X-RIS-Subscribe` path using one RIPEstat-derived prefix. It does not claim full collector coverage or require/fabricate a route event.

## Security/integrity boundary

- Active Globalping remains disabled by default and protected by explicit configuration, operator key, scope and target controls.
- RIPE RIS Live is passive and requires an allowlisted ASN plus a validated bounded prefix set.
- Runtime RIS output is under Git-ignored `var/ris-live/`; the dashboard server does not serve it.
- Contextual STOP/Pulse/GDELT/Tor/M-Lab/APNIC information does not become an additional independent censorship vote.
- No deterministic or live gate converts missing/partial/error states into fabricated zero impact.

## Dashboard/UI verification boundary

The v1.1 UI exposes M-Lab, APNIC and STOP context without adding those sources to the censorship assessment. A separate context CSV export keeps contextual records distinct from the established technical export.

Syntax/build/serve behavior is covered by CI. There is no full headless visual browser interaction test in v1.1; this is a presentation-testing limitation, not a data-integrity bypass.

## Invalid release interpretations

The following remain explicitly invalid:

- “BGP is visible, therefore Internet access is working”;
- “RIS Live announcement/withdrawal = censorship”;
- “OONI anomaly = confirmed censorship”;
- “M-Lab slowdown = intentional state throttling”;
- “APNIC IPv6 change = censorship”;
- “STOP/Pulse/article count = independent technical corroboration”;
- “Tor/VPN usage spike = proof of blocking”;
- “no data = zero impact”;
- “partial coverage = complete source confirmation”.

## Release conclusion

The v1.1 technical and methodological release gate is complete. The final release-metadata commit must pass CI after which that exact `main` commit is the intended target for tag `v1.1.0`.
