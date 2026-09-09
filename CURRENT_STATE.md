# Current State — v1.2.0-dev

Date: **2026-09-09**  
Production release: **`v1.1.0`**  
Production branch: **`main`**  
Production commit: **`9087809d6a87ae578dd590d185c35b4438319b2d`**  
Development branch: **`develop/v1.2`**

## Branch / release state

- `main` is the published v1.1.0 production source.
- tag and GitHub Release `v1.1.0` are published and verified against the production commit.
- old v1.1 development/release/bootstrap branches were removed after release cleanup.
- `develop/v1.2` was created directly from the released `main` and is the only active development branch.
- v1.2 is **not merged, tagged or released**.

## v1.2 implemented repository scope

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

APNIC HTTP/3/QUIC, DNS-over-IPv6 and DNS query-type/HTTPS-record views were reviewed as potentially useful protocol/deployment context. No new runtime adapter was admitted because the review did not establish a sufficiently stable supported machine-readable contract plus enough independent censorship interpretability to justify one. Unsupported visualization scraping remains prohibited.

### UI verification

The previous v1.1 presentation-testing limitation is closed in v1.2 development. CI now starts a loopback fixture and a real headless Chrome/Chromium process, loads the actual `public/v11-context.js`, and verifies rendered M-Lab, APNIC and STOP context plus the separate source-family semantics.

## Current verification

Latest verified runtime/UI head before this documentation-only readiness pass:

- **203/203 deterministic tests**;
- CI `34365724780` — success;
- production build — success;
- real headless Chrome UI presentation gate — success;
- committed-secret/private-key gate — success;
- runtime/root/404/traversal smoke gate — success;
- live public-source acceptance `34365369630` — success.

The earlier browser-gate failure was a fixture deadlock caused by synchronous Chrome execution blocking the local Node fixture server. Commit `330ca12a6819dc4657d60f35c164e28c01b24f1b` changed the harness to asynchronous browser execution; the real UI then passed.

## Release-readiness boundary

Repository/laboratory development is mature enough for a v1.2 pre-release review, but **Iran pilot deployment remains NO-GO**.

External gates still required before any real Iran pilot:

1. real isolated Linux/systemd host verification of kernel/cgroup sandbox and negative egress behavior;
2. real project-controlled Class-A measurement/control endpoints and collection edge;
3. out-of-band key provisioning, rotation and revocation exercise;
4. rollback exercise against a known-safe version;
5. a real voluntary pilot operator with explicit consent outside the repository;
6. explicit authorization before enabling the pilot.

A green repository, CI result, documentation review, PR or future release never substitutes for those external gates. Repository policy continues to expose `deploymentAuthorized:false`.

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
