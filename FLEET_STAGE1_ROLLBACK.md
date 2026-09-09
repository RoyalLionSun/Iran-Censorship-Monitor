# Stage 1 deployment rollback and emergency stop — v1.2

Status: **laboratory/pilot prerequisite only — NOT deployment authorization**.

This runbook defines how a future Stage 1 pilot is stopped and returned to a known-safe state without introducing a remote shell, a wider target set or an automatic fail-open path.

## Core rollback rule

Rollback is **stop first, authenticate state second, re-enable only after a fresh review**.

A rollback must never:

- automatically restart measurement work;
- add a generic remote shell or arbitrary RPC;
- disable TLS/hostname/SPKI checks to regain availability;
- fall back to arbitrary hosts, ports or targets;
- preserve pending result uploads after local consent withdrawal;
- treat missing data during rollback as censorship evidence.

## Reviewed rollback sequence

The machine-readable order is fixed by `lib/fleet-stage1-rollback.mjs`:

1. `stop_local_service`
2. `remove_local_consent`
3. `remove_local_enable`
4. `purge_memory_queue`
5. `disable_probe_registry`
6. `revoke_probe_secret`
7. `stop_scheduling`
8. `retire_affected_targets`
9. `restore_known_safe_software`
10. `verify_sandbox_and_egress`
11. `require_fresh_consent_before_reenable`

The local stop steps intentionally precede central cleanup so withdrawal can work without Internet or fleet-service connectivity.

## Local emergency stop

On the probe host:

- stop the fleet service;
- remove the local consent record;
- remove the local technical enable marker;
- ensure the in-memory queue is discarded;
- verify no fleet process remains active and no fleet network traffic is generated.

The local operator must not need a central server response to make this effective.

## Central revocation

As a separate control plane action:

- disable the pseudonymous probe in the probe registry;
- revoke/withdraw its per-probe result secret;
- stop issuing manifests for that probe;
- reject later result submissions;
- do not create a remote recovery command channel.

Local stop and central revocation must be independently testable.

## Target retirement

If a project-controlled endpoint is compromised, reassigned or no longer suitable:

- remove it from the approved local target registry through the reviewed policy/software update path;
- stop scheduling it;
- do not redirect the old target ID to an arbitrary replacement;
- do not use DNS or HTTP redirects as an implicit target-policy update;
- re-enrollment of a replacement endpoint requires the production target-registry review.

A manifest referencing a retired/nonexistent target must fail closed as an unknown target.

## Known-safe software state

A pilot rollback record identifies a specific immutable 40-hex Git commit and the reviewed `FLEET_POLICY_VERSION`.

Before using a commit as the known-safe rollback artifact, the operator must separately verify:

- it is the intended reviewed commit/tag;
- CI/release evidence corresponds to that exact commit;
- installation artifact integrity/signature/hash as provided by the deployment mechanism;
- local target-registry revision matches the reviewed rollback record;
- required local trust/pin and scheduler public-key material belong to that software/policy generation.

The rollback schema does not download software and contains no URL or command field.

## Re-enable after rollback

Re-enable is a new authorization event, not the last rollback step.

Required before the probe may run again:

- root cause or triggering condition reviewed;
- known-safe software installed and verified;
- target registry reviewed;
- systemd sandbox and egress checks re-run on the actual target OS;
- central probe enrollment/secret state deliberately re-established if needed;
- **fresh local operator consent record**;
- **fresh local technical enable action**.

No timer, successful server response or software downgrade may recreate those local gates automatically.

## Lost/seized device

For a lost or seized probe:

- central disable + secret revocation are the available remote safety controls;
- do not attempt remote shell recovery;
- do not widen network access to locate the device;
- do not infer location/status from missing telemetry;
- treat local credentials on that device as potentially compromised;
- replacement hardware receives a new enrollment and fresh consent.

## Acceptance matrix

`assessFleetStage1RollbackReadiness()` requires explicit evidence for:

- local kill-switch test;
- consent-withdrawal test;
- central probe-disable test;
- secret-revocation test;
- target-retirement test;
- local queue-purge test;
- real target-OS sandbox runtime test;
- known-safe software artifact verification;
- confirmation that no remote shell is part of the recovery path.

A green readiness result means only `rollbackGateReady:true`. The function deliberately always returns `deploymentAuthorized:false`.

## Current evidence and remaining real-host gates

Repository/CI already covers local enable/consent fail-closed behavior, queue purge, registry/secret revocation semantics and target retirement semantics. The reproducible systemd sandbox is structurally checked in CI.

Still required before any real pilot:

- run the documented systemd/cgroup egress acceptance on the actual approved target OS;
- verify the exact known-safe installation artifact on that platform;
- perform an end-to-end operator emergency-stop drill;
- confirm central registry disable and secret revocation against the actual collection service.

**External/Iran Stage 1 deployment remains NOT AUTHORIZED.**
