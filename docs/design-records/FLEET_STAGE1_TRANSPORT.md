# Stage 1 fleet transport architecture — v1.2

Status: **design only / NOT deployment authorization**.

This document defines the control and collection transport that must be implemented and laboratory-tested before a one-probe Iran Stage 1 pilot can even be considered. It does not authorize an external probe, an Iran endpoint, or removal of the Stage 0 loopback restriction.

Related documents:
- `MEASUREMENT_FLEET.md`
- `FLEET_STAGE0_REVIEW.md`

## Goals

The deployed transport must preserve the Stage 0 safety properties while allowing a probe to:

1. obtain a small signed measurement manifest from project-controlled infrastructure;
2. execute only locally allowlisted Class A tests;
3. submit authenticated normalized result envelopes;
4. fail closed when control/collection infrastructure is unavailable or untrusted.

The transport is not a remote-management channel.

## Non-goals

The transport must not provide:

- inbound connectivity to a probe;
- remote shell, SSH, generic RPC or arbitrary command execution;
- plugin/script/binary download or remote code loading;
- arbitrary target/URL/port distribution;
- dynamic proxy/VPN/circumvention configuration;
- measurement catch-up after an outage;
- fallback to alternate unreviewed hosts, ports or protocols;
- automatic expansion from Class A to Class B/C/D;
- a generic file upload endpoint;
- a way to alter the local operator kill switch.

## Trust boundaries

### Probe-local trust

Installed locally and outside ordinary scheduler control:

- scheduler Ed25519 public key;
- probe pseudonymous ID;
- per-probe result-authentication secret;
- fixed control/collection origin configuration;
- local target registry;
- local Stage 1 enable/kill state;
- software/policy version.

The central scheduler must never be able to replace these values through a measurement manifest.

### Scheduler trust

The scheduler signing private key authorizes only the bounded manifest schema already enforced by `lib/fleet.mjs`.

A compromised scheduler may choose among locally permitted Class A tests and may stop scheduling tests. It must not gain arbitrary network or code-execution capability.

### Collection trust

The collection service may authenticate, rate-limit and accept normalized result envelopes. It must not return executable instructions in response to a result upload.

### Network adversary

Assume an on-path observer may:

- observe destination IP, timing and traffic volume;
- block, reset or delay connections;
- poison DNS;
- present an invalid or unrelated TLS certificate;
- replay captured application data if transport/application controls permit it.

Transport failure is an availability problem. It must not cause broader target selection, disabled certificate verification or protocol fallback.

## One fixed outbound origin

Stage 1 should use one locally configured HTTPS origin for both manifest polling and result collection, for example conceptually:

`https://fleet.example.invalid`

The literal deployment hostname is not defined by this design and must be approved separately.

Requirements:

- origin is installed locally, not supplied by the scheduler;
- scheme is exactly `https`;
- default port is 443 unless a separately reviewed local policy fixes another single port;
- no username/password/query-string credentials;
- no scheduler-provided hostname, IP, URL or alternate origin;
- no HTTP downgrade;
- no redirect following;
- no alternate-origin failover in Stage 1;
- no environment-derived proxy unless the deployment configuration explicitly opts into and reviews one.

If the configured origin is unreachable, the probe waits/backoffs. It does not search for another service.

## TLS server authentication

Stage 1 must use normal certificate validation and hostname verification. The deployed client must never use Stage 0's loopback-only `rejectUnauthorized:false` behavior.

Before implementation, the project must choose and test one of these deployment trust models:

1. **Public Web PKI plus locally configured SPKI pin set** — preferred where operationally manageable; or
2. **dedicated project CA/trust bundle** installed locally on the probe.

No trust-on-first-use model is allowed.

If SPKI pinning is selected:

- keep at least one current and one pre-provisioned next pin;
- pin configuration is a local software/policy update, never scheduler content;
- pin mismatch fails closed;
- pin rotation procedure must be tested before deployment;
- pin mismatch must not disable ordinary certificate/hostname validation.

The scheduler Ed25519 signing key is separate from TLS server authentication. Compromise or rotation of one must not silently replace the other.

## Application endpoints

The first pilot transport should expose only two application operations.

### Manifest poll

Conceptual request:

`GET /fleet/v1/manifest`

Request properties:

- HTTPS only;
- `X-Fleet-Probe-Id` carries the pseudonymous probe ID;
- no secret in URL/query string;
- no body;
- optional `If-None-Match`/ETag for unchanged manifests;
- fixed response-size ceiling before JSON parsing.

Permitted response classes:

- `200` — one signed manifest envelope;
- `204` or `304` — no new manifest / no measurement work;
- `401`/`403` — probe is not authorized; do not measure and enter bounded backoff;
- `429` — obey bounded server retry hint only within local hard limits;
- `5xx` / transport error — no measurement work; backoff;
- redirect — hard error; do not follow.

A `200` response still has no authority until the existing Ed25519 manifest verification succeeds locally.

### Result submit

Conceptual request:

`POST /fleet/v1/result`

Request properties:

- HTTPS only;
- `Content-Type: application/json`;
- `X-Fleet-Probe-Id` must match the result envelope identity;
- body is the existing HMAC-authenticated result envelope;
- default body ceiling remains 16 KiB;
- no multipart upload;
- no arbitrary filename/path;
- no compression required for Stage 1;
- no result-batch endpoint initially.

Permitted response classes:

- `202` or `204` — accepted/processed according to server contract;
- `409` — duplicate/replay already known; do not create another observation;
- `401`/`403` — credential/probe rejected; stop retries for that envelope and backoff future activity;
- `413` — hard local/server contract error; do not retry unchanged envelope;
- `429` — bounded backoff;
- `5xx` / transport error — bounded retry while the in-memory envelope is still eligible;
- redirect — hard error; do not follow.

Server response bodies are not executable instructions and must not change measurement scope.

## Probe authentication

Stage 0 already HMAC-authenticates result envelopes using a separate per-probe secret resolver on ingestion.

Stage 1 should retain that application-level result authentication even when TLS is present.

For manifest polling, authentication is not required to establish manifest authority because the manifest itself is signed. The server may still use the pseudonymous probe ID and an additional reviewed request-authentication mechanism for abuse control or per-probe scheduling.

If request authentication is added, requirements are:

- credential never appears in URL/query string;
- credential is not passed on a command line;
- request authentication is scoped to fleet endpoints only;
- replay-resistant request construction is deterministic and tested;
- authentication failure cannot trigger fallback or broader measurement scope.

This design intentionally does not invent a second request-authentication protocol before the key-provisioning decision is made.

## Polling, jitter and backoff

The transport must avoid retry storms and must not create a high-frequency command channel.

Hard requirements:

- locally configured base poll interval;
- lower hard bound of 60 seconds in code;
- Stage 1 recommended operational default: 15 minutes before pilot tuning;
- local random jitter added to normal polling;
- exponential/bounded backoff after transport, TLS, `401/403`, `429` or `5xx` failures;
- maximum backoff of one hour for the initial design;
- no immediate catch-up of missed polls;
- no queue of multiple scheduler manifests;
- one current manifest at most;
- an expired manifest is discarded, never refreshed locally by altering timestamps.

Server `Retry-After` may increase waiting time but must not reduce the local minimum/backoff safety floor.

Exact production intervals remain a pilot policy setting and must not be interpreted as measurement evidence.

## Result buffering and retry

For Stage 1, default to **memory-only** buffering to minimize forensic residue on the probe.

Requirements:

- no disk spool by default;
- small hard maximum number of pending result envelopes;
- each pending envelope has a bounded lifetime;
- expired envelopes are dropped as missing data, not synthesized as failures;
- no burst catch-up after long outages;
- duplicate retries preserve exactly the same authenticated envelope identity;
- if memory capacity is exhausted, drop new/old results according to an explicit deterministic policy and expose local health state; never grow unbounded.

A future persistent spool requires a separate storage/encryption/retention review.

## Measurement scheduling relationship

A successful manifest poll does not directly execute arbitrary data from the server.

Required sequence:

1. local Stage 1 kill/enable gate is checked;
2. HTTPS/TLS server authentication succeeds;
3. response-size/content-type checks succeed;
4. signed manifest envelope is parsed;
5. Ed25519 signature and manifest lifetime are verified;
6. target IDs/families are validated against the local registry;
7. local execution plan resolves actual endpoint data;
8. bounded Class A measurement runs;
9. result timestamp must fall within manifest authorization window;
10. result schema is validated and HMAC-authenticated;
11. result is submitted through the fixed collection endpoint.

Failure at any earlier step prevents later measurement execution.

## No-data semantics

Transport state must remain distinct from measurement state.

Examples:

- cannot poll manifest => `control_transport_unavailable`, not “Internet blocked”;
- no manifest returned => no scheduled observation, not failure;
- manifest signature invalid => security error, not censorship evidence;
- measurement result produced but upload fails => local pending/lost result, not remote `no_data` until collection coverage is evaluated;
- result never received by server => server-side `no_data` for that expected observation;
- probe silent => unknown/offline-not-inferred unless a separately designed heartbeat proves otherwise.

Transport errors never become an independent censorship vote.

## Heartbeats

Stage 1 does not require a separate heartbeat initially.

Without one:

- no result does not prove the probe is offline;
- `offlineInferenceAllowed` remains false;
- dashboard coverage remains conservative.

If an explicit heartbeat is later introduced, it must be a separate minimal message with its own privacy/retention review and must not become a generic telemetry channel.

## Metadata and logging

Application requests should contain only the minimum identifiers needed for the operation.

Do not intentionally send:

- real person/operator identity;
- device serial;
- IMSI/IMEI/MSISDN/ICCID;
- SSID/BSSID/MAC;
- exact GPS coordinates;
- arbitrary local network inventory.

The network edge will inherently observe a source IP. Handling/retention of that IP is defined in a separate Stage 1 data-retention policy and remains a deployment blocker.

Transport/application logs must never log:

- probe secret;
- HMAC key material;
- scheduler private key;
- full Authorization credentials if request authentication is later added.

## Collection-edge limits

Before Stage 1 deployment, the external service must implement and test:

- body-size limit at reverse proxy/edge and application layers;
- per-probe authenticated rate limit;
- global rate/concurrency ceiling;
- bounded parser/request timeout;
- replay/duplicate handling;
- no unbounded request queues;
- strict allowed methods and content types;
- rejection of unexpected paths;
- no directory/file path derived from request fields.

The existing in-process Stage 0 rate/replay guards are necessary semantic tests but are not a substitute for real edge limits.

## Failure policy

The safe default is always to do less.

| Condition | Probe behavior |
| --- | --- |
| Local kill gate disabled | No poll-driven measurement execution |
| DNS failure for control origin | Backoff; no fallback |
| TLS validation/pin failure | Hard security failure; no measurement |
| Redirect | Reject; no follow |
| Invalid/oversized manifest | Reject; no measurement |
| Invalid manifest signature | Reject; no measurement |
| Expired manifest | Discard; no measurement |
| Unknown target/family | Reject; no measurement |
| Collection unavailable | Bounded memory retry/drop; no scope expansion |
| Probe revoked | No accepted result; scheduler should stop returning work |
| Local target unavailable | Typed Class A result only; never “censorship proven” |

## Required laboratory acceptance tests before Stage 1 review

The transport implementation must prove at least:

- no inbound listener in probe transport/runner modules;
- origin cannot be changed by manifest or server response;
- HTTPS only;
- certificate and hostname validation enabled;
- chosen pin/dedicated-CA model fails closed;
- redirects rejected;
- manifest response-size limit enforced before parse;
- result request-size limit enforced at edge and application boundary;
- only fixed paths/methods accepted;
- signed valid manifest can drive one approved Class A external laboratory target;
- invalid signature/tamper/expiry causes zero measurement calls;
- `401/403/429/5xx` produce bounded backoff;
- network outage does not create retry storm or catch-up burst;
- memory result queue is bounded and expires entries;
- duplicate result retry remains one observation;
- transport logs contain no credentials;
- transport error state remains separate from measurement evidence;
- the existing national/province publication lock remains intact.

Tests against a project-controlled external laboratory endpoint are allowed only after that endpoint and test configuration are explicitly established for development; they are not an Iran deployment.

## Stage 1 transport release gate

Transport design is considered implemented only when:

- all tests above are deterministic and green;
- key/trust provisioning runbook exists;
- data/source-IP/log retention policy exists;
- service sandbox/egress configuration exists and is tested;
- operator consent/withdrawal procedure exists;
- production Class A target registry is reviewed;
- rollback/revocation drill is documented and tested;
- a fresh security review records the exact implementation commit and CI evidence.

Only after that review may the project consider requesting explicit authorization for a single consenting Iran Stage 1 pilot.

## Current decision

**Transport architecture: specified.**

**Transport implementation: NOT STARTED.**

**External/Iran deployment: NOT AUTHORIZED.**
