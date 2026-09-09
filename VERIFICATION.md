# Verification Report — v1.4.0 release candidate

Date: **2026-09-09**  
Release line: **v1.4.0**  
Feature merge: **`cf121adf1cdc976c58b591b53debf1d9e987bef3`**  
Release metadata branch: **`release/v1.4.0`**

## Completed feature-line gates

- feature branch CI `34388597794` — **success**;
- feature PR #12 CI `34388825541` — **success**;
- post-feature-merge `main` CI `34389188256` — **success**;
- deterministic suite — **237/237 passed**;
- production build — success;
- stable release-notes gate — success on development path and required again for the stable release branch;
- committed-token/private-key and `.env` checks — success;
- runtime `/api/health`, root, unknown-path and traversal smoke tests — success;
- real headless Chrome presentation gate — success;
- live public-source acceptance `34388597366` — **success**.

Real browser result includes bounded Tor/BridgeDB context and preserves the GLOBAL/not-Iran-specific label for BridgeDB.

The release-metadata branch/PR and final post-metadata `main` commit must pass the same CI before tag `v1.4.0` is published.

## Major deterministic coverage added in v1.4

The suite verifies, in addition to previous source adapters and assessment rules:

- Iran Tor transport lower/upper bounds are preserved;
- non-overlapping bounds can support only a direction, not an exact client delta;
- overlapping/touching bounds remain indeterminate;
- missing paired Tor observations remain `no_data`;
- global BridgeDB transport-demand scope cannot be relabelled as Iran-specific;
- BridgeDB is excluded from Iran incident correlation;
- Tor↔STOP temporal matching cannot add causality, blocking attribution, national status or an independent vote;
- partial/no-data source states survive correlation unchanged;
- Ookla Open Data object naming/quarter contracts are bounded to official public objects;
- no Iran Ookla publication occurs without an approved country-boundary spatial join;
- stable package versions require complete canonical release notes;
- empty GitHub Release bodies can be recovered from canonical notes without overwriting an existing body;
- headless browser presentation preserves the evidence/scope boundaries.

## Security / evidence boundary

Release verification does **not** authorize an Iran pilot or active protocol/circumvention probing. In particular:

- Tor/BridgeDB/STOP/Ookla context adds zero independent censorship votes;
- BridgeDB global data never becomes Iran data;
- performance degradation alone is not throttling attribution;
- owned probes remain one source family;
- per-probe observations cannot automatically become national/province status;
- website reachability cannot become VPN transport evidence;
- province cannot be inferred from source IP/ASN/latency;
- SIM entitlement class is not collected or inferred;
- routing visibility remains separate from data-plane reachability;
- missing/partial/error states are never promoted to confirmation.

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

**v1.4 repository/runtime feature line: verified and merged to `main`.**  
**Release metadata: being finalized on `release/v1.4.0`.**  
**Iran Stage-1 pilot: NO-GO until the external gates and explicit authorization are satisfied.**
