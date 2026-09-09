# Verification Report — v1.1 development

Date: **2026-09-09**

Verified runtime baseline before this documentation-only release pass: **`fc59d4be80a49a84a1ea221b28ad3310617c0439`**.

## Deterministic gate

GitHub Actions CI run: **`34323940265`** — success.

Results:

- `npm ci`: success, zero reported package vulnerabilities;
- `npm run check`: **73/73 tests passed**;
- server syntax check: success;
- browser loader/core/v1.1 context-module syntax checks: success;
- RIS Live collector/verifier syntax checks: success;
- production build: success;
- committed token/private-key scan: success;
- `.env` absence check: success;
- runtime `/api/health`: HTTP 200;
- static root: HTTP 200;
- unknown path: HTTP 404;
- traversal-style path: HTTP 404.

GitHub Actions dependencies are pinned to verified exact commits rather than floating major tags.

## Deterministic test coverage

The 73-test suite covers, among other areas:

- ASN/date validation;
- OONI Iran scope, mechanism classification, anomaly/confirmation separation and API-limit exclusion;
- RIPE Atlas probe pagination, safety-cap disclosure, per-probe `ping-stats` URL construction, daily loss/RTT aggregation, ISO timestamp variants, pagination bounds and concurrency/timeout boundaries;
- explicit exclusion of partial RIPE Atlas coverage from corroboration and control/data-plane divergence;
- IODA signal/event parsing;
- Tor direct/bridge and transport-bound parsing;
- Cloudflare Radar scope, aggregation, protocol summary and secret-free URL construction;
- RIPEstat visibility/neighbours, update parsing, historical horizon and 48-hour cap;
- RIPE RIS Live CIDR validation, prefix-scoped subscription construction, header size/scope fail-closed behavior, HTTP stream request, UPDATE parsing, announcement/withdrawal separation, stream chunk decoding, RIPEstat scope resolution and bounded reconnect backoff;
- Censored Planet GraphQL Iran/date scope and partial-error visibility;
- Globalping Iran probe filtering, active probe cap, SSRF/target restrictions and control-key behavior;
- Citizen Lab quoted CSV parsing;
- PeeringDB and IHR scope/parser behavior;
- Pulse Iran/verification parsing;
- GDELT recent-corpus and professional-domain filtering;
- control/data-plane divergence classification;
- M-Lab Iran/ASN paths, histogram-bucket collapse, sample-gated performance comparison, insufficient-data behavior, concrete GCS missing-object recognition and separation of no-data from transport/server errors;
- Access Now STOP official-sheet binding, robust CSV parsing, Iran/time overlap, evidence lineage, Ongoing-vs-Unknown semantics and schema fail-closed behavior;
- APNIC Labs IPv6 Iran/ASN URL scope, raw sample preservation, date/country/ASN filtering, smoothed context and explicit no-data behavior.

## Security/integrity gate

Permanent CI rejects:

- obvious committed Cloudflare token patterns;
- committed private-key material;
- any `.env` present in the checkout.

Runtime adapters use fixed upstream destinations plus validated Iran/ASN/date inputs. Optional active Globalping remains disabled by default and has independent target/rate/control-key restrictions.

The passive RIS Live collector requires an allowlisted Iran ASN and a validated bounded prefix set. It refuses empty or oversized subscriptions instead of silently collecting a broader scope.

No deterministic test is allowed to turn an upstream failure into a successful zero-valued measurement.

## Live public-source acceptance

GitHub Actions live-source run: **`34323940251`** — success.

Validation window: **`2026-08-27..2026-09-09`**  
Selected ASN: **`AS58224`**

Observed live states through the real server API:

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
| Citizen Lab | 5 targets returned |
| GDELT | HTTP 429; informational/rate-limited context only |

The gate completed with `LIVE ACCEPTANCE PASS`.

### RIPE Atlas runtime correction verified by live gate

The earlier raw Measurement 1001 result path timed out on real upstream responses. The adapter was migrated to daily `ping-stats` aggregation.

The next live run exposed HTTP 400 `Please specify only one probe` for multi-probe `probe_ids`. The production adapter therefore sends one bounded request per selected probe with limited concurrency. A failed subset yields `partial`; partial RIPE data is displayed but excluded from automated assessment.

This is preferable to increasing timeouts indefinitely or silently reducing measurement scope.

### M-Lab no-data semantics verified by live gate

For the selected ASN/year, M-Lab returned a concrete GCS missing-object `404 NoSuchKey`. The adapter recognizes only that specific missing-aggregate condition as `no_data` for the exact scope.

DNS/TLS/network/parser/5xx failures remain hard errors, and there is no automatic ASN-to-country fallback.

## Passive RIPE RIS Live acceptance

The live-source workflow also runs `npm run verify:ris-live`.

Verified result on `fc59d4be…`:

```text
PASS RIPE RIS Live passive subscription handshake · AS58224 · 217.218.96.0/20 · HTTP 200
```

This is a bounded passive handshake using one currently RIPEstat-derived prefix. It verifies the public stream endpoint and `X-RIS-Subscribe` path without claiming full production coverage for every Iran ASN and without waiting for or fabricating a route event.

## Dashboard/UI verification boundary

The v1.1 UI pass exposes M-Lab, APNIC and STOP context without adding those sources to `buildAssessment`.

The established dashboard core is preserved in `public/app-core.js`; `public/v11-context.js` augments the UI by observing/cloning the same same-origin API responses. It does not create a second set of M-Lab/APNIC/STOP upstream requests.

A separate context CSV export keeps these contextual records distinct from the existing technical export semantics.

## Optional credential-gated acceptance

Cloudflare Radar should additionally be checked on a deployment with the intended server-side Radar token:

```bash
npm run verify:radar
```

The check is read-only and must not print the credential.

Internet Society Pulse remains token-gated and must preserve `token_required`/unavailable semantics when not configured.

## Methodological verification boundaries

The following are explicitly invalid release interpretations:

- “BGP is visible, therefore Internet access is working”;
- “RIS Live announcement/withdrawal = censorship”;
- “OONI anomaly = confirmed censorship”;
- “M-Lab slowdown = intentional state throttling”;
- “APNIC IPv6 change = censorship”;
- “STOP/Pulse/article count = independent technical corroboration”;
- “Tor/VPN usage spike = proof of blocking”;
- “no data = zero impact”;
- “partial coverage = complete source confirmation”.

The release gate is technical and methodological: a build can be green while a source is temporarily unavailable, rate-limited, partial or genuinely has no data, but the product must preserve that state without fabricating certainty.

## Remaining release verification

This documentation-only release-state commit must itself pass the permanent CI/live workflows. After that, the final `main...develop/v1.1` diff must be reviewed for accidental secrets, generated data and unexpected files before any merge decision.
