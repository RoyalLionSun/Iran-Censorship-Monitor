# Current State — v1.6.0 release candidate

Date: **2026-09-10**  
Release line: **`v1.6.0`**  
Production branch: **`main`**  
Pre-release main head: **`42e8775cfd7a51f882a78172caee181ed613e23f`**  
Release branch: **`release/v1.6.0`**

## Release state

- v1.4.0 is the latest previously published GitHub Release.
- v1.5.0 changes were merged and verified in the repository but were not tagged/published as a GitHub Release.
- v1.6.0 is therefore the next publication and includes the v1.5 ASN identity/inventory hardening plus v1.6 current-shutdown context.
- v1.6 shutdown backend and dashboard are merged to `main`; the final release branch adds context-export coverage and stable release metadata only.
- Pre-release deterministic suite: **275/275**. Two final export regression tests raise the release candidate to **277 tests**.

## v1.5 content included in v1.6.0

- registry-qualified curated Iran ASN catalogue with canonical identity separate from aliases;
- explicit `operatorFamily` grouping to prevent related ASNs from being treated as independent operators/evidence;
- Fanap Telecom / ZiTEL AS206065 and AS24631 retained as distinct routing identities in one operator family;
- RIR-associated Iran ASN inventory through RIPEstat `country-resource-list` kept separate from the curated catalogue;
- separate registered/routed country-level counts through RIPEstat `country-asns` without fabricating an ASN-by-ASN routed set;
- optional ipverse/as-metadata enrichment with bounded download, SHA-256 provenance, data-quality findings and transparent review classes.

## v1.6 content

- hardened Internet Society Pulse Iran shutdown parsing and selected-window semantics;
- explicit distinction between `token_required`, `no_data`, observed and error states;
- Pulse verification level, cause, type, affected regions and provenance preserved;
- Access Now STOP documented as a curated historical corpus currently published through 2025;
- STOP/Pulse correlation requires temporal overlap plus matching broad scope and always remains an analyst candidate;
- no correlation is auto-merged or counted as an independent technical vote;
- Pulse and correlation context rendered in the dashboard;
- Pulse events and STOP/Pulse candidates included in context CSV with provenance and zero-vote semantics.

## Verified gates before final release commit

- v1.5 feature PR #15 CI `34440814125` — success;
- v1.5 post-feature `main` CI `34440868635` — success;
- latest applicable live public-source acceptance `34399378248` — success, including 23/23 curated RIPE identities across 18 operator families, RIS Live and Route Views/BGPStream;
- v1.6 shutdown backend post-merge `main` CI `34442988321` — success;
- v1.6 dashboard branch CI `34443294299` — success;
- v1.6 dashboard PR CI `34443351394` — success;
- current pre-release `main` CI `34443425466` — success, 275/275 tests plus build/browser/security/runtime gates.

The final `release/v1.6.0` commit must pass the same deterministic CI with **277 tests**, canonical v1.6.0 release notes, production build, real Headless Chrome presentation, committed-secret/private-key scan and runtime smoke test before merge/tag/publication.

## Evidence invariants

- no fabricated values or silent replacement of missing data;
- RIR association ≠ current routing; BGP visibility ≠ end-user reachability;
- anomaly/performance degradation ≠ automatic censorship or throttling attribution;
- topology/registry metadata ≠ censorship evidence;
- multiple ASNs in one operator family ≠ independent sources;
- STOP and Pulse are curated context, not raw independent sensors;
- temporal/scope correlation ≠ incident identity or causality;
- `token_required` ≠ zero incidents;
- no province or SIM-class inference;
- no VPN-transport claim from website reachability;
- no NIN claim without reviewed paired target classes;
- active Globalping remains disabled by default;
- repository policy remains `deploymentAuthorized:false`.

## Fleet deployment boundary

A v1.6.0 release does not authorize an Iran pilot. Real isolated Linux/systemd sandbox and negative-egress validation, project-controlled endpoints/collection edge, out-of-band key lifecycle testing, rollback testing, voluntary operator consent/withdrawal and explicit deployment authorization remain external mandatory gates.
