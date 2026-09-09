# Verification Report — v1.1 development

Date: **2026-09-09**

## Current deterministic gate

Verified GitHub Actions run on the APNIC integration commit: **`34319449869`**.

Results:

- `npm ci`: success, zero reported package vulnerabilities;
- `npm run check`: **55/55 tests passed**;
- production build: success;
- committed-secret scan: success;
- `.env` absence check: success;
- runtime `/api/health`: HTTP 200;
- static root: HTTP 200;
- unknown path: HTTP 404;
- traversal-style path: HTTP 404.

The documentation/release-gate commit additionally updates GitHub Actions dependencies from deprecated Node-20-based v4 action runtimes to current pinned action commits. Its CI result must be green before this document is considered the final pre-release gate.

## Deterministic test coverage

The 55-test suite covers, among other areas:

- ASN/date validation;
- OONI Iran scope, mechanism classification, anomaly/confirmation separation and API-limit exclusion;
- RIPE Atlas pagination and safety-cap disclosure;
- IODA signal/event parsing;
- Tor direct/bridge and transport-bound parsing;
- Cloudflare Radar scope, aggregation, protocol summary and secret-free URL construction;
- RIPEstat visibility/neighbours, update parsing, historical horizon and 48-hour cap;
- Censored Planet GraphQL Iran/date scope and partial-error visibility;
- Globalping Iran probe filtering, active probe cap, SSRF/target restrictions and control-key behavior;
- Citizen Lab quoted CSV parsing;
- PeeringDB and IHR scope/parser behavior;
- Pulse Iran/verification parsing;
- GDELT recent-corpus and professional-domain filtering;
- control/data-plane divergence classification;
- M-Lab Iran/ASN paths, histogram-bucket collapse, sample-gated performance comparison and insufficient-data behavior;
- Access Now STOP official-sheet binding, robust CSV parsing, Iran/time overlap, evidence lineage, Ongoing-vs-Unknown semantics and schema fail-closed behavior;
- APNIC Labs IPv6 Iran/ASN URL scope, raw sample preservation, date/country/ASN filtering, smoothed context and explicit no-data behavior.

## Security/integrity gate

Permanent CI rejects:

- obvious committed Cloudflare bearer/token patterns;
- any `.env` present in the checkout.

Runtime adapters use fixed upstream destinations plus validated Iran/ASN/date inputs. Optional active Globalping remains disabled by default and has independent target/rate/control-key restrictions.

No deterministic test is allowed to turn an upstream failure into a successful zero-valued measurement.

## External integration validation boundary

Parser/query behavior can be validated offline, but source freshness and upstream network behavior require ordinary outbound DNS/HTTPS.

A production-host acceptance run should confirm that configured/public sources do not all fail at DNS/TLS/network level and that returned observations have plausible provider timestamps/coverage metadata. Token-gated sources must be checked with server-side credentials without printing them.

### Minimum production-host acceptance

```bash
node server.mjs
curl -fsS http://127.0.0.1:4173/api/health
curl -fsS 'http://127.0.0.1:4173/api/overview?asn=AS58224&testName=web_connectivity&since=2026-09-01&until=2026-09-09'
curl -fsS 'http://127.0.0.1:4173/api/stop?asn=AS58224&testName=web_connectivity&since=2022-09-15&until=2022-09-30'
npm run verify:radar   # when Radar token is configured
```

Acceptance criteria:

- `/api/health` responds successfully;
- at least the intended credential-free public adapters show real observed/no-data responses rather than systemic DNS/network errors;
- APNIC/M-Lab sample/coverage fields are present when upstream data exists;
- STOP records remain contextual with `independentTechnicalVote: false`;
- Radar verification succeeds when the token is configured;
- no credential appears in logs/responses.

## Methodological verification boundaries

The following are explicitly invalid release interpretations:

- “BGP is visible, therefore Internet access is working”;
- “OONI anomaly = confirmed censorship”;
- “M-Lab slowdown = intentional state throttling”;
- “APNIC IPv6 change = censorship”;
- “STOP/Pulse/article count = independent technical corroboration”;
- “Tor/VPN usage spike = proof of blocking”;
- “no data = zero impact”.

The release gate is technical and methodological: a build can be green while a source is temporarily unavailable, but the product must preserve that failure/no-data state without fabricating certainty.
