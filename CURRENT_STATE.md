# Current State — v1.3.0 release candidate

Date: **2026-09-09**  
Release line: **`v1.3.0`**  
Production branch: **`main`**  
v1.3 feature merge: **`4f6615c309c1797f3cbcdaae2700d0d79159ca59`**  
Release metadata branch: **`release/v1.3.0`**

## Branch / release state

- PR #9 merged the complete v1.3 feature line to `main` in merge commit `4f6615c309c1797f3cbcdaae2700d0d79159ca59`.
- PR #9 CI `34375070768` passed.
- Post-feature-merge `main` CI `34382084051` passed **211/211** tests plus build, headless Chrome, secret/private-key scan and runtime smoke tests.
- `release/v1.3.0` exists only to finalize version/release metadata before tagging and GitHub Release publication.
- The previous `v1.2.0` release remains valid historical release state.

## v1.3 implemented scope

### CAIDA ASRank topology context

- selected-ASN rank, customer-cone size, degree and inferred AS relationship context;
- bounded relationship output and public API access;
- runtime evidence role remains `topology-context`;
- ASRank is derived in part from CAIDA Ark plus Route Views/RIPE BGP inputs, therefore it does not create an independent censorship/routing vote;
- `independentCensorshipVote:false` is preserved.

### RIPEstat RPKI integrity context

- validates a bounded set of currently announced selected-ASN prefixes;
- preserves `valid`, `invalid_asn`, `invalid_length` and `unknown` states;
- includes bounded monthly IPv4/IPv6 VRP history;
- remains inside the RIPE routing source family;
- an invalid/unknown RPKI state is not automatically censorship or route-hijack intent.

### Circumvention source review

Psiphon and Ceno/eQualitie remain important Iran circumvention/resilience context. No runtime time-series adapter was admitted because the review did not establish a stable supported public machine-readable Iran telemetry API. Reports remain dated contextual evidence; unsupported chart/page scraping is prohibited.

### Dashboard / presentation

- dedicated ASRank and RPKI context panels were added;
- neither panel contributes to the censorship assessment/source-family vote count;
- the real headless Chrome gate now verifies M-Lab/APNIC/STOP plus ASRank/RPKI rendering;
- `partial`, `no_data` and errors remain visible rather than being converted to success/zero states.

## Verification

- deterministic suite: **211/211**;
- feature PR #9 CI `34375070768` — success;
- post-feature-merge `main` CI `34382084051` — success;
- production build — success;
- real headless Chrome UI presentation gate — success;
- committed-secret/private-key gate — success;
- runtime/root/404/traversal smoke gate — success;
- live public-source acceptance `34374634682` — success;
- CAIDA ASRank live state during acceptance: `partial`;
- RIPEstat RPKI live state during acceptance: `partial`;
- RIPE RIS Live handshake — success;
- Route Views/CAIDA BGPStream broker — success.

## Fleet Stage-1 deployment boundary

Releasing v1.3 does **not** authorize an Iran pilot. External gates still required before any real Iran pilot:

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
- RPKI invalid/unknown ≠ censorship/hijack intent;
- topology context ≠ reachability evidence;
- multiple owned probes ≠ multiple independent sources;
- no national/province badge from fleet observations;
- no province inference from network metadata;
- no SIM-class inference;
- no NIN claim without validated paired target classes;
- no VPN protocol claim from a website-only test.
