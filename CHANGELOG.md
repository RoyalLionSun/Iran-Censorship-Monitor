# Changelog

## Unreleased — v1.9 UX/interpretation redesign

### Claim-based interpretation

- replaced the global `status/severity/confidence` ladder with separate connectivity, interference, routing, quality and shutdown claims;
- made severity, confidence, verification, coverage and attribution independent per-claim axes with no global numeric health score;
- prevented cross-dimension evidence, source counts and IODA/Radar event counts from increasing disruption severity or proving censorship;
- limited OONI `confirmed` to the measured blocking claim and kept cause, intent and actor attribution separate;
- kept partial Censored Planet results visible while excluding them from automatic support/confidence;
- required adequate relevant coverage before any no-disruption/no-interference finding; missing data remains explicitly unknown;
- disabled automatic nationwide-shutdown establishment after finding that event labels alone did not establish time, scope or root-evidence alignment; Pulse verification remains separate analyst context.
- stopped raising positive-claim confidence/verification merely because two source families report events within one selected window; per-incident alignment remains future work.

### Runtime compatibility and browser coverage

- removed the v1.9 overview fetch interceptor and wired the real app loader directly to Overview and source health;
- made old-backend responses and request failures visible instead of leaving an empty or indefinitely loading Overview;
- added a real-app browser gate for valid, legacy and failed API responses alongside the existing fixtures;
- removed a legacy source-health header overwrite and kept query failures neutral rather than marking them as critical incidents.

### User-facing hierarchy

- added a default Overview with a plain-language headline, user impact, four distinct question-oriented status areas, current findings, explicit unknowns and evidence/coverage;
- separated Overview from Technical analysis without removing the existing charts, raw measurements, source status or drill-down;
- retained source-health colors exclusively for data availability/usability rather than incident severity;
- added paired English/Farsi strings and direction-safe rendering for every new controlled interpretation surface.

### Routing time alignment and verification

- aligned RIPEstat routing-status requests to the selected historical window and exposed alignment state;
- suppressed control-/data-plane divergence when routing time alignment is unknown;
- stopped describing BGP visibility as control-plane health and stopped treating generic IODA/Radar event counts as severe data-plane impact;
- replaced legacy assessment regression expectations with claim-boundary, missing-data, shutdown, partial-source and time-alignment tests;
- before the runtime compatibility changes, passed the 324/324 deterministic suite, production build, browser presentation and EN/FA/RTL fixtures, and live public-source acceptance for `2026-08-30..2026-09-12` / `AS58224`; the additional real-app browser gate still needs a browser run;
- restored and regression-tested the stable `#situation-headline` DOM hook required by the browser presentation contract;
- kept `package.json` at `1.8.0`; no v1.9 release, tag or deployment authorization is created by this working change.

### Service findings and scope fixes (2026-09-22)

- integrated OONI service findings: priority service domains on the first screen, a per-domain Web Connectivity table with a bounded, on-demand URL drilldown, and WhatsApp/Telegram app tests shown separately from website results;
- routine circumvention monitoring now requests only `OONI_ROUTINE_TESTS`; the legacy Signal test stays available as a manual selection;
- added Facebook, Instagram, X/Twitter, Telegram Web and YouTube web targets to the target selection;
- country-level Censored Planet results no longer count toward coverage or support for a selected ASN, target or non-web test;
- current-window RIPEstat routing lookups use the stable latest-snapshot URL instead of a per-request timestamp that exceeded the request timeout; RIPEstat `query_time` is parsed as UTC;
- normalized line endings to LF and added `.gitattributes`;
- passed 349/349 deterministic tests, production build, release-notes gate, `verify:ui` with headless Chrome and a live public-source run for `AS58224`.

### Plain-language Overview and source reliability (2026-09-22)

- the Overview now opens with a situation board for non-technical readers: a headline that names confirmed blocked services, six service tiles (website and app shown separately), and a status row for internet connection, test connections, global routing and complete shutdown;
- added `services`, `summary.headline` and `summary.latestObservation` to the interpretation; `/api/overview` queries the OONI domain aggregation and app tests for this;
- the "affected services" unknown is replaced by "other services" once services were tested, removing a contradiction with the service results;
- finding metrics are labelled (`OONI · measurements: 44,091` instead of `OONI: 44,091`);
- per-website test details moved into the Overview below the assessment cards;
- Censored Planet requests use the `IR` country code; the API had started rejecting `Iran`, so every response was partial;
- RIPE Atlas ping-stats reads the current single-probe object format; connection quality was reported as unmeasured although all probes delivered data;
- Node's 250 ms per-address connect attempt is raised to 2.5 s; APNIC (Australia) failed with ETIMEDOUT on hosts without IPv6;
- 359/359 deterministic tests, build, release-notes gate and `verify:ui` pass.

### Farsi readability and slow-source handling (2026-09-22)

- Farsi sentences no longer start with a Latin word, which reversed their reading order; a locale test now enforces this for every Persian sentence;
- the header age value is isolated inside the Persian sentence, so `<1 min` is no longer rendered as `min 1>`;
- a routing lookup that exceeds the request timeout is revalidated in the background and cached; the Overview says the lookup is still being fetched instead of reporting no data;
- source-health wording is plain: `12 of 13 data sources available · 11 delivered data · 1 not answering`.

### Overview for non-technical readers (2026-09-22)

- a selection now means the service, not one hostname: selecting Facebook no longer reported "not tested" while the same page reported Facebook as blocked, and WhatsApp/Telegram selections include their app test;
- the target filter offers each service exactly once instead of per-host duplicates; a contract test keeps it that way;
- unrelated app findings can no longer drive the headline of a website selection, and a selected test without a service tile (Tor, Psiphon, DNS) gets its own headline;
- the Overview is reduced to three blocks: situation board, "What this means for you" in plain sentences, and the open questions for the current selection;
- assessment cards, findings, evidence matrix and per-website test details moved to Technical analysis, removing the fourfold repetition of the same numbers;
- the status row drops the routing tile for lay readers; routing stays in the technical assessment;
- a single unavailable side source is no longer displayed in alarm red.

### Coverage behind a finding (2026-09-22)

- service tiles state the measured days ("Measured on 7 of 7 days"), so a week of testing is no longer indistinguishable from a single day;
- an explicit service selection additionally samples the independent measurement runs behind the finding and reports a full sample as a floor;
- OONI domain aggregation carries `observedDays`; a fully qualified domain with a trailing root dot is accepted instead of rejected.

### Blocking mechanism (2026-09-23)

- service tiles state how a service is blocked: via the name lookup (DNS), blocked connections (IP), a block page, or an interrupted encrypted connection;
- the plain-language panel explains the dominant mechanism for the named service with its share of the affected tests;
- the mechanism comes from the OONI blocking type and confirmed block fingerprints, is only counted for measurements that actually have a finding, and an unspecified mechanism is never presented as one;
- the evidence samples for the affected services run in one parallel round, which kept the cold Overview at about 14 s and a warm one at 2.6 s.

### Nationwide shutdown rule (2026-09-23)

- with Internet Society Pulse access configured, the documented establishment rule is implemented and tested: source-native nationwide impact, two independent technical connectivity roots, and a confirmed or acknowledged national Pulse record whose time range overlaps both a nationwide Radar annotation and an IODA event;
- confidence stops at medium because root lineage between the sources is still unverified, Pulse never counts as a technical source, and an established shutdown is stated for its period rather than in the present tense;
- a national record that misses the rule, such as the 138-day record Pulse marks unconfirmed, is shown as context with its verification level and period instead of disappearing;
- verified live: 13-25 June 2025 is established as a nationwide shutdown, February 2026 is not established but reports the unconfirmed record, and the current window reports neither.

### Last known state and missing shutdown access (2026-09-23)

- a source that fails or rate-limits the dashboard falls back to its last successful answer for the same scope, marked `stale` with the time it was fetched, bounded to 120 remembered scopes;
- stale data stays visible as the last known state but cannot support a current claim, cannot count toward coverage and shows no current values; the Overview marks it as `LAST KNOWN SITUATION` and names the outage in the scope line;
- the shutdown tile now names the missing Internet Society Pulse access instead of leaving a generic caveat, and the setup files document how to request it.

### Historical robustness (2026-09-23)

- a tested input that is not a plain host name (`128.31.0.39:9131`, `doh.seby.io:8443`, `varzesh`) is skipped and counted instead of discarding the whole window; five such rows had blinded the dashboard for September 2022;
- the same host in several spellings (`Instagram.com` and `instagram.com`) is merged into one domain group, and a day measured under two spellings counts once; an identical row twice still fails closed;
- validated against the documented September 2022 event: AS58224, AS44244 and AS197207 reproduce blocked services, 5 to 9 connectivity events and a country-wide pattern across 56 measured networks.

### Network scope of a finding (2026-09-23)

- the plain-language panel states in how many measured Iranian networks the headline service is blocked, shows problems or stays reachable, which separates a provider decision from a country-wide pattern;
- one additional aggregation grouped by `probe_asn` answers this for the headline service, so the check costs a single request;
- the comparison is scope evidence: it never raises severity and never counts as a second source.

### Connection quality and OONI quota (2026-09-23)

- Cloudflare Radar quality (latency and bandwidth from real user traffic in the selected network) is a second source for the connection-quality claim, so that claim no longer rests on 2 to 9 RIPE Atlas probes alone;
- the Radar summary endpoint silently answers ASN queries with a 90-day window, so only the daily time series is used and every response is checked against the requested window before it counts;
- the status row states the measured values a reader can relate to (`5.1 Mbit/s · 115 ms`) instead of ping arrival alone;
- the connection-quality claim carries the quartile spread and the DNS response time, so a median no longer stands alone;
- OONI answered `429 quota exceeded` once a dashboard load fired a dozen parallel queries: OONI traffic now passes one gate with at most two parallel requests, daily-grained results are cached for ten minutes, evidence samples are capped at two per load, and a rate limit is reported as such and followed by a cooldown that serves cached values instead of hammering upstream.

## 1.8.0 — 2026-09-10

### Plain-language current situation

- added a prominent current-situation summary derived only from the existing reviewed assessment/public-summary contract rather than introducing a second scoring system;
- distinguishes insufficient data, no corroborated major disruption, one-source elevation, corroborated disruption and strong multi-source disruption;
- exposes supporting signals and control-plane/data-plane divergence while explicitly preserving that BGP visibility is not end-user Internet availability;
- states that absence of a detected major disruption is not proof that Internet access is fully normal and does not automatically claim a complete nationwide shutdown;
- added concise `What this means` explanations to high-value panels while preserving raw values, provenance and technical drill-down.

### English/Farsi UX and RTL

- added a central versioned English/Farsi locale architecture and persistent `EN | فارسی` language switch;
- applies deterministic `en/ltr` and `fa/rtl` document direction;
- translates controlled static text, status text, historical v11-v17 context panels and whitelisted dynamic runtime sentence frames;
- preserves arbitrary external-source content verbatim and adds no runtime Google/DeepL/AI translation dependency;
- keeps ASN, IP/prefix, BGP path, URL, timestamp and other technical values direction-safe/LTR where appropriate;
- added locale-key parity and runtime-translation tests, including technical-token preservation and external-content non-translation.

### Verification / release integrity

- stabilized the recurring legacy Headless Chrome fixture-readiness flake by increasing only virtual-time/process timeout budgets without weakening fixture assertions;
- completion PR #31 CI `34523935503` passed after its deterministic test caught and corrected one untranslated Farsi topology-template value;
- final v1.8 feature `main` CI `34524065320` passed **301/301 tests**, production build, both real Headless Chrome presentation gates, committed-secret/private-key scan and production runtime smoke testing;
- v1.8 changes presentation/i18n behavior only, so no new live-source acceptance or upstream workflow is introduced;
- no new censorship sensor, independent vote or deployment authorization is added; `deploymentAuthorized:false` remains unchanged.

## 1.7.0 — 2026-09-10

### Operational ASN coverage

- added operator-triggered persistence of the existing RIPE/RIR Iran ASN inventory and ipverse enrichment to the bounded local `var/asn-coverage/latest.json` snapshot;
- added fail-closed snapshot validation for schema, IR scope, timestamps, internal counts, SHA-256 provenance, candidate bounds/uniqueness and zero-vote semantics;
- added explicit `observed`, `stale`, `no_data` and `error` states so absence or invalid data cannot become zero Iran ASNs;
- added `GET /api/asn-coverage`, which reads only the local snapshot and performs no dashboard-time RIPE/ipverse network request;
- added the `Coverage and review queue` dashboard panel with bounded analyst-priority rows and preserved context-only semantics;
- kept RIPE/RIR country scope authoritative and ipverse secondary, with no ASN inventory/topology field promoted to censorship evidence.

### Live runtime acceptance / RIPEstat compatibility

- completed a real 2026-09-10 operator acceptance from public upstreams through snapshot persistence, server parsing, `/api/asn-coverage` and browser rendering;
- observed 856 RIR-associated ASNs, 856 registered / 593 RIPE-RIS-routed country-level ASNs, 23/23 curated ASNs inside inventory, 856/856 ipverse metadata matches, zero secondary metadata misses, zero secondary country mismatches and a bounded 100-entry review queue;
- treated those counts as acceptance observations rather than release constants or per-ASN reachability claims;
- fixed live RIPEstat `country-resource-list` compatibility when a valid IR-scoped response omitted the documented `data.resource` echo;
- retained the hard-scoped `resource=IR` request, explicit non-IR rejection and mandatory `data.resources.asn` validation;
- added a deterministic regression test for the observed live response shape.

### CI / release integrity

- disabled redundant routine CI on feature-branch pushes while retaining PR-to-main, `main`, `v*` tag and manual CI triggers;
- kept the large ipverse world download out of routine GitHub Actions;
- v1.7 feature PR #24 CI `34465799214` and post-merge `main` CI `34465863148` passed;
- RIPEstat hotfix PR #26 CI `34469766079` and post-merge `main` CI `34469839475` passed;
- deterministic suite reached **287/287 tests**, with production build, real Headless Chrome presentation, secret/private-key scan and runtime smoke tests passing;
- v1.7.0 does **not** authorize an Iran Fleet Stage-1 pilot; `deploymentAuthorized:false` remains unchanged.

## 1.6.0 — 2026-09-10

### Publication scope

- v1.6.0 is the next published release after v1.4.0; v1.5.0 was repository-verified but was not tagged or published as a GitHub Release;
- the v1.6.0 publication therefore includes both the v1.5 ASN identity/inventory work and the v1.6 shutdown-context work.

### Current shutdown intelligence

- hardened Internet Society Pulse Iran scoping, timestamp validation, selected-window overlap and open-ended-event semantics;
- preserved Pulse verification level, type, cause, affected regions and provenance while keeping `token_required`, `no_data`, observed and error states distinct;
- documented Access Now #KeepItOn STOP as a separate historical curated corpus currently published through 2025;
- added conservative STOP/Pulse correlation requiring temporal overlap plus matching broad scope;
- every correlation remains an analyst candidate with `possibleSameIncident:true`, `automaticMerge:false` and `independentTechnicalVote:false`;
- exposed Pulse and correlation context in `/api/intelligence` and the dashboard without creating a second technical vote or duplicate upstream request.

### Context export / release integrity

- extended context CSV export with Pulse status/events and STOP/Pulse candidate correlations while preserving separate provenance;
- missing Pulse credentials export as `matched=not_inferred`, never zero incidents;
- added two deterministic export regression tests, raising the stable candidate from 275 to **277 tests**;
- added the v1.6 export and shutdown presentation modules to the early syntax gate;
- added canonical `release-notes/v1.6.0.md` and aligned release/version documentation;
- no new periodic workflow or live-source CI dependency was introduced.

### Verification / deployment boundary

- v1.6 backend post-merge `main` CI `34442988321` passed;
- v1.6 dashboard branch CI `34443294299`, PR CI `34443351394` and post-merge `main` CI `34443425466` passed;
- the final release branch must pass the 277-test deterministic suite, release-notes gate, production build, real Headless Chrome, committed-secret/private-key scan and runtime smoke test before publication;
- STOP, Pulse, their correlation, registry/inventory/topology metadata and other contextual sources add zero independent censorship votes;
- v1.6.0 does **not** authorize an Iran Fleet Stage-1 pilot; `deploymentAuthorized:false` remains unchanged.

## 1.5.0 — 2026-09-10

### Registry-qualified Iran ASN scope

- corrected stale/misleading curated ASN identities against current RIPE registry objects and removed AS35718 from Iran scope;
- separated canonical registry identity from operational/business aliases;
- introduced explicit `operatorFamily` grouping so related ASNs cannot be mistaken for independent operators or censorship evidence;
- distinguished TCI from TIC/Zirsakht and ITCO/DCI from TIC;
- expanded reviewed Iran access/backbone/cloud/topology coverage;
- added Fanap Telecom / ZiTEL AS206065 (`FDI`) and AS24631 (`FANAPTELECOM-FCP`) under one operator family.

### Registry drift / provider selection

- added direct RIPE Database REST `aut-num` validation for curated ASN, `as-name`, organization handle and authoritative `ASSIGNED`/`LEGACY` status;
- replaced positional provider comparison selection with an explicit reviewed profile set;
- validated 23/23 curated profiles across 18 operator families in the latest applicable live registry gate.

### Complete country inventory boundary

- documented `data/asns.json` as a curated monitoring/topology catalogue rather than a complete Iran ASN universe;
- added operator-triggered RIPEstat `country-resource-list` inventory based on RIR Statistics country association;
- added separate RIPEstat `country-asns` registered/routed country-level counts with RIS timestamps;
- preserves curated coverage/drift without inferring an undocumented ASN-by-ASN routed set.

### Secondary topology prioritization

- added on-demand CC0 `ipverse/as-metadata` JSON enrichment only after RIPE/RIR establishes Iran scope;
- preserves classification, network-role, prefix/connectivity, provider/customer/peer, degree, reach, `lastAnnounced` and change metadata with source-qualified semantics;
- byte-bounds the world dataset and SHA-256 anchors the exact downloaded bytes;
- surfaces ipverse/RIR country disagreement as a data-quality finding rather than silently changing country scope;
- builds a deterministic analyst review queue using transparent review classes instead of an invented censorship-likelihood score;
- keeps the large world-dataset download out of routine GitHub Actions.

### Verification / deployment boundary

- deterministic suite expanded to **264 tests**;
- feature head CI `34403372561` passed;
- feature PR #15 CI `34440814125` passed;
- v1.5 feature merge to `main` completed in `7821cf56233308f177755d1c92d838e307fac6d2`;
- post-feature-merge `main` CI `34440868635` passed;
- latest applicable full live-source acceptance `34399378248` passed, including direct RIPE registry validation, RIPE RIS Live and Route Views/CAIDA BGPStream broker checks;
- ASN registry/inventory/topology metadata adds zero independent censorship votes;
- v1.5 does **not** authorize an Iran Fleet Stage-1 pilot; repository policy remains `deploymentAuthorized:false`.

## 1.4.0 — 2026-09-09

### Circumvention transport depth

- preserved Iran Tor transport observations as lower/upper estimate bounds rather than exact users;
- added directional comparison only when before/during estimate intervals do not overlap; overlapping/touching intervals remain indeterminate;
- added global BridgeDB requested-transport demand as explicitly `GLOBAL · not Iran-specific` context;
- BridgeDB is excluded from Iran incident correlation and contributes no independent censorship vote.

### Incident context

- added bounded temporal correlation between Iran Tor transport observations and Access Now #KeepItOn STOP incident windows;
- correlation remains temporal context only and cannot create causality, blocking attribution, national availability status or an extra technical vote;
- missing paired observations remain `no_data` and partial upstream coverage remains `partial`.

### Ookla Open Data review

- added a reviewed contract for official quarterly fixed/mobile Ookla Open Data objects;
- no Iran aggregate is published without an approved country-boundary dataset and spatial join;
- bounding-box shortcuts, fabricated country aggregates and throttling/censorship attribution remain prohibited.

### Release integrity / verification

- added canonical `release-notes/vX.Y.Z.md` files and a stable-version release-notes CI gate;
- added a release-publication recovery workflow that fills an empty GitHub Release body from canonical notes without overwriting existing notes;
- deterministic suite expanded to **237 tests**;
- feature branch CI `34388597794` passed;
- feature PR #12 CI `34388825541` passed;
- v1.4 feature merge to `main` completed in `cf121adf1cdc976c58b591b53debf1d9e987bef3`;
- post-feature-merge `main` CI `34389188256` passed;
- live public-source acceptance `34388597366` passed;
- production build, release-notes gate, real headless Chrome, secret/private-key scan and runtime smoke tests passed.

### Deployment boundary

- Tor, BridgeDB, STOP and Ookla remain context-only and add zero independent censorship votes;
- v1.4 does **not** authorize an Iran Fleet Stage-1 pilot or active protocol/circumvention probing;
- province/SIM inference remains prohibited and VPN/NIN claims retain their controlled-target/manual-review gates;
- repository policy remains `deploymentAuthorized:false`.

## 1.3.0 — 2026-09-09

### Topology / route-origin integrity

- added CAIDA ASRank selected-ASN topology context for rank, customer cone, degree and inferred AS relationships;
- preserves ASRank provenance overlap with CAIDA Ark, Route Views and RIPE routing inputs so topology context cannot inflate routing-source independence;
- added RIPEstat RPKI validation for a bounded set of currently announced prefixes plus bounded monthly IPv4/IPv6 VRP history;
- preserves RPKI states `valid`, `invalid_asn`, `invalid_length` and `unknown` without converting them into censorship or hijack intent;
- keeps ASRank and RPKI as context-only evidence with `independentCensorshipVote:false`.

### Circumvention source review

- re-reviewed Psiphon and Ceno/eQualitie as valuable Iran circumvention/resilience context;
- did not create unsupported runtime telemetry adapters because no stable supported public machine-readable Iran time-series API was established;
- retained the rule that reports/articles remain dated contextual evidence rather than scraped or synthetic telemetry.

### Dashboard / verification

- added dedicated ASRank and RPKI dashboard panels separated from censorship assessment/source-family voting;
- expanded the real headless-Chrome gate to verify ASRank/RPKI rendering alongside M-Lab/APNIC/STOP;
- deterministic suite expanded to **211 tests**;
- feature PR #9 CI `34375070768` passed;
- v1.3 feature merge to `main` completed in `4f6615c309c1797f3cbcdaae2700d0d79159ca59`;
- post-feature-merge `main` CI `34382084051` passed **211/211** tests, production build, headless Chrome, secret/private-key scan and runtime smoke tests;
- live public-source acceptance `34374634682` passed, including CAIDA ASRank (`partial`), RIPEstat RPKI (`partial`), RIPE RIS Live and Route Views/CAIDA BGPStream.

### Deployment boundary

- v1.3 does **not** authorize an Iran Fleet Stage-1 pilot;
- `partial`, `no_data` and errors remain explicit and never become national/province availability verdicts;
- external systemd/egress, real controlled endpoint, key-management, rollback, voluntary operator-consent and explicit authorization gates remain mandatory;
- repository policy remains `deploymentAuthorized:false`.

## 1.2.0 — 2026-09-09

### Routing / source depth

- added a second passive routing path through CAIDA BGPStream tooling restricted to Route Views live resources;
- explicitly prevents RIPE data accessed through BGPStream from being double-counted as an independent source;
- added bounded Route Views collection and a real CAIDA broker acceptance gate;
- retained all BGP/Route Views/RIS events as control-plane context rather than censorship votes.

### Owned-probe fleet laboratory architecture

- added signed short-lived Ed25519 manifests containing only approved target IDs and bounded Class-A DNS/TCP/TLS/HTTPS test definitions;
- added local endpoint resolution so the scheduler cannot supply arbitrary hosts, URLs, ports or commands;
- added authenticated HMAC result envelopes, strict schemas and rejection of sensitive/device/subscriber/network identity fields;
- added bounded ingestion, replay, rate, concurrency and memory-only queue controls;
- added local kill/enable gates and time-bounded pseudonymous consent/withdrawal enforcement;
- added fixed Stage-1 HTTPS control/collection contracts with hostname verification and SPKI pinning;
- added collection-edge admission controls that exclude source IP/X-Forwarded-For from evidence/identity semantics;
- added systemd laboratory sandbox/default-deny specifications and negative egress validation tooling;
- added key provisioning/rotation/revocation requirements with no committed/CLI secrets;
- added fail-closed rollback with local withdrawal, central revocation, target retirement, known-safe version selection, no remote shell and no automatic re-enable;
- added per-probe publication isolation so multiple owned probes remain one source family and cannot produce national/province availability badges.

### Protocol / NIN / segmentation evidence policy

- defined a fail-closed VPN/circumvention protocol gate: website reachability is not WireGuard/OpenVPN/V2Ray/Outline transport evidence;
- actual transport evidence requires controlled endpoints, neutral controls, same-probe pairing, repeated observations, documented coverage, reviewed design and analyst review;
- even complete protocol evidence is analyst-review readiness, never an automatic blocked/available verdict;
- defined NIN-vs-global prerequisites using separately reviewed target classes, at least two independently hosted global controls and same-probe bounded-time pairing;
- kept NIN comparison non-operational because the current target policy does not authorize a NIN target class;
- formally deferred province publication and forbade source-IP/ASN/latency-derived province inference;
- marked white-SIM vs ordinary-SIM measurement NO-GO under the current privacy model.

### Additional source review

- reviewed APNIC HTTP/3/QUIC, DNS-over-IPv6 and DNS query-type/HTTPS-record data as contextual protocol/deployment candidates;
- did not add unsupported visualization scraping or pseudo-independent runtime sources where a stable supported machine-readable/provenance contract was not established.

### UI / verification

- added a real headless Chrome/Chromium presentation gate without Playwright/Puppeteer dependencies;
- the gate loads the actual context module through a loopback fixture and verifies M-Lab, APNIC and Access Now STOP rendering and separated source-family semantics;
- deterministic suite expanded to **203 tests**;
- readiness CI `34366466998` passed;
- PR #6 CI `34368934884` passed;
- v1.2 feature merge to `main` completed in `9dac687bc9bf83282ad3aa650255cafbb372160c`;
- post-feature-merge `main` CI `34369377194` passed;
- live public-source acceptance `34365369630` passed on the corresponding runtime/UI implementation.

### Deployment boundary

- v1.2 release code includes the Fleet Stage-1 laboratory architecture but does **not** authorize an Iran pilot;
- external systemd/egress, real endpoint, key-management, rollback and voluntary operator-consent gates remain mandatory plus explicit authorization;
- repository policy remains `deploymentAuthorized:false`.

## 1.1.0 — 2026-09-09

- shifted the product toward Iran-specific censorship intelligence with strict measurement/context separation;
- added Censored Planet, RIPEstat/RIPE RIS, Globalping, PeeringDB, IHR, Citizen Lab, Tor transport bounds, Cloudflare protocol context, M-Lab NDT, APNIC IPv6 and passive RIPE RIS Live;
- hardened RIPE Atlas through bounded per-probe daily `ping-stats` and excluded partial coverage from corroboration/divergence;
- added Access Now #KeepItOn STOP structured incidents with root-evidence lineage and no independent vote;
- exposed M-Lab/APNIC/STOP context in the dashboard with a separate context CSV export;
- retained explicit `no_data`/`partial`/error semantics and prohibited province/VPN fabrication;
- released from final production commit `9087809d6a87ae578dd590d185c35b4438319b2d` with tag/Release `v1.1.0`.

## 1.0.1 — 2026-09-08

- enabled Cloudflare Radar integration with a real server-side Radar Read token;
- added consistent Iran + selected-ASN scoping, range-aware aggregation, traffic-anomaly normalization and read-only Radar acceptance testing;
- kept credentials out of source/Git/build artifacts.

## 1.0.0 — 2026-09-08

- reconstructed the incomplete prototype export as a standalone Node.js application;
- removed simulated monitoring values and runtime dependency on prototype-specific modules;
- rebuilt the monitoring UI with explicit no-data/error states;
- hardened OONI/RIPE Atlas and added IODA, Tor, provider context and deterministic tests;
- eliminated third-party npm runtime dependencies.
