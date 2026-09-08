# Verification Report — v1.1 development

Date: **2026-09-08**

## Completed checks

- `npm run check`: **21/21 tests passed** (including Cloudflare Radar URL/scope/granularity tests).
- `npm run build`: production bundle generated successfully.
- JavaScript syntax checks passed for the server and browser application.
- `package.json`, `package-lock.json`, and project JSON data files parse successfully.
- HTML audit: no duplicate static IDs; all simple static ID selectors used by the client exist.
- Secret-pattern scan: no committed private keys, bearer tokens, or obvious hard-coded API secrets found in the production source.
- Productive source scan: no simulated/mock measurement dataset is used by runtime code.
- Cloudflare Radar adapter validates query construction offline: Iran location scope, selected ASN scope, dynamic aggregation interval, and BGP involved-ASN/country semantics.
- Cloudflare Radar secret is not included in source, build output, Git, or release archives.
- Local smoke test: `/api/health`, `/api/config`, and `/` returned expected responses.
- Static-path traversal probe returned `404` after containment hardening.
- Security headers verified on the static root response, including strict same-origin CSP.

## External integration validation boundary

The reconstruction sandbox did not have functioning outbound DNS from the local Node process during validation. A real Radar Read token was configured locally on 2026-09-08, but both the Cloudflare token-verification endpoint and Radar API request failed before TLS with `EAI_AGAIN`. This is a sandbox DNS limitation, not an API authentication result. The token was therefore **not falsely reported as validated**.

Mitigations applied:

- endpoint contracts checked against current official provider documentation;
- query construction isolated and tested where practical;
- external response parsers covered by deterministic fixtures;
- each upstream source fails independently instead of producing fabricated zeroes;
- deployment documentation requires ordinary outbound DNS/HTTPS and instructs the operator to verify live source freshness after deployment.

## First production-host acceptance test

After copying `dist/` to an Internet-connected host:

```bash
node server.mjs
curl -fsS http://127.0.0.1:4173/api/health
npm run verify:radar
curl -fsS 'http://127.0.0.1:4173/api/overview?asn=AS58224&testName=web_connectivity&since=2026-09-01&until=2026-09-08'
```

The second response must show source-specific observed/no-data/error states. Do not accept a deployment where all public sources remain in network/DNS error.

## v1.1 verification additions

The deterministic suite is currently **42/42 passing** and covers, in addition to the v1.0.1 baseline:

- RIPEstat ASN/date scope, routing visibility, announcements/withdrawals, AS paths, pre-2024 availability semantics and 48-hour drilldown cap;
- Censored Planet GraphQL Iran/date scoping and partial errors;
- Globalping Iran/ASN filtering, five-probe cap, target safety and control-key behavior;
- Tor country × transport bounds;
- Radar protocol-summary scoping;
- PeeringDB and IHR request/parser behavior;
- Pulse Iran/verification parsing;
- Citizen Lab quoted CSV parsing;
- GDELT recent-corpus scoping and professional-domain filtering;
- control/data-plane divergence classification.

Production build succeeds. Local runtime smoke checks confirm `/api/health`, `/api/config` and `/` return 200; unknown and traversal-like static paths return 404. Upstream Internet calls may fail in the isolated build sandbox and are therefore separated from deterministic parser/scope tests.
