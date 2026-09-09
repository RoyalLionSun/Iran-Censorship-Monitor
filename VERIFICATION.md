# Verification Report — v1.2.0 release candidate

Date: **2026-09-09**  
Release line: **v1.2.0**  
Feature merge: **`9dac687bc9bf83282ad3aa650255cafbb372160c`**  
Release metadata branch: **`release/v1.2.0`**

## Release-line gates

Completed gates:

- readiness CI `34366466998` — **success**;
- PR #6 CI `34368934884` — **success**;
- post-feature-merge `main` CI `34369377194` — **success**;
- deterministic suite — **203/203 passed**;
- production build — success;
- committed-token/private-key and `.env` checks — success;
- runtime `/api/health`, root, unknown-path and traversal smoke tests — success;
- real headless Chrome presentation gate — success;
- live public-source acceptance `34365369630` — **success**.

Real browser result:

```text
UI PRESENTATION PASS · google-chrome · M-Lab/APNIC/STOP rendered in a real headless browser
```

The release-metadata branch/PR and final post-metadata `main` commit are required to pass the same CI before tag `v1.2.0` is published.

## Major deterministic coverage added in v1.2

The suite verifies, in addition to the v1.1 source adapters and assessment rules:

- Route Views/BGPStream project/resource separation and bounded prefix scope;
- CAIDA live-broker request semantics;
- signed fleet manifest exact schemas and expiry/lifetime bounds;
- local target resolution and rejection of scheduler-supplied endpoints/commands;
- authenticated result envelopes and manifest binding;
- sensitive metadata rejection;
- replay/rate/size/concurrency guards;
- bounded memory-only result buffering and purge behavior;
- Class-A loopback DNS/TCP/TLS/HTTPS adapters and timeout/error semantics;
- local enable and consent gates before any network/measurement operation;
- real Node HTTPS handshake, hostname validation and SPKI pinning;
- Stage-1 fixed-path/redirect/content-size transport rules;
- collection-edge source-IP/XFF exclusion;
- systemd laboratory sandbox/default-deny configuration and negative-policy validation;
- key provisioning/rotation/revocation rules;
- rollback order, no-shell and no-auto-reenable rules;
- per-probe publication isolation and one-source-family semantics;
- VPN protocol/NIN evidence readiness rules;
- province and SIM segmentation NO-GO rules;
- real browser rendering of M-Lab/APNIC/STOP context.

## Live source acceptance

The latest v1.2 runtime/UI live gate `34365369630` completed successfully. It exercises the public-source server adapters plus passive routing acceptance checks. Legitimate `observed`, `partial` and `no_data` states remain distinct and no source error is converted into zero impact.

The Route Views/CAIDA gate establishes the supported live resource/provenance path. Route Views routing data remains control-plane evidence; using BGPStream to consume RIPE data would not create source independence.

## Security / evidence boundary

Release verification does **not** authorize an Iran pilot. In particular:

- owned probes remain one source family;
- per-probe observations cannot automatically become national/province status;
- website reachability cannot become VPN transport evidence;
- complete VPN/NIN evidence gates reach analyst review only;
- province cannot be inferred from source IP/ASN/latency;
- SIM entitlement class is not collected or inferred;
- routing visibility remains separate from data-plane reachability;
- missing/partial/error states are never promoted to complete confirmation.

## External predeployment gates

Before any Iran pilot, separate evidence is still required for:

1. actual Linux/systemd kernel/cgroup sandbox and negative egress enforcement on an isolated host;
2. real project-controlled Class-A endpoints and real collection edge;
3. out-of-band key provisioning/rotation/revocation exercise;
4. rollback exercise against a known-safe version;
5. real voluntary operator consent and withdrawal capability;
6. explicit authorization to deploy the pilot.

A green CI, PR, tag or release cannot satisfy these external gates. Repository policy remains `deploymentAuthorized:false`.

## Release conclusion

**v1.2 repository/runtime release line: verified and merged to `main`.**  
**Release metadata: being finalized on `release/v1.2.0`.**  
**Iran Stage-1 pilot: NO-GO until the external gates and explicit authorization are satisfied.**
