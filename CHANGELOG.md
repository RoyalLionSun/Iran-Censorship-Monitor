# Changelog

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
