# Verification Report — v1.6.0 release candidate

Date: **2026-09-10**  
Release line: **v1.6.0**  
Pre-release main head: **`42e8775cfd7a51f882a78172caee181ed613e23f`**  
Release branch: **`release/v1.6.0`**

## Previously completed gates

### ASN identity/inventory line

- v1.5 feature PR #15 CI `34440814125` — **success**;
- v1.5 post-feature-merge `main` CI `34440868635` — **success**;
- latest applicable live public-source acceptance `34399378248` — **success**;
- direct RIPE Database identities: **23/23 curated profiles**, **18 operator families**;
- both Fanap-family ASNs AS206065 and AS24631 passed current registry validation;
- RIPE RIS Live and Route Views/CAIDA BGPStream broker acceptance passed.

### v1.6 shutdown-context line

- backend/correlation post-merge `main` CI `34442988321` — **success**;
- dashboard branch CI `34443294299` — **success**;
- dashboard PR CI `34443351394` — **success**;
- dashboard post-merge `main` CI `34443425466` — **success**;
- pre-release deterministic suite — **275/275 passed**;
- production build, real Headless Chrome presentation, committed-secret/private-key scan and runtime smoke checks passed.

No v1.6 feature change triggered the separate live-source acceptance workflow because its current push trigger is restricted to `develop/v1.5`. No live-source result is fabricated for v1.6.

## Final v1.6.0 release gate

The release-finalization branch adds two deterministic context-export tests. The expected stable release suite is therefore **277 tests** and must pass before merge/tag/publication together with:

- syntax checks, including the v1.6 shutdown UI and export helper;
- canonical `release-notes/v1.6.0.md` validation;
- production bundle creation;
- real Headless Chrome rendering of M-Lab/APNIC/STOP/Pulse/STOP↔Pulse plus existing ASRank/RPKI/Tor context;
- committed token/private-key and `.env` rejection;
- runtime health/root/404/path-traversal smoke testing.

## Deterministic v1.6 coverage

The release verifies that:

- Pulse accepts only explicit Iran identifiers and validates required timestamps/ranges;
- open-ended events overlap later selected windows without being silently ended;
- malformed Iran Pulse records fail closed;
- missing Pulse credentials remain `token_required`, not zero incidents;
- STOP and Pulse remain separate provenance objects;
- correlation requires time overlap plus a matching broad scope class;
- candidates remain `possibleSameIncident:true`, `automaticMerge:false`, `independentTechnicalVote:false`;
- dashboard presentation preserves verification, cause, type and affected-region context;
- context CSV exports Pulse status/events and correlation candidates without losing zero-vote/provenance semantics;
- the export represents token-required Pulse coverage as `matched=not_inferred` rather than zero.

## Evidence / security boundary

Release verification does not turn registry identity, RIR country association, BGP visibility, topology, performance, curated shutdown reports or source correlation into censorship attribution.

In particular:

- BGP visibility does not establish end-user reachability;
- multiple related ASNs do not create independent evidence;
- secondary ipverse classification cannot override RIR country scope;
- STOP/Pulse/Tor/BridgeDB/Ookla context creates no independent censorship vote;
- temporal/scope correlation does not establish incident identity, causality, mechanism or political intent;
- missing/partial/error/token-required states are never promoted to confirmation;
- province and SIM entitlement are not inferred;
- website reachability is not VPN-transport evidence.

## External predeployment gates

A green release is still **NO-GO** for an Iran Fleet Stage-1 pilot until separate evidence exists for:

1. real isolated Linux/systemd sandbox and negative-egress enforcement;
2. real project-controlled Class-A measurement/control endpoints and collection edge;
3. out-of-band key provisioning, rotation and revocation;
4. rollback against a known-safe version;
5. voluntary informed operator consent and withdrawal;
6. explicit authorization to deploy.

Repository policy remains `deploymentAuthorized:false`.

## Publication history note

v1.5.0 was developed and repository-verified but was not tagged or published as a GitHub Release. v1.6.0 is intentionally the next published release after v1.4.0 and therefore includes the accumulated v1.5 ASN/inventory work as well as v1.6 shutdown-context work.
