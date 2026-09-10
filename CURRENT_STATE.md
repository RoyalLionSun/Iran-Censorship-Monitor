# Current State — v1.5.0 release candidate

Date: **2026-09-10**  
Release line: **`v1.5.0`**  
Production branch: **`main`**  
v1.5 feature merge: **`7821cf56233308f177755d1c92d838e307fac6d2`**  
Release metadata branch: **`release/v1.5.0`**

## Branch / release state

- PR #15 merged the complete v1.5 feature line to `main` in merge commit `7821cf56233308f177755d1c92d838e307fac6d2`.
- PR #15 CI `34440814125` passed.
- Post-feature-merge `main` CI `34440868635` passed.
- The deterministic suite is **264/264** and the release-notes, production-build, headless-Chrome, committed-secret/private-key and runtime-smoke gates are green.
- Latest applicable full live public-source acceptance `34399378248` passed on the registry/runtime line, including 23/23 curated RIPE registry identities, RIPE RIS Live and the Route Views/CAIDA BGPStream broker.
- `release/v1.5.0` exists only to finalize stable version and release metadata before tag/GitHub Release publication.

## v1.5 implemented scope

### Registry-qualified Iran ASN catalogue

- `data/asns.json` now keeps canonical RIPE registry identity separate from operational/business aliases;
- known stale/misleading labels were corrected and AS35718 was removed from Iran scope after current registry evidence identified it outside Iran;
- TCI, TIC/Zirsakht and ITCO/DCI are kept as distinct organizations/families where registry identity requires it;
- related ASNs are grouped through explicit `operatorFamily` values so they cannot be mistaken for independent operators or independent censorship evidence;
- provider comparison selection is an explicit reviewed flag/set rather than array position.

### Fanap Telecom / ZiTEL

- AS206065 (`FDI`) and AS24631 (`FANAPTELECOM-FCP`) are separate reviewed profiles under current RIPE organization `ORG-PNEV1-RIPE`;
- Fanap Telecom / ZiTEL aliases are retained without replacing canonical registry identity;
- both ASNs belong to `operatorFamily: fanap-telecom`;
- only the reviewed AS206065 access profile participates in the provider comparison.

### Registry drift validation

- curated profiles are validated through direct RIPE Database REST `aut-num` objects;
- hard keys are ASN, `as-name`, organization handle and authoritative `ASSIGNED`/`LEGACY` status;
- unexpected/missing registry identity fails closed;
- registry metadata remains context only and always carries zero independent censorship votes.

### Complete Iran ASN inventory boundary

- `data/asns.json` is explicitly a curated monitoring/topology catalogue, not a claim of complete Iran ASN coverage;
- RIPEstat `country-resource-list` provides the operator-triggered RIR-statistics base inventory;
- RIPEstat `country-asns` level-of-detail 0 separately exposes registered/routed country-level counts and RIS timestamps;
- an ASN-by-ASN routed set is not inferred from undocumented detail fields;
- curated coverage and curated-outside-inventory drift are reported explicitly.

### Secondary topology prioritization

- the operator-triggered inventory command can enrich the RIPE-selected Iran ASN set from the public CC0 `ipverse/as-metadata` JSON dataset;
- secondary category/network-role, prefix, provider/customer/peer, degree, reach, `lastAnnounced` and change timestamps remain source-qualified metadata;
- exact downloaded bytes are SHA-256 anchored and bounded by a download ceiling;
- ipverse country disagreement is surfaced as a quality finding and cannot override the RIR inventory;
- review candidates use transparent deterministic classes, not an invented censorship-likelihood score;
- the large world dataset is intentionally not downloaded in routine GitHub Actions.

## Verification

- feature head `49fe1f5127fb8debc857cb5907486b9cc8a8d20c`: CI `34403372561` — success, **264/264**;
- feature PR #15 CI `34440814125` — success;
- feature merge `7821cf56233308f177755d1c92d838e307fac6d2`;
- post-feature-merge `main` CI `34440868635` — success;
- production build — success;
- stable release-notes gate — success on current v1.4 package state and required again after v1.5 stable metadata is applied;
- real Headless Chrome presentation gate — success;
- committed-secret/private-key gate — success;
- runtime/root/404/traversal smoke gate — success;
- live public-source acceptance `34399378248` — success on the latest registry/runtime commit requiring that gate;
- direct RIPE registry validation in that live run — **23/23 profiles, 18 operator families**.

The operator-triggered complete ipverse world-dataset download is not a routine CI acceptance source. Release verification therefore does not claim a current full-world enrichment fetch; parser, provenance, filtering, prioritization and failure semantics are deterministic-test covered.

## Fleet Stage-1 deployment boundary

Releasing v1.5 does **not** authorize an Iran pilot. External gates still required before any real Iran pilot:

1. real isolated Linux/systemd host verification of kernel/cgroup sandbox and negative egress behavior;
2. real project-controlled Class-A measurement/control endpoints and collection edge;
3. out-of-band key provisioning, rotation and revocation exercise;
4. rollback exercise against a known-safe version;
5. a real voluntary pilot operator with explicit consent outside the repository;
6. explicit authorization before enabling the pilot.

Repository policy continues to expose `deploymentAuthorized:false`.

## Methodological invariants

- no fabricated values;
- no `no_data` → zero/available conversion;
- RIR country association ≠ current routing;
- BGP visibility ≠ end-user reachability;
- registry identity/topology metadata ≠ censorship behavior or intent;
- multiple ASNs in one operator family ≠ independent censorship sources;
- anomaly ≠ confirmed censorship;
- performance degradation ≠ automatic throttling attribution;
- secondary ipverse classification cannot override RIR country scope;
- Tor/BridgeDB/STOP/Ookla context adds zero independent censorship votes;
- multiple owned probes ≠ multiple independent sources;
- no province inference from network metadata;
- no SIM-class inference;
- no NIN claim without validated paired target classes;
- no VPN protocol claim from a website-only test.
