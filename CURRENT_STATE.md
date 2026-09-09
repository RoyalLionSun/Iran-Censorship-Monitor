# Current State — v1.2.0 release candidate

Date: **2026-09-09**  
Release line: **`v1.2.0`**  
Production branch: **`main`**  
v1.2 feature merge: **`9dac687bc9bf83282ad3aa650255cafbb372160c`**  
Release metadata branch: **`release/v1.2.0`**

## Branch / release state

- PR #6 merged the complete v1.2 development line to `main` in merge commit `9dac687bc9bf83282ad3aa650255cafbb372160c`.
- PR #6 CI `34368934884` and post-feature-merge `main` CI `34369377194` both passed.
- `release/v1.2.0` exists only to finalize release/version metadata before tagging.
- Tag and GitHub Release `v1.2.0` are the remaining publication operation after release-metadata CI/merge.
- The previous `v1.1.0` tag/Release remains valid historical release state.

## v1.2 implemented scope

### Second routing source

- passive Route Views live collection through CAIDA BGPStream/bgpreader tooling;
- prefix scope reuses validated current announced-prefix boundaries;
- Route Views provenance remains distinct from RIPE RIS;
- BGPStream itself is an access/normalization framework, not an independent sensor;
- routing events remain control-plane evidence and never an independent censorship vote.

### Owned-probe laboratory architecture

Implemented fail-closed layers include:

- Ed25519-signed short-lived manifests containing target IDs only;
- local project-controlled Class-A target registry;
- DNS/TCP/TLS/HTTPS families only;
- local execution compiler preventing scheduler-supplied host/URL/port/command values;
- authenticated HMAC result envelopes;
- sensitive/free-form metadata rejection;
- bounded ingestion size, replay and per-probe/global rate/concurrency guards;
- bounded memory-only result queue;
- local enable and consent gates before transport or measurement;
- fixed HTTPS Stage-1 control/collection contract with hostname validation and SPKI pins;
- collection-edge normalization that does not use source IP/X-Forwarded-For as evidence or persistent identity;
- systemd laboratory sandbox/default-deny specifications and validators;
- key provisioning/rotation/revocation policy;
- rollback plan with no remote shell and no automatic re-enable;
- per-probe publication model preventing national/province status or independent-source inflation.

### Evidence policy

- provider website reachability is not VPN transport-protocol evidence;
- WireGuard/OpenVPN/V2Ray/Outline evidence requires controlled transport endpoint, neutral control, paired same-probe observations, coverage, reviewed design and analyst review;
- even a complete protocol gate is `analyst_review_ready`, not automatic `blocked`/`available`;
- NIN-vs-global requires separately reviewed domestic/global target classes, at least two independently hosted global controls and paired observations;
- current Class-A policy does not authorize a NIN target class, therefore NIN comparison remains non-operational;
- province publication remains deferred/NO-GO and source-IP geography is forbidden;
- white-SIM vs ordinary-SIM remains NO-GO because the design intentionally does not collect sensitive subscriber/entitlement identifiers.

### Additional source review

APNIC HTTP/3/QUIC, DNS-over-IPv6 and DNS query-type/HTTPS-record views were reviewed as potentially useful protocol/deployment context. No new runtime adapter was admitted because the review did not establish a sufficiently stable supported machine-readable contract plus enough independent censorship interpretability. Unsupported visualization scraping remains prohibited.

### UI verification

CI now starts a loopback fixture and a real headless Chrome/Chromium process, loads the actual context layer, and verifies rendered M-Lab, APNIC and STOP context plus separated source-family semantics.

## Release-line verification

- **203/203 deterministic tests**;
- readiness CI `34366466998` — success;
- PR #6 CI `34368934884` — success;
- post-feature-merge `main` CI `34369377194` — success;
- production build — success;
- real headless Chrome UI presentation gate — success;
- committed-secret/private-key gate — success;
- runtime/root/404/traversal smoke gate — success;
- live public-source acceptance `34365369630` — success.

## Pilot deployment boundary

Releasing v1.2 does **not** authorize an Iran pilot. External gates still required before any real Iran pilot:

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
- multiple owned probes ≠ multiple independent sources;
- no national/province badge from fleet observations;
- no province inference from network metadata;
- no SIM-class inference;
- no NIN claim without validated paired target classes;
- no VPN protocol claim from a website-only test.
