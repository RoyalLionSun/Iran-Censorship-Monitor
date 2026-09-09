# Stage 1 pre-deployment repository gate — v1.2

Status: **repository-side controls only; Iran pilot remains NOT AUTHORIZED.**

This document consolidates the Stage 1 controls that can be verified entirely inside the repository. Passing them does not authorize deployment and does not substitute for a real consenting operator, real project-controlled infrastructure, host-kernel enforcement tests, collection-edge validation, or an explicit pilot decision.

## Repository-side controls

### Key provisioning policy

The Stage 1 key policy must enforce all of the following:

- scheduler signing private key stored offline-encrypted or in a reviewed HSM/KMS boundary;
- scheduler private key is never committed;
- scheduler public key is provisioned out of band and pinned locally on the probe;
- per-probe result secret is stored in a root-readable file or OS credential store;
- probe secrets are never committed and never passed through command-line arguments;
- bounded routine rotation of at most 90 days;
- emergency revocation is supported;
- replacement/re-enrollment requires local operator action.

The repository validator accepts only descriptors of this policy. It does not accept, store, generate or expose real key material.

### Production Class A target provenance

A deployment candidate target must be:

- safety class A;
- project-controlled;
- explicitly approved and enabled;
- used only as benign control infrastructure;
- limited to the existing Class A DNS/TCP/TLS/HTTPS families;
- accompanied by an explicit control-evidence category and hosting-group identifier;
- free of inferred province or NIN classification.

A global-reachability interpretation is not eligible unless there are at least two enabled global control targets in at least two distinct hosting groups. This is only an eligibility prerequisite; it is not evidence that any observed failure is censorship.

No real production target endpoints are committed by this gate.

### Pilot dashboard/publication isolation

Owned-fleet pilot presentation is constrained to per-probe coverage only:

- all fleet probes remain one source family;
- `independentCensorshipVote` remains false;
- no national status;
- no province status;
- no network status without separately validated network binding;
- no automatic `blocked` status;
- no offline inference from missing results;
- missing data remains `no_data`;
- multiple observations or probes cannot inflate independent-source corroboration.

The publication adapter intentionally does not expose raw host/port information or turn timeout/error outcomes into censorship labels.

## External gates still required

Even with all repository tests green, Stage 1 remains NO-GO until all of these are independently completed:

1. one real, informed and voluntarily consenting pilot operator;
2. real project-controlled benign Class A target endpoints with reviewed ownership and hosting diversity;
3. kernel/cgroup/systemd enforcement validation on the actual probe OS;
4. real collection-edge and reverse-proxy validation, including logging/retention behavior;
5. secure real-world key/secret provisioning and revocation exercise;
6. local kill/consent withdrawal and rollback exercise on the actual probe host;
7. explicit authorization for the specific pilot.

## Non-authorizing rule

No green CI run, release, issue state, repository validator, number of probes or number of observations can set `deploymentAuthorized` to true. Pilot authorization remains a separate explicit operational decision.
