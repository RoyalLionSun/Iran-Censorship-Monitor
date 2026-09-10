# Verification Report — v1.5.0 release candidate

Date: **2026-09-10**  
Release line: **v1.5.0**  
Feature merge: **`7821cf56233308f177755d1c92d838e307fac6d2`**  
Release metadata branch: **`release/v1.5.0`**

## Completed feature-line gates

- feature head CI `34403372561` — **success**, **264/264 tests**;
- feature PR #15 CI `34440814125` — **success**;
- post-feature-merge `main` CI `34440868635` — **success**;
- deterministic suite — **264/264 passed**;
- production build — success;
- release-notes gate — success on the feature-line package state and required again for stable `1.5.0` metadata;
- committed-token/private-key and `.env` checks — success;
- runtime `/api/health`, root, unknown-path and traversal smoke tests — success;
- real headless Chrome presentation gate — success;
- latest applicable full live public-source acceptance `34399378248` — **success** on the latest registry/runtime commit requiring that gate.

The release-metadata branch/PR and final post-metadata `main` commit must pass the same deterministic CI before tag `v1.5.0` is published.

## Live registry / routing acceptance

Live public-source acceptance `34399378248` verified the v1.5 registry/runtime line before the later inventory-only commits:

- direct RIPE Database registry identities: **23/23 curated profiles passed**;
- those profiles represented **18 operator families**;
- AS206065 (`FDI`) and AS24631 (`FANAPTELECOM-FCP`) both passed under `ORG-PNEV1-RIPE`;
- RIPE RIS Live passive subscription handshake — success;
- Route Views/CAIDA BGPStream broker — success.

Later commits added separated RIR inventory, registered/routed country summary and ipverse prioritization code only and did not match the bounded live-source workflow paths.

## Major deterministic coverage added in v1.5

The suite verifies, in addition to previous source adapters and evidence rules:

- known stale/non-Iran ASN entries are corrected or excluded;
- canonical registry identity and operational aliases remain separate;
- TCI vs TIC/Zirsakht and ITCO/DCI family boundaries are explicit;
- related ASNs stay in one operator family and cannot create independent censorship votes;
- provider comparison uses an exact reviewed ASN set rather than array position;
- direct RIPE Database REST `aut-num` parsing fails closed on missing/mismatched hard identity keys;
- non-authoritative/missing ASN status fails closed;
- Fanap AS206065 and AS24631 remain one operator family while retaining distinct routing identities;
- RIPEstat country-resource inventory is IR-scoped, normalized, deduplicated and numerically sorted;
- curated coverage remains distinct from the complete RIR-associated inventory;
- curated profiles outside the current RIR inventory are surfaced as drift;
- RIPEstat country-ASN registered/routed counts preserve their separate semantics and reject malformed/blank/boolean counts;
- no undocumented ASN-by-ASN routed set is inferred from country-level statistics;
- ipverse enrichment filters to the RIR-selected ASN set, preserves source-qualified topology fields and fails closed on malformed selected entries;
- ipverse country disagreement is reported without changing RIR country membership;
- exact ipverse bytes are SHA-256 anchored and byte bounded;
- candidate ordering is deterministic, excludes curated profiles and uses transparent review classes rather than a censorship score.

## Full-dataset execution boundary

The public ipverse JSON dataset is a large world dataset and is intentionally operator/on-demand input rather than a routine GitHub Actions dependency. The release verifies its parser, byte ceiling, exact-byte hashing, filtering, prioritization and failure behavior deterministically.

This report does **not** claim that release CI downloaded and processed the current complete ipverse world dataset. An operator live run is separate source observation and any upstream/network failure remains explicit rather than becoming successful or zero-valued evidence.

## Security / evidence boundary

Release verification does **not** authorize an Iran pilot or active protocol/circumvention probing. In particular:

- RIR country association, registry identity, routing visibility and topology classifications are separate dimensions;
- registry/topology/inventory metadata adds zero independent censorship votes;
- multiple ASNs under one operator family do not count as independent evidence;
- BGP/RIS visibility does not prove end-user Internet reachability;
- secondary ipverse classification cannot override RIR country scope;
- Tor/BridgeDB/STOP/Ookla context adds zero independent censorship votes;
- performance degradation alone is not throttling attribution;
- owned probes remain one source family;
- per-probe observations cannot automatically become national/province status;
- website reachability cannot become VPN transport evidence;
- province cannot be inferred from source IP/ASN/latency;
- SIM entitlement class is not collected or inferred;
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

**v1.5 repository/runtime feature line: verified and merged to `main`.**  
**Release metadata: being finalized on `release/v1.5.0`.**  
**Iran Stage-1 pilot: NO-GO until the external gates and explicit authorization are satisfied.**
