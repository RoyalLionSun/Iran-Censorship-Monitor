# Current State — v1.4.0 release candidate

Date: **2026-09-09**  
Release line: **`v1.4.0`**  
Production branch: **`main`**  
v1.4 feature merge: **`cf121adf1cdc976c58b591b53debf1d9e987bef3`**  
Release metadata branch: **`release/v1.4.0`**

## Branch / release state

- PR #12 merged the complete v1.4 feature line to `main` in merge commit `cf121adf1cdc976c58b591b53debf1d9e987bef3`.
- PR #12 CI `34388825541` passed.
- Post-feature-merge `main` CI `34389188256` passed.
- The deterministic suite is **237/237** and the release-notes, production-build, headless-Chrome, committed-secret/private-key and runtime-smoke gates are green.
- Live public-source acceptance `34388597366` passed on the v1.4 runtime/UI line.
- `release/v1.4.0` exists only to finalize stable version and release metadata before tag/GitHub Release publication.

## v1.4 implemented scope

### Tor transport bounds

- Iran Tor transport observations preserve lower/upper estimate intervals rather than exact users;
- a higher/lower direction is reported only when paired estimate intervals do not overlap;
- overlapping/touching intervals remain explicitly indeterminate;
- missing paired observations remain `no_data`.

### BridgeDB scope separation

- BridgeDB requested-transport demand is retained as global context only;
- the dashboard labels it `GLOBAL · not Iran-specific`;
- it is excluded from Iran incident correlation and cannot become an Iran usage estimate or independent technical vote.

### STOP temporal context

- Iran Tor transport bounds can be aligned with Access Now #KeepItOn STOP incident windows;
- correlation is temporal context only, with no causality or blocking attribution;
- no national availability verdict or new censorship vote is created.

### Ookla Open Data feasibility

- the official quarterly fixed/mobile Open Data object contract is documented and tested;
- no Iran aggregate is published without a reviewed country boundary and spatial join;
- bounding-box shortcuts and automatic throttling/censorship attribution remain prohibited.

### Release integrity

- canonical release notes live under `release-notes/vX.Y.Z.md`;
- stable package versions require valid release notes in CI;
- empty GitHub Release bodies can be populated from canonical notes after publication without overwriting existing notes.

## Fleet Stage-1 deployment boundary

Releasing v1.4 does **not** authorize an Iran pilot. External gates still required before any real Iran pilot:

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
- BGP visibility ≠ end-user reachability;
- anomaly ≠ confirmed censorship;
- performance degradation ≠ automatic throttling attribution;
- Tor/BridgeDB/STOP/Ookla context adds zero independent censorship votes;
- multiple owned probes ≠ multiple independent sources;
- no province inference from network metadata;
- no SIM-class inference;
- no NIN claim without validated paired target classes;
- no VPN protocol claim from a website-only test.
