# Stage 0 fleet security review — v1.2

Status: **Stage 0 laboratory controls accepted; Stage 1 Iran deployment NOT AUTHORIZED.**

Review point:
- branch: `develop/v1.2`
- reviewed implementation head: `82aef889d474a8203c58e84015aa258264796882`
- latest CI: `34348398151`
- CI result: 134/134 tests passed, 0 skipped; production build, committed-secret checks and runtime smoke tests passed
- production baseline `main` / `v1.1.0` remains separate and unchanged by this review

This review establishes what the current code proves. It does not claim that laboratory controls eliminate risk for a probe operated inside Iran.

## Review conclusion

The v1.2 Stage 0 implementation now demonstrates a narrow, default-deny, laboratory-only Class A measurement path with cryptographic authorization and bounded result ingestion.

The implementation is suitable to proceed to **Stage 1 architecture/security preparation only**. It is not suitable for an Iran deployment yet because transport, production target provenance, data/log retention, consent/withdrawal, deployment sandboxing, key provisioning and operational rollback remain undecided or unimplemented.

## Verified control chain

### 1. Scheduler cannot create arbitrary targets

Verified properties:
- scheduler manifest carries `targetId`, family, address family, timeout and bounded attempts;
- host, IP, URL, port and command fields are rejected in the manifest;
- the probe resolves host/port only from its locally installed target registry;
- target registry accepts only explicitly approved/enabled, project-controlled Class A targets;
- target/family mismatch fails closed.

Evidence:
- protocol commit `37b774dd0764c592764df8735a3d3945dee3c013`;
- execution-plan commit `9aabbc0dd0faa9b9a1fe6b960a25ddaabdbef5b9`;
- CI progressed from 92/92 to 99/99 tests with these controls.

### 2. Scheduler authorization is cryptographically bound

Verified properties:
- manifests use Ed25519 signatures;
- unsigned/tampered manifests fail before adapter execution;
- manifest lifetime is bounded;
- unknown target/test definitions fail closed;
- result identity is bound to manifest nonce/test/target/family/address family;
- a completed measurement outside the signed manifest time window is discarded;
- ingestion independently rejects a valid-HMAC result measured outside that signed window.

Evidence:
- protocol implementation in `lib/fleet.mjs`;
- runner/manifest-window hardening at `82aef889d474a8203c58e84015aa258264796882`;
- CI `34348398151`.

### 3. Local operator gate is default deny

Verified properties:
- Stage 0 enable file must be an absolute local path;
- absent/unreadable file means disabled;
- incorrect content means disabled;
- only the exact local marker enables execution;
- disabled state returns zero measurements before scheduler inputs are needed;
- central service cannot remotely set this local gate through the runner API.

The current marker is:

`FLEET_STAGE0_ENABLED=1`

This marker is a laboratory gate, not the final deployed kill-switch design.

### 4. Stage 0 network execution is outbound-only and loopback-only

Verified properties:
- actual adapter module contains client network primitives only;
- no server/listener or child-process primitives exist in the probe adapter module;
- every non-loopback host is rejected before DNS/socket activity;
- tests perform real local DNS, TCP, TLS and HTTPS client operations;
- TLS/HTTPS fixtures and temporary test certificate material exist only in test code/runtime;
- HTTPS sends `HEAD /` and does not follow redirects;
- TCP refusal is `connect_error`;
- HTTP 5xx is `http_error`;
- stalled TLS is bounded `timeout`;
- none of these outcomes is translated into `blocked` or a censorship conclusion.

Evidence:
- commit `c9c119cdddcd656e3d2ed388c05ff73b61e2998b`;
- CI `34347885494`: 127/127 tests, 0 skipped.

### 5. Probe result schema minimizes dangerous/sensitive data

Verified properties:
- result contains pseudonymous `probeId`, policy/manifest/test/target identity, protocol stages, timing and controlled error class;
- result does not contain host/port/url;
- result schema rejects source IP, IMSI, IMEI, MSISDN, phone number, SIM serial/ICCID, SSID/BSSID, MAC address, GPS/coordinates, hostname/host/url/port and command/shell-style fields;
- missing data is not synthesized.

The current schema intentionally has no province, SIM-class or inferred geolocation field.

### 6. Probe result authentication and revocation are bounded

Verified properties:
- result envelope is HMAC-authenticated with a per-probe secret;
- probe registry stores status/policy only and no embedded secret;
- secret lookup is a separate resolver boundary;
- rotating the secret immediately invalidates the previous secret;
- withdrawing the secret revokes ingestion;
- disabling a probe rejects before secret lookup;
- too-short local probe secret fails before measurement execution.

Evidence:
- ingestion commits `d5a17c6839623f96cc47d9881a32903084940dab` and fix `8f483cfd7d203c31c0dda01595d20ba7021a21a0`;
- credential/no-data commit `20b0ddfd2a07775531466425806a60c02b5f27a1`.

### 7. Ingestion is bounded and fail closed

Verified properties:
- default result-envelope limit is 16 KiB;
- malformed envelopes fail before probe lookup;
- schema/MAC/manifest/time validation precede acceptance;
- replay guard is bounded by TTL and capacity;
- duplicate replay does not become another observation;
- per-probe in-memory rate guard is bounded;
- malformed/stale results remain errors rather than `no_data` or zero observations;
- no HTTP ingestion route exists;
- no fleet result persistence exists in Stage 0.

CI history intentionally includes one useful red gate:
- run `34346989050` failed 108/109 because a negative test detected malformed-envelope validation order;
- fix `8f483cfd7d203c31c0dda01595d20ba7021a21a0` restored the intended fail-closed order;
- subsequent CI `34347100114` passed 109/109.

### 8. Coverage semantics cannot create a national/province claim

Verified properties:
- missing result is `no_data`, not proof that a probe is offline;
- without an explicit heartbeat, `offlineInferenceAllowed:false`;
- one observed probe among multiple expected probes produces partial coverage;
- complete enabled-probe collection may produce `observed` **coverage**, not a country availability conclusion;
- `aggregatePublicationAllowed:false`;
- `nationalStatus:null`;
- `provinceStatus:null`;
- owned-fleet results remain one source family and `independentCensorshipVote:false`.

Evidence:
- commit `20b0ddfd2a07775531466425806a60c02b5f27a1`;
- CI `34347462206`: 118/118 tests.

## Stage 0 acceptance matrix

| Control | Status | Evidence |
| --- | --- | --- |
| Signed bounded manifests | PASS | `37b774d…`, `82aef88…` |
| Local target allowlist | PASS | `9aabbc0…` |
| Arbitrary target/port/command prevention | PASS | 99/99 execution-boundary gate and later CI |
| Default-deny local kill gate | PASS | `82aef88…` |
| Outbound-only probe adapter posture | PASS | `c9c119c…` static + live-loopback tests |
| Real Class A DNS/TCP/TLS/HTTPS laboratory execution | PASS | CI `34347885494` |
| Result HMAC + manifest binding | PASS | `37b774d…`, `8f483cf…`, `82aef88…` |
| Replay/rate/request-size bounds | PASS | `8f483cf…` |
| Credential rotation/revocation | PASS | `20b0ddf…` |
| Explicit no-data/offline semantics | PASS | `20b0ddf…` |
| National/province publication lock | PASS | `20b0ddf…` |
| End-to-end runner → ingestion | PASS | CI `34348398151` |
| Iran deployment | **NOT AUTHORIZED** | Stage 1 blockers below |

## Stage 1 blockers — must remain NO-GO until closed

### A. Operator safety and consent

Required before deployment:
- identify one explicitly consenting pilot operator;
- provide an understandable description of observable network behavior and risks;
- define withdrawal procedure that does not depend on central connectivity;
- define who can authorize start/stop and emergency revocation;
- document what the operator must do if equipment or credentials are seized/lost.

No operator identity belongs in the Git repository.

### B. Production target registry

Required:
- establish project-controlled benign Class A endpoints;
- document ownership/operator and purpose;
- pin allowed services/ports and expected request behavior;
- define activation/retirement and periodic revalidation;
- use more than one independently hosted global control endpoint before interpreting global reachability;
- do not introduce NIN labels without separate documented network evidence.

The Stage 0 loopback allowlist must not simply be changed to arbitrary external hosts without this review.

### C. Outbound control and collection transport

No deployed transport exists yet.

Required design properties:
- probe initiates connections; central infrastructure never connects inbound to the probe;
- authenticated TLS with a reviewed server-authentication strategy;
- signed manifest retrieval separated conceptually from result authentication;
- bounded polling/backoff/jitter;
- strict response/request limits;
- no generic RPC, shell, plugin download or command execution;
- no fallback to wider destinations if control infrastructure is unreachable;
- egress allowlist where technically practical;
- transport failure must produce no expansion of measurement scope.

### D. Secret/key provisioning and recovery

Required:
- scheduler signing private key storage policy;
- probe public-key distribution/pinning policy;
- per-probe secret provisioning method;
- rotation cadence and emergency rotation procedure;
- loss/replacement/re-enrollment procedure;
- confirmation that secrets are not passed through unsafe command-line arguments or committed config files.

### E. Service hardening

Required for the actual probe platform:
- dedicated unprivileged service identity;
- filesystem write restrictions;
- no listening ports in deployed service posture;
- systemd/OS sandboxing appropriate to platform;
- outbound firewall/egress policy where possible;
- resource ceilings and watchdog behavior;
- secure update procedure separate from ordinary measurement manifests.

Stage 0's module-level client-only invariant does not replace host-level firewall/sandbox validation.

### F. Source-IP, logs and retention

Required before an Iran request reaches production infrastructure:
- decide whether source IP is retained at all and for how long;
- define whether ASN derivation occurs and where;
- define reverse-proxy/load-balancer/application log fields;
- set maximum infrastructure-log retention and access controls;
- define raw result retention or decide to avoid raw persistence;
- define aggregate retention;
- define deletion behavior when operator withdraws;
- test that secrets and sensitive metadata are absent from logs.

### G. Collection-edge abuse controls

Stage 0 has an in-memory per-probe rate guard but no real edge.

Required:
- global request-size/rate/concurrency ceilings;
- per-probe ceilings at the authenticated edge;
- replay state appropriate to the chosen persistence model;
- fail-closed behavior when replay/rate state is unavailable or capacity is exhausted;
- no unbounded queues.

### H. Deployment rollback

Required:
- local operator kill switch tested on the target OS;
- central credential revocation tested independently;
- target retirement tested;
- rollback to known-safe software/policy version documented;
- emergency procedure must not require enabling a generic remote shell.

### I. Dashboard isolation

Required before displaying pilot data:
- keep Stage 1 results per-probe/per-network;
- no national/province availability badge;
- no independent-source inflation from multiple fleet probes;
- no automatic `blocked` interpretation;
- retain `no_data`/`partial` semantics when coverage is missing.

## Explicitly out of scope for Stage 1

The following remain disabled even after Stage 1 approval:
- WireGuard/OpenVPN/V2Ray/Outline testing;
- Tor/circumvention activation;
- blocked-site lists;
- DPI trigger strings/fuzzing;
- throughput stress tests;
- arbitrary traceroute/scanning;
- white-SIM/ordinary-SIM inference;
- province inference from source IP;
- NIN-vs-global policy claims without separately validated target classification and paired measurements.

## Recommended next engineering order

1. design the outbound control/collection transport as a document and threat-model update;
2. define data/log retention and source-IP handling;
3. define operator consent/withdrawal and emergency revocation procedure;
4. define scheduler/probe key provisioning and rotation runbook;
5. define production Class A target registry requirements;
6. define OS/service sandbox and egress policy;
7. implement the transport in a laboratory environment against project-controlled external test infrastructure;
8. re-run a dedicated Stage 1 pre-deployment security gate;
9. only then request explicit authorization for one consenting Iran pilot.

## Decision

**Stage 0: PASS for laboratory development.**

**Stage 1 Iran pilot: NO-GO.**

No code change, green CI result, issue status or future release automatically changes this decision. Stage 1 requires explicit review of the remaining blockers and an explicit authorization before deployment.
