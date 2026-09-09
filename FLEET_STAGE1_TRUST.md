# Stage 1 fleet trust and SPKI rotation runbook — v1.2

Status: **laboratory/pilot prerequisite only — NOT deployment authorization**.

This runbook selects the Stage 1 server-authentication model described in `FLEET_STAGE1_TRANSPORT.md` and defines how trust material must be provisioned and rotated before any external fleet endpoint may be considered.

## Selected trust model

Stage 1 uses:

1. normal Web PKI certificate-chain validation;
2. normal TLS hostname verification for the one locally configured fleet origin; and
3. an additional locally provisioned SHA-256 SPKI pin set.

SPKI pinning is an extra restriction. It must never replace CA validation or hostname verification.

The current implementation in `lib/fleet-stage1-https.mjs` enforces `rejectUnauthorized:true`, normal `checkServerIdentity`, TLS >= 1.2 and then the local SPKI allowlist.

## Trust separation

The following credentials/keys are separate security domains and must not be reused:

- TLS private key for the fleet HTTPS service;
- scheduler Ed25519 manifest-signing private key;
- per-probe HMAC result-authentication secret;
- probe-local Stage 1 enable/kill state.

Compromise or rotation of one must not silently authorize replacement of another.

The scheduler manifest has no field capable of changing:

- fleet origin;
- CA trust;
- SPKI pins;
- scheduler public key;
- probe result secret;
- local target registry;
- local enable/kill state.

## No trust on first use

TOFU is prohibited.

A probe must never learn or accept a new SPKI pin by observing the server it is currently connecting to. Pins must originate from the controlled certificate/key deployment process and arrive through a separately reviewed local software/policy update.

A TLS connection that presents a valid public certificate but an unknown SPKI key fails closed.

## Pin representation

The implementation accepts the SHA-256 digest of the certificate SubjectPublicKeyInfo (SPKI) DER bytes as base64, optionally prefixed with `sha256/`.

Example derivation from the certificate artifact used for deployment:

```sh
openssl x509 -in fleet-cert.pem -pubkey -noout \
  | openssl pkey -pubin -outform der \
  | openssl dgst -sha256 -binary \
  | openssl base64 -A
```

Derive the pin from the controlled certificate artifact, not from an untrusted live first connection.

## Minimum pin set

Stage 1 requires at least **two distinct pins**:

- `current` — key currently served by the fleet HTTPS origin;
- `next` — pre-provisioned replacement key for planned or emergency rotation.

The implementation rejects a one-pin configuration and rejects duplicate pins. This prevents a normal rotation from requiring a temporary fail-open state.

Production/pilot pin values are local deployment material. The scheduler must never distribute them in a manifest.

## Planned rotation procedure

1. Generate the replacement TLS private key in the approved key-management environment.
2. Obtain/prepare the replacement certificate for the exact fleet hostname.
3. Validate certificate chain, validity period and SAN/hostname offline.
4. Derive the replacement SPKI SHA-256 pin from that certificate artifact.
5. Prepare a local probe software/policy update containing both the currently active pin and the replacement pin.
6. Verify the update in the laboratory with:
   - current certificate accepted;
   - replacement certificate accepted;
   - unrelated certificate/key rejected;
   - hostname mismatch rejected.
7. Distribute the local trust update before changing the server certificate.
8. Confirm the intended pilot probe has received the updated local trust configuration through the approved operator/update process. Do not infer this from censorship telemetry.
9. Activate the replacement certificate/key on the fleet server.
10. Confirm normal manifest/result HTTPS operation without changing scheduler manifests or measurement scope.
11. Do **not** immediately remove the previous pin.
12. Generate/provision a new future rotation key/pin.
13. In a later local update, replace the obsolete old pin so the steady state again contains `current + next`.

At no point may the client disable CA/hostname verification or accept arbitrary pins to recover availability.

## Emergency key compromise

If the active TLS private key is suspected compromised:

1. Suspend fleet scheduling/collection as operationally appropriate.
2. Do not weaken pinning, certificate or hostname verification.
3. Activate a replacement key whose pin was already pre-provisioned when possible.
4. If no safe replacement pin is already installed, affected probes remain unable to connect until a separately trusted local software/policy update provisions new trust material.
5. Treat the resulting absence of fleet data as transport/coverage loss, never as censorship evidence.
6. Rotate again to restore a two-pin `current + next` steady state.
7. Record the incident and exact trust versions used in the security review.

Availability is intentionally subordinate to authentication integrity.

## Scheduler signing-key rotation

Scheduler Ed25519 rotation is a different procedure from TLS rotation.

The HTTPS server must not be able to replace the scheduler public key through a response. A scheduler-key rotation therefore requires its own local software/policy update and laboratory verification. TLS trust alone does not make an unsigned or incorrectly signed manifest authoritative.

## Probe HMAC-secret rotation/revocation

Per-probe result secrets are not TLS credentials and are not part of the pin set.

They remain outside the probe-status registry and are obtained server-side through the separate secret-resolver boundary already tested by Stage 0. Revoking a probe secret must not alter TLS trust or scheduler trust.

## Configuration handling

Pins and public CA material are not private secrets, but they are security-critical policy. Requirements:

- keep them outside scheduler-controlled content;
- make changes reviewable and versioned in the deployment/policy process;
- do not accept environment-variable or remote-response replacement unless a future security review explicitly designs it;
- never log probe HMAC secrets, scheduler private keys or TLS private keys;
- never commit TLS private keys or probe secrets to this repository.

## Laboratory acceptance already achieved

Current tests verify:

- at least two distinct pins are required;
- hostname validation executes before/alongside pin validation;
- correct CA + hostname + pin completes a real Node TLS/HTTPS handshake against a loopback laboratory server;
- correct CA + hostname but wrong pin fails before the HTTP request reaches the server;
- TLS request options remain fixed to the configured hostname, HTTPS and the Stage 1 paths.

This laboratory evidence does not authorize an external fleet service or an Iran probe.

## Remaining deployment gates

Before a Stage 1 external pilot can be proposed, the project must still have all of the following reviewed together:

- exact external fleet hostname and hosting arrangement;
- certificate issuance and renewal mechanism;
- actual current and next pin provisioning process;
- source-IP/log retention policy (`FLEET_STAGE1_RETENTION.md`);
- reverse-proxy/application request limits;
- service sandbox and egress/ingress policy;
- operator consent and withdrawal procedure;
- production Class A target registry;
- rollback/revocation drill;
- fresh security review tied to exact commits and CI evidence.

**External/Iran Stage 1 deployment remains NOT AUTHORIZED.**
