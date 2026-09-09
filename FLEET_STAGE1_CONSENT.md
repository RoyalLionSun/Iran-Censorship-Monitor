# Stage 1 operator consent and withdrawal — v1.2

Status: **laboratory/pilot prerequisite only — NOT deployment authorization**.

This document closes the design portion of the Stage 1 operator-consent blocker. It does not itself constitute consent from any person and it does not authorize an Iran deployment.

## Core safety rule

A Stage 1 pilot probe must require **two independent local gates** before any control-plane polling or measurement work:

1. the technical local enable/kill gate; and
2. a separate, time-limited local consent record.

The central scheduler cannot create either local gate. Removing or allowing the local consent record to expire must stop the next cycle without requiring central connectivity.

## What the operator must understand before consent

The pilot operator must be told in understandable language, before enrollment, that:

- the probe deliberately creates DNS/TCP/TLS/HTTPS network traffic to a small project-controlled Class A target set;
- an ISP, network operator, hosting provider or state-capable network observer may be able to observe that traffic;
- the fleet server/network path necessarily sees the connection source IP transiently even though the application policy prohibits intentional raw-IP persistence;
- the project cannot guarantee anonymity or safety from network observation;
- local legal, employment, physical and device-seizure risks may exist and are not eliminated by encryption;
- Stage 1 does not run VPN/circumvention tests, fuzzing, arbitrary URLs/hosts/ports, scanning, content publication or Class B/C/D measurements;
- normalized accepted pilot results may be retained for at most 30 days under `FLEET_STAGE1_RETENTION.md`;
- owned-probe results remain `independentCensorshipVote:false` and do not become a national/province conclusion;
- participation is voluntary and can be stopped locally without asking the central service for permission.

Consent must not be obtained by concealing the network-observability risk or by presenting the probe as risk-free.

## Separation of identity and telemetry

No operator name, email address, phone number, home address, government identifier, social-media handle or other direct identity field belongs in:

- the Git repository;
- the local machine-readable consent file;
- the probe result envelope;
- the measurement datastore;
- dashboard/analysis tables.

If an operational contact/consent record must identify the operator, it must be held in a **separate restricted administrative record** with separate access control. It must not be automatically joined to measurement telemetry.

The measurement side uses only the pseudonymous `probeId` and a random `consentRecordId`.

## Local machine-readable consent record

The Stage 1 runner accepts only the strict schema implemented by `lib/fleet-stage1-consent.mjs`:

```json
{
  "consentVersion": "1.2-pilot-consent1",
  "probeId": "p_REPLACE_WITH_PSEUDONYMOUS_ID",
  "consentRecordId": "cons_REPLACE_WITH_RANDOM_ID",
  "issuedAt": "2026-09-09T00:00:00.000Z",
  "expiresAt": "2026-10-09T00:00:00.000Z",
  "acknowledgements": [
    "network_activity_observable",
    "source_ip_visible_to_network_path",
    "local_jurisdiction_risk_understood",
    "class_a_measurement_scope_understood",
    "local_withdrawal_procedure_understood",
    "pilot_result_retention_30d_understood",
    "no_guaranteed_anonymity"
  ]
}
```

Properties:

- exact keys only; extra identity/metadata fields fail closed;
- bound to one local pseudonymous `probeId`;
- maximum lifetime: 30 days;
- expiration is fail-closed and requires fresh operator confirmation for another pilot window;
- acknowledgement set is fixed; a scheduler cannot weaken or replace it;
- the record contains no endpoint, hostname, port, command, secret or remote-update instruction;
- the record is local policy material, not a network response.

A repository example must never contain a real operator identity or a real probe credential.

## Activation procedure

Before creating a pilot consent record:

1. complete the safety explanation above;
2. give the operator time to decline without penalty from the project;
3. demonstrate the local kill/withdrawal procedure on the actual target OS;
4. verify the operator can perform the local stop without central connectivity;
5. explain the 30-day telemetry retention policy and the unavoidable transient source-IP visibility on the network path;
6. confirm only the reviewed Class A scope is enabled;
7. create the separate administrative consent/contact record outside the telemetry datastore if operationally required;
8. generate a random pseudonymous `consentRecordId` and the local machine-readable consent file;
9. enable the technical gate only after both local safety gates are present.

The repository does not contain a command that silently manufactures consent on behalf of an operator.

## Local withdrawal procedure

Withdrawal must work even if the fleet service or Internet is unreachable.

On the probe host:

1. remove the local consent file;
2. remove/disable the technical local enable marker;
3. stop the probe service;
4. verify the service does not poll the manifest endpoint or submit results;
5. remove local probe credentials if the device is leaving the pilot.

The runner checks the consent record **before transport use**. When consent is unavailable, invalid or expired, pending memory-only result data must be purged locally rather than uploaded later.

Local withdrawal is authoritative. A later central response cannot re-enable the probe without a new local consent record and technical gate.

## Central withdrawal/revocation follow-up

Local withdrawal does not depend on these steps, but the project should also:

1. mark the pseudonymous probe disabled in the fleet registry;
2. revoke/withdraw its per-probe result-authentication secret;
3. stop scheduling work for the probe;
4. invalidate any administrative enrollment state;
5. identify retained pilot records by pseudonymous probeId/consent window, not by source IP;
6. delete retained normalized pilot results when the applicable withdrawal policy requires deletion;
7. ensure deletion/expiry is not defeated by a longer-lived backup or log archive.

If central connectivity is unavailable, these actions wait; local stop still remains effective.

## Lost, seized or reassigned equipment

If the operator reports loss, seizure or reassignment:

- treat the probe as compromised;
- disable the probe centrally and revoke its HMAC secret as soon as possible;
- do not use a generic remote shell to investigate or recover it;
- do not remotely expand measurement scope;
- if scheduler/TLS keys are credibly exposed, follow their separate rotation procedures;
- do not request IMSI/IMEI/SIM/GPS/source-IP data as a routine recovery mechanism;
- do not infer that missing telemetry proves seizure, censorship or operator status.

A replacement device requires new enrollment, new local consent material and new probe credentials.

## Emergency stop authority

Both sides may stop the pilot:

- **operator:** removes local consent/enable state or stops/removes the service;
- **project operator:** disables scheduling and revokes the pseudonymous probe credential.

Neither side may respond to an emergency by enabling arbitrary commands, remote shell, wider targets or fail-open TLS/pinning.

## Acceptance tests before any pilot

A real target-OS pilot readiness review must demonstrate:

- missing consent file => zero transport calls and zero measurements;
- malformed/mismatched consent => zero transport calls and zero measurements;
- expired consent => zero transport calls and zero measurements;
- valid consent + missing technical enable gate => zero transport calls and zero measurements;
- valid consent + technical gate => only the previously reviewed Stage 1 path can run;
- consent removal with pending memory results => local queue is purged and no upload occurs;
- central probe disable/secret withdrawal blocks acceptance independently;
- operator can perform local withdrawal without network access;
- actual consent/contact identity remains outside telemetry and Git;
- server-side 30-day deletion and withdrawal deletion are tested against active storage/backups.

## What remains unresolved after this document

This document and the local consent code can establish a technical fail-closed consent boundary, but they cannot prove that a real human has freely and knowingly consented.

Before any Iran pilot, an actual explicitly consenting operator and an operator-specific safety review are still required. The completed consent record must remain outside this repository.

**External/Iran Stage 1 deployment remains NOT AUTHORIZED.**
