# Stage 1 fleet service sandbox and egress gate — v1.2

Status: **laboratory/pilot prerequisite only — NOT deployment authorization**.

This document defines the operating-system and network-containment properties that must be demonstrated before any external Stage 1 fleet service or probe can be considered. It complements `FLEET_STAGE1_TRANSPORT.md`, `FLEET_STAGE1_TRUST.md`, `FLEET_STAGE1_RETENTION.md` and the code-level collection admission boundary in `lib/fleet-edge.mjs`.

## Core rule

A compromised fleet component must not become a general-purpose network client, scanner, proxy, shell or lateral-movement foothold.

Application-level allowlists are necessary but insufficient. Stage 1 requires an independent operating-system/network containment layer whose effective permissions are narrower than the host itself.

## Components and trust zones

Stage 1 separates at least these roles:

1. **Probe runner** — obtains one signed manifest, executes locally allowlisted Class A measurements, submits normalized results.
2. **Fleet control/collection service** — serves manifests and accepts result envelopes.
3. **Reverse proxy / TLS edge** — exposes only the fleet HTTPS origin and enforces outer request limits.
4. **Secret store / credential boundary** — supplies per-probe authentication material without placing secrets in registries or ordinary logs.
5. **Measurement datastore** — stores only normalized accepted pilot results under the retention policy.

Do not combine these roles merely for convenience in a pilot if doing so removes an independent containment boundary.

## Probe process sandbox

The probe must run as a dedicated unprivileged service identity.

Required properties:

- never run as root;
- no `sudo`, setuid helper, shell-management channel or inbound SSH dependency;
- no Linux capabilities unless a separately reviewed Class A measurement proves one is strictly required;
- `NoNewPrivileges` or equivalent enforced;
- read-only system/application files;
- writable state limited to the minimum local runtime area required for the enable marker/ephemeral state;
- memory-only result queue remains the default; no disk spool in Stage 1;
- no access to user home directories, removable media, device nodes or unrelated service credentials;
- no container/socket control interfaces such as Docker/Podman/containerd sockets;
- no package-manager or software-update authority inside the running probe process;
- no child-process/shell execution path in the probe runner;
- crash/restart must preserve default-deny behavior: absence of the local enable state means no measurement work.

Recommended Linux hardening controls, to be validated on the selected deployment OS rather than copied blindly:

- dedicated service user/group;
- `NoNewPrivileges=yes`;
- `PrivateTmp=yes`;
- `PrivateDevices=yes`;
- `ProtectSystem=strict`;
- `ProtectHome=yes`;
- `ProtectKernelTunables=yes`;
- `ProtectKernelModules=yes`;
- `ProtectKernelLogs=yes`;
- `ProtectControlGroups=yes`;
- `RestrictSUIDSGID=yes`;
- `LockPersonality=yes`;
- `MemoryDenyWriteExecute=yes` where compatible with the runtime;
- restrictive `UMask`;
- explicit writable paths only;
- explicit address-family restrictions to the families actually used.

The final unit/profile must be tested with the exact Node/runtime build. A hardening option that breaks normal operation must be reviewed and replaced by an equivalent control; it must not simply be disabled without recording the resulting gap.

## Probe egress policy

The probe must have a default-deny egress policy independent of manifest validation.

Allowed network destinations are limited to:

- the one locally configured fleet HTTPS origin on TCP/443;
- DNS only to the locally configured resolver(s) when DNS is required by approved Class A tests/control transport;
- addresses corresponding to locally installed, approved Class A target-registry entries for the currently enabled policy.

The scheduler manifest itself must never open a new firewall destination.

Requirements:

- no unrestricted Internet egress;
- no generic proxy/VPN/Tor/circumvention egress in Stage 1;
- no SMTP, SSH, SMB, RDP, database or administrative-protocol egress unless explicitly part of a future reviewed safety class;
- no access to cloud-instance metadata endpoints or link-local management services;
- private/link-local/loopback destinations are denied in an external pilot unless a specifically reviewed local dependency requires them;
- target-registry changes and firewall-policy changes are separate local deployment/policy updates, not scheduler messages;
- egress failure is a transport/measurement error only and never evidence of censorship by itself.

If hostname targets are used, the deployment must define how DNS resolution and firewall enforcement remain consistent without expanding to arbitrary destinations. An implementation that cannot make that guarantee remains a blocker.

## Fleet control/collection service sandbox

The application service should not be directly Internet-facing.

Preferred architecture:

`Internet -> TLS/reverse proxy -> loopback/Unix socket -> fleet application`

Application requirements:

- dedicated unprivileged service identity;
- application listener bound only to loopback or a Unix-domain socket where supported;
- no direct public bind from the Node application for Stage 1;
- read-only application filesystem;
- no shell/child-process requirement;
- no repository write token, GitHub credential or deployment credential in the running service;
- no access to unrelated dashboard secrets;
- secret-store access scoped only to the per-probe secret lookup operation needed for ingestion;
- datastore credential scoped only to the fleet pilot dataset and required operations;
- no ability to modify TLS private keys from the application process;
- no ability to alter reverse-proxy configuration from the application process.

## Collection-service egress

Default deny.

Permitted egress should be restricted to the exact local/private dependencies required by the selected deployment, for example:

- secret store endpoint/socket;
- fleet pilot datastore endpoint/socket;
- explicitly approved local observability sink that satisfies the retention/logging policy.

The collection application does not need arbitrary outbound Internet access to accept probe results.

The scheduler/control component, if it requires external source retrieval, must be isolated from the collection application and reviewed independently rather than giving the ingestion process general Internet access.

## Reverse proxy / edge containment

Only these external application operations are permitted in the initial Stage 1 design:

- `GET /fleet/v1/manifest`;
- `POST /fleet/v1/result`.

The edge must enforce before forwarding:

- TLS only;
- fixed host/origin;
- method/path allowlist;
- request-body ceiling at or below the application contract;
- bounded header sizes;
- bounded request/read timeouts;
- bounded concurrent connections/requests;
- no request-body logging;
- fleet access logging disabled or redacted according to `FLEET_STAGE1_RETENTION.md`;
- no directory browsing/static upload/WebDAV/generic proxy behavior;
- no forwarding of unexpected paths to the application;
- no debug endpoint exposed through the fleet virtual host.

Application-level `fleet-edge.mjs` validation remains required even when the reverse proxy performs the same checks.

## Collection abuse controls

Stage 1 must use layered limits that do not depend on retaining source IP addresses.

Required layers:

1. edge/global connection and request limits;
2. application global concurrency ceiling;
3. bounded request body and parser time;
4. pseudonymous probe identity validation;
5. cryptographic result authentication;
6. per-probe authenticated rate limit;
7. replay/duplicate guard;
8. bounded datastore operation time/concurrency.

Raw client IP must not become a durable rate-limit identity merely because it is available at the socket or proxy layer. A hosting provider may apply transient network-protection controls, but provider retention/processing must satisfy the separate retention review.

## Denied capabilities

The following are explicit Stage 1 NO-GO conditions:

- probe or collection process runs privileged/root without a documented unavoidable requirement;
- generic outbound Internet access from the collection process;
- scheduler-controlled firewall/egress rules;
- arbitrary command execution, remote shell or plugin download;
- Docker/container-engine socket mounted into either service;
- writable application/repository directory used as runtime state;
- fleet application directly controls its reverse proxy/TLS keys;
- collection service can access unrelated production databases or secrets;
- raw client-IP logging is required for normal operation;
- missing network connectivity causes a fail-open firewall or alternate unrestricted transport.

## Laboratory acceptance tests

Before an external project-controlled Stage 1 endpoint is considered, demonstrate on the intended deployment OS/runtime:

- service runs as the dedicated unprivileged identity;
- privilege escalation attempts fail;
- application filesystem is read-only except documented runtime paths;
- unrelated home/device/container-socket access fails;
- application cannot bind an unexpected public listener;
- probe cannot connect to a destination absent from its local egress allowlist;
- collection service cannot reach arbitrary public Internet destinations;
- allowed fleet HTTPS/control dependency still works under the egress policy;
- allowed local Class A laboratory target still works under the probe egress policy;
- forbidden destination attempts produce local policy failure, not censorship evidence;
- reverse proxy rejects unsupported methods/paths and oversized bodies before application handling;
- concurrency/rate/replay controls remain bounded under synthetic load;
- logs contain no raw source IP, body, secret or credential values;
- service restart preserves default-deny state;
- disabling the local probe enable gate results in zero measurement work even when network egress remains technically possible.

These tests must be run against laboratory/project-controlled infrastructure only until a later explicit pilot authorization.

## Evidence and publication semantics

Sandbox and egress failures are operational/security states.

They must not:

- count as independent censorship evidence;
- be converted into national/province status;
- be interpreted as ISP blocking without independent measurement evidence;
- allow missing probe data to imply offline status.

Owned-probe observations retain `independentCensorshipVote:false` under Stage 1.

## Release gate

This blocker is complete only when all of the following exist for the selected deployment platform:

- reviewed service-unit/container sandbox profile;
- reviewed host/network egress policy;
- automated or reproducible negative connectivity tests;
- reverse-proxy fleet virtual-host configuration with logging/body/method/path limits;
- proof that application and proxy limits agree;
- documented rollback procedure;
- CI/laboratory evidence tied to exact configuration revisions.

This document defines the target state. It does **not** itself authorize an external service or Iran pilot.

**External/Iran Stage 1 deployment remains NOT AUTHORIZED.**
