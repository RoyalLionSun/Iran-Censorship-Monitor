# Verification Report — v1.2.0-dev readiness

Date: **2026-09-09**  
Production: **v1.1.0 / `main` / `9087809d6a87ae578dd590d185c35b4438319b2d`**  
Development: **`develop/v1.2`**

## Current v1.2 gates

Latest verified runtime/UI development head before this documentation-only readiness pass:

- normal CI `34365724780` — **success**;
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

The initial UI-gate run failed because `spawnSync()` blocked the same Node event loop serving the loopback fixture. That was a harness deadlock, not an application/rendering failure. Commit `330ca12a6819dc4657d60f35c164e28c01b24f1b` switched browser execution to asynchronous `execFile()`; the unchanged fixture/assertions then passed.

## Major deterministic coverage added in v1.2

The suite now verifies, in addition to the v1.1 source adapters and assessment rules:

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
- real browser rendering of the v1.1 context presentation layer.

## Live source acceptance

The latest v1.2 runtime/UI live gate `34365369630` completed successfully. It exercises the existing public-source server adapters plus passive routing acceptance checks. Legitimate `observed`, `partial` and `no_data` states remain distinct and no source error is converted into zero impact.

The v1.2 Route Views/CAIDA gate establishes the supported live resource/provenance path. Route Views routing data remains control-plane evidence; using BGPStream to consume RIPE data would not create source independence.

## Security / evidence boundary

Verification does **not** authorize an Iran pilot. In particular:

- owned probes remain one source family;
- per-probe observations cannot automatically become national/province status;
- website reachability cannot become VPN transport evidence;
- complete VPN/NIN evidence gates reach analyst review only;
- province cannot be inferred from source IP/ASN/latency;
- SIM entitlement class is not collected or inferred;
- routing visibility remains separate from data-plane reachability;
- missing/partial/error states are never promoted to complete confirmation.

## External predeployment gates not reproducible in GitHub CI

Before any Iran pilot, separate evidence is still required for:

1. actual Linux/systemd kernel/cgroup sandbox and negative egress enforcement on an isolated host;
2. real project-controlled Class-A endpoints and real collection edge;
3. out-of-band key provisioning/rotation/revocation exercise;
4. rollback exercise against a known-safe version;
5. real voluntary operator consent and withdrawal capability;
6. explicit authorization to deploy the pilot.

A green CI, PR, tag or release cannot satisfy these external gates. Repository policy remains `deploymentAuthorized:false`.

## Release-readiness conclusion

**Repository/laboratory v1.2 development: ready for pre-release review.**  
**Iran Stage-1 pilot: NO-GO.**  
**Merge/release: requires the normal PR/release gate and explicit authorization; this document does not authorize it.**
