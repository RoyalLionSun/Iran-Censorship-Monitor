# Verification Report

## Latest verification — 2026-09-27, release v1.9.0

- `npm run check`: syntax checks and **530/530** deterministic tests passed, including the document checks (versions, test count, links, no tool attribution or private addresses);
- `npm run verify:release-notes`: passed for v1.9.0;
- `npm run build`: passed;
- `npm run verify:public`: live public-source acceptance passed for `2026-09-13..2026-09-26`, `AS58224` (GDELT unreachable, reported as information);
- GitHub CI on `main`: passed;
- headless Chromium (Linux) page checks of the Overview, Technical analysis, reports, `/tools` and `/sources` in English and Farsi, at desktop and phone width (390 px): no script errors, no untranslated keys or placeholders, no horizontal overflow.

The sections below are the dated records of earlier verification rounds.

## v1.9 working state — 2026-09-12

Date: **2026-09-12**

Basis: **`main` at `21938941e7b5e2da3f4fee55eb744879be1f76aa`**

Package version: **`1.8.0` intentionally unchanged**

Completed deterministic coverage includes:

- cross-dimension observations cannot become a global critical verdict;
- source-family counts alone cannot increase confidence or verification for positive claims without per-incident alignment;
- IODA event count cannot determine severity or create control-/data-plane divergence;
- only source-native broad Radar scope can provide broad connectivity impact in the current adapter contract;
- OONI confirmation remains bound to the selected measurement scope;
- partial Censored Planet and ineligible Radar results cannot improve support/confidence;
- one quiet source is insufficient for a normal claim;
- RIPE probes with zero samples keep quality unknown;
- historical RIPEstat routing URLs include the selected end timestamp; current-window requests use the stable latest-snapshot URL (see the 2026-09-22 follow-up);
- unknown BGP time alignment reduces confidence and suppresses divergence;
- BGP visibility remains a routing-only finding;
- automatic nationwide shutdown establishment is disabled until per-incident place/time/root evidence is verified; Pulse verification remains contextual;
- attribution remains unknown without an established incident and curated cause context;
- interpretation summaries contain neither a global score nor global severity.

Cross-platform working-state results:

- `npm run check`: **324/324 passed**;
- targeted interpretation/routing suite: **26/26 passed**;
- `npm run build`: **passed**;
- `npm run verify:release-notes`: **passed** for the unchanged stable package line `v1.8.0`;
- local production runtime smoke: **passed** (`/api/health` and `/` successful; ASN coverage remained `no_data`/zero-vote; missing path and traversal attempt returned 404);
- committed-token/private-key/local-`.env` scan: **passed**;
- baseline comparison whitespace gate (`git diff --no-index --check`, excluding generated/dependency trees): **passed with no findings**;
- `npm run verify:ui`: **passed** with a Chromium-based browser, including the established presentation fixture and the EN → FA/RTL → EN interpretation/view-switch fixture;
- live public-source acceptance: **passed** for `2026-08-30..2026-09-12`, `AS58224`;

One pre-hotfix wrapper run reported 323/324 deterministic tests without retaining the failing assertion. An immediate direct rerun passed 324/324, and the final post-hotfix full check again passed 324/324. No deterministic failure was reproduced. The browser gate initially identified the missing stable `#situation-headline` hook; the hook was restored, added to the UI contract test and the complete browser gate then passed.

### 2026-09-13 runtime and interpretation safety follow-up

The earlier browser pass covered presentation fixtures, not the real app loading an old backend payload. The reported screenshot and `/api/overview` diagnostic established a long-running Node server with cached pre-change modules: the newly served client needed `assessment.interpretation`, while the running backend returned `assessment.publicSummary`. The client now visibly reports incompatible/failed responses, and a new deterministic browser gate runs the **real** `index.html` + `app.js` path against valid, legacy and HTTP-error API fixtures. Automatic nationwide-shutdown establishment was disabled after a regional Pulse plus other mismatched events could incorrectly yield a nationwide claim.

- `npm run check` **328/328 passed**, `npm run build` **passed**, `npm run verify:release-notes` **passed**.
- The new browser gate and modified EN/FA browser fixture were **not** run in this round: no compatible browser was available. Earlier browser passes do not certify these new edits.
- Only a controlled restart of the running application process after applying the fix can clear the cached server modules; verify the API contract after restart. No commit, push, tag or release was performed.

### 2026-09-22 follow-up: service findings, scope and routing fixes

Line endings were normalized to LF (as stored in the repository) and pinned with `.gitattributes`; no content changed through that step.

- Integrated the OONI service findings (priority service domains, per-domain table with bounded URL drilldown, separate WhatsApp/Telegram app tests) from the 2026-09-20 selective integration. Routine circumvention monitoring now actually uses `OONI_ROUTINE_TESTS`; the legacy Signal test remains a manual selection only. Web targets for Facebook, Instagram, X/Twitter, Telegram Web and YouTube were added to the target selection.
- Censored Planet is queried for Iran as a whole. It no longer counts toward coverage or support of a claim about a selected ASN, target or non-web test; the server default selection is AS58224, so this affected the default view.
- RIPEstat `routing-status` with a per-request "now" timestamp was never served from the upstream cache and took about 18–35 s, exceeding the 12 s request timeout; current windows lost routing entirely. Current windows now use the stable latest-snapshot URL. RIPEstat `query_time` carries no zone designator and was parsed as local time, which turned correct historical alignments into `unknown` on non-UTC machines; it is now parsed as UTC.

Results in this working state:

- `npm run check`: **349/349 passed**; `npm run build`: **passed**; `npm run verify:release-notes`: **passed** (`v1.8.0`).
- `npm run verify:ui`: **passed** with headless Chrome (disposable profile) via `CHROME_BIN`, including the real-app Overview gate (ready, legacy and error responses) and the EN/FA/RTL fixture.
- Live public sources, `AS58224`, `2026-09-15..2026-09-22`: `/api/overview` answered in 4.6 s; routing `routes-visible` (324/325 RIS peers), alignment `latest`; interference `blocking-confirmed-in-measurements` from OONI only, Censored Planet marked out of scope; `/api/ooni/domains` returned 2,704 domains / 49,707 measurements; service findings showed confirmed blocking for www.facebook.com, www.instagram.com, x.com, twitter.com, telegram.org and www.youtube.com; routine circumvention requests were tor, psiphon, whatsapp and telegram. APNIC returned 404 from both endpoints (upstream).
- Open: a historical window (`2026-09-04..2026-09-10`) still exceeded the 12 s timeout on the first, uncached RIPEstat lookup; routing then reports insufficient data rather than a result.

Plain-language Overview and source reliability, same day:

- Cold-cache timing of all 17 overview sources (two runs, `AS58224`, `2026-09-16..2026-09-22`): every source answered within 5 s. Persistent defects found and fixed: Censored Planet rejected the country name `Iran` (now `IR`); RIPE Atlas ping-stats changed to a single-probe object format (now parsed: 9/9 probes, 44,520 pings, 2 % loss, 18.6 ms); APNIC failed with ETIMEDOUT because Node allowed only 250 ms per connect attempt on a host without IPv6 (now 2.5 s; fallback endpoint delivers). The APNIC per-ASN primary directory no longer exists upstream; the fallback is used. CAIDA ASRank `links` returned HTTP 500 (upstream).
- After the fixes the live header reported 13/13 source adapters reachable.
- `npm run check`: **359/359 passed**; `npm run build`: **passed**; `npm run verify:release-notes`: **passed**; `npm run verify:ui`: **passed** (real-app gate now asserts the situation board headline, six service tiles and status row).
- Live screenshots checked in English and Farsi (RTL, Persian digits and calendar) at 1440 px and at 500 px width.
- CAIDA ASRank `/links` returns HTTP 500 for every ASN (checked AS3356, AS15169, AS58224). The adapter keeps reporting `partial`; no value is invented.
- Farsi review: 38 sentences that began with a Latin word were rewritten to start with Persian; labels and section titles were left unchanged. `tests/i18n-coverage.test.mjs` now fails if a Persian sentence starts with a Latin word.
- Selection review with live data (AS58224, AS197207, AS44244): selecting Facebook returns "Facebook is blocked · confirmed in 217 of 422 tests" instead of the previous "not tested"; WhatsApp returns website "not tested" plus app "problems in 287 of 402 tests"; Google Play returns its own measured rows; a Tor selection no longer reports WhatsApp findings.
- Coverage sampling, live check (`AS58224`, `2026-09-16..2026-09-22`): www.instagram.com reports 426 measurements across 7 of 7 days, and the bounded sample of the 200 most recent records contains 190 distinct measurement runs over 4 days, so the run count is published as a floor. play.google.com returns 8 runs over 6 days as a complete count.
- Internet Society Pulse with a configured token: the API returned 973 shutdown records, 17 of them for Iran. Live rule check: `2025-06-13..2025-06-25` establishes a nationwide shutdown (confirmed national record, nationwide Radar annotation `GOVERNMENT_DIRECTED`, overlapping IODA events, severity `widespread`); `2026-02-01..2026-02-28` stays not established and reports the 138-day record that Pulse marks unconfirmed as context; the current window reports neither. Six negative cases are covered deterministically: regional record, unconfirmed record, context from another time, a single technical root, non-nationwide technical scope and context without technical evidence.
- Internet Society Pulse without a token: `https://pulse-api.internetsociety.org/shutdowns` answers `401 Unauthorized`. Until access is configured, a nationwide shutdown cannot be confirmed by this deployment, and the Overview says so in those words.
- Reference event, September 2022 (documented by the OONI/IODA report on the Mahsa Amini protests): the dashboard reproduces it. `AS58224` reports Instagram, Telegram, YouTube, X and Facebook as blocked with WhatsApp restricted, 5 connectivity events, and 188,712 OONI measurements across 2,462 domains; `AS44244` reports 8 connectivity events and `AS197207` reports 9, matching the report's eight major outages in that window. The dominant mechanism then was blocked connections (tcp) for Instagram, while the same service is blocked via DNS in 2026, so the mechanism is a property of the period, not a constant.
- Two parser defects were found through that validation and fixed: five non-hostname inputs discarded the entire September 2022 window, and the spellings `Instagram.com` and `instagram.com` were treated as a repeated row instead of one domain group.
- Network scope, live check (`2026-09-17..2026-09-23`): www.instagram.com was confirmed blocked in 22 of 25 measured Iranian networks, showed problems in 2 and stayed reachable in 1; telegram.org was confirmed blocked in 20 of 21 and reachable in 1. The reachable network is stated explicitly so the picture is not flattened.
- Connection quality spread, live check (`AS58224`): latency median 115.1 ms with a typical range of 94.1 to 158.3 ms, bandwidth median 5.1 Mbit/s (3.8 to 6.9), DNS response time 100.1 ms. Radar quality metrics are limited to latency, bandwidth and DNS; packet loss and jitter are not offered.
- Connection quality, live check: Radar quality returned in-window daily values for `AS58224` (115.1 ms latency, 5.1 Mbit/s bandwidth), `AS44244` (146.2 ms, 4.3 Mbit/s) and Iran as a whole (137.2 ms, 4.7 Mbit/s). The ASN summary endpoint was rejected as evidence because it answered a 7-day request with a 90-day window (2026-06-24..2026-09-22).
- OONI quota: a dashboard load previously issued up to a dozen parallel OONI queries and the API answered `429 quota exceeded` for every request from this address, including single ones. Traffic is now gated, cached and capped, and a rate limit produces a named error plus a cooldown instead of further requests. The quota state is upstream and time-based; it clears on its own.
- Blocking mechanism, live check (`AS58224`, 7-day window): Instagram 144 of 187 affected tests via a confirmed DNS fingerprint, Telegram 136 of 154 via blocked connections (tcp_ip), X 136 via DNS with 46 interrupted encrypted connections. The mechanisms differ per service, which is why they are reported per service and not for the network.
- Slow historical routing lookup, live check (`AS58224`, `2026-08-20..2026-08-27`): the first request returned after 12 s with `routingRetryInProgress: true` and a routing dimension marked pending; the background revalidation then filled the cache.

No commit, push, tag or GitHub CI result is claimed for this working state.

---

## Historical v1.6.0 release-candidate report

Date: **2026-09-10**  
Release line: **v1.6.0**  
Pre-release main head: **`42e8775cfd7a51f882a78172caee181ed613e23f`**  
Release branch: **`release/v1.6.0`**

## Previously completed gates

### ASN identity/inventory line

- v1.5 feature PR #15 CI `34440814125` — **success**;
- v1.5 post-feature-merge `main` CI `34440868635` — **success**;
- latest applicable live public-source acceptance `34399378248` — **success**;
- direct RIPE Database identities: **23/23 curated profiles**, **18 operator families**;
- both Fanap-family ASNs AS206065 and AS24631 passed current registry validation;
- RIPE RIS Live and Route Views/CAIDA BGPStream broker acceptance passed.

### v1.6 shutdown-context line

- backend/correlation post-merge `main` CI `34442988321` — **success**;
- dashboard branch CI `34443294299` — **success**;
- dashboard PR CI `34443351394` — **success**;
- dashboard post-merge `main` CI `34443425466` — **success**;
- pre-release deterministic suite — **275/275 passed**;
- production build, real Headless Chrome presentation, committed-secret/private-key scan and runtime smoke checks passed.

No v1.6 feature change triggered the separate live-source acceptance workflow because its current push trigger is restricted to `develop/v1.5`. No live-source result is fabricated for v1.6.

## Final v1.6.0 release gate

The release-finalization branch adds two deterministic context-export tests. The expected stable release suite is therefore **277 tests** and must pass before merge/tag/publication together with:

- syntax checks, including the v1.6 shutdown UI and export helper;
- canonical `release-notes/v1.6.0.md` validation;
- production bundle creation;
- real Headless Chrome rendering of M-Lab/APNIC/STOP/Pulse/STOP↔Pulse plus existing ASRank/RPKI/Tor context;
- committed token/private-key and `.env` rejection;
- runtime health/root/404/path-traversal smoke testing.

## Deterministic v1.6 coverage

The release verifies that:

- Pulse accepts only explicit Iran identifiers and validates required timestamps/ranges;
- open-ended events overlap later selected windows without being silently ended;
- malformed Iran Pulse records fail closed;
- missing Pulse credentials remain `token_required`, not zero incidents;
- STOP and Pulse remain separate provenance objects;
- correlation requires time overlap plus a matching broad scope class;
- candidates remain `possibleSameIncident:true`, `automaticMerge:false`, `independentTechnicalVote:false`;
- dashboard presentation preserves verification, cause, type and affected-region context;
- context CSV exports Pulse status/events and correlation candidates without losing zero-vote/provenance semantics;
- the export represents token-required Pulse coverage as `matched=not_inferred` rather than zero.

## Evidence / security boundary

Release verification does not turn registry identity, RIR country association, BGP visibility, topology, performance, curated shutdown reports or source correlation into censorship attribution.

In particular:

- BGP visibility does not establish end-user reachability;
- multiple related ASNs do not create independent evidence;
- secondary ipverse classification cannot override RIR country scope;
- STOP/Pulse/Tor/BridgeDB/Ookla context creates no independent censorship vote;
- temporal/scope correlation does not establish incident identity, causality, mechanism or political intent;
- missing/partial/error/token-required states are never promoted to confirmation;
- province and SIM entitlement are not inferred;
- website reachability is not VPN-transport evidence.

## External predeployment gates

A green release is still **NO-GO** for an Iran Fleet Stage-1 pilot until separate evidence exists for:

1. real isolated Linux/systemd sandbox and negative-egress enforcement;
2. real project-controlled Class-A measurement/control endpoints and collection edge;
3. out-of-band key provisioning, rotation and revocation;
4. rollback against a known-safe version;
5. voluntary informed operator consent and withdrawal;
6. explicit authorization to deploy.

Repository policy remains `deploymentAuthorized:false`.

## Publication history note

v1.5.0 was developed and repository-verified but was not tagged or published as a GitHub Release. v1.6.0 is intentionally the next published release after v1.4.0 and therefore includes the accumulated v1.5 ASN/inventory work as well as v1.6 shutdown-context work.
