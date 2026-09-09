# Changelog

## 1.2.0 — 2026-09-09

### Routing / source depth

- added a second passive routing path through CAIDA BGPStream tooling restricted to Route Views live resources;
- explicitly prevents RIPE data accessed through BGPStream from being double-counted as an independent source;
- added bounded Route Views collection and a real CAIDA broker acceptance gate;
- retained all BGP/Route Views/RIS events as control-plane context rather than censorship votes.

### Owned-probe fleet laboratory architecture

- added signed short-lived Ed25519 manifests containing only approved target IDs and bounded Class-A DNS/TCP/TLS/HTTPS test definitions;
- added local endpoint resolution so the scheduler cannot supply arbitrary hosts, URLs, ports or commands;
- added authenticated HMAC result envelopes, strict schemas and rejection of sensitive/device/subscriber/network identity fields;
- added bounded ingestion, replay, rate, concurrency and memory-only queue controls;
- added local kill/enable gates and time-bounded pseudonymous consent/withdrawal enforcement;
- added fixed Stage-1 HTTPS control/collection contracts with hostname verification and SPKI pinning;
- added collection-edge admission controls that exclude source IP/X-Forwarded-For from evidence/identity semantics;
- added systemd laboratory sandbox/default-deny specifications and negative egress validation tooling;
- added key provisioning/rotation/revocation requirements with no committed/CLI secrets;
- added fail-closed rollback with local withdrawal, central revocation, target retirement, known-safe version selection, no remote shell and no automatic re-enable;
- added per-probe publication isolation so multiple owned probes remain one source family and cannot produce national/province availability badges.

### Protocol / NIN / segmentation evidence policy

- defined a fail-closed VPN/circumvention protocol gate: website reachability is not WireGuard/OpenVPN/V2Ray/Outline transport evidence;
- actual transport evidence requires controlled endpoints, neutral controls, same-probe pairing, repeated observations, documented coverage, reviewed design and analyst review;
- even complete protocol evidence is analyst-review readiness, never an automatic blocked/available verdict;
- defined NIN-vs-global prerequisites using separately reviewed target classes, at least two independently hosted global controls and same-probe bounded-time pairing;
- kept NIN comparison non-operational because the current target policy does not authorize a NIN target class;
- formally deferred province publication and forbade source-IP/ASN/latency-derived province inference;
- marked white-SIM vs ordinary-SIM measurement NO-GO under the current privacy model.

### Additional source review

- reviewed APNIC HTTP/3/QUIC, DNS-over-IPv6 and DNS query-type/HTTPS-record data as contextual protocol/deployment candidates;
- did not add unsupported visualization scraping or pseudo-independent runtime sources where a stable supported machine-readable/provenance contract was not established.

### UI / verification

- added a real headless Chrome/Chromium presentation gate without Playwright/Puppeteer dependencies;
- the gate loads the actual context module through a loopback fixture and verifies M-Lab, APNIC and Access Now STOP rendering and separated source-family semantics;
- deterministic suite expanded to **203 tests**;
- readiness CI `34366466998` passed;
- PR #6 CI `34368934884` passed;
- v1.2 feature merge to `main` completed in `9dac687bc9bf83282ad3aa650255cafbb372160c`;
- post-feature-merge `main` CI `34369377194` passed;
- live public-source acceptance `34365369630` passed on the corresponding runtime/UI implementation.

### Deployment boundary

- v1.2 release code includes the Fleet Stage-1 laboratory architecture but does **not** authorize an Iran pilot;
- external systemd/egress, real endpoint, key-management, rollback and voluntary operator-consent gates remain mandatory plus explicit authorization;
- repository policy remains `deploymentAuthorized:false`.

## 1.1.0 — 2026-09-09

- shifted the product toward Iran-specific censorship intelligence with strict measurement/context separation;
- added Censored Planet, RIPEstat/RIPE RIS, Globalping, PeeringDB, IHR, Citizen Lab, Tor transport bounds, Cloudflare protocol context, M-Lab NDT, APNIC IPv6 and passive RIPE RIS Live;
- hardened RIPE Atlas through bounded per-probe daily `ping-stats` and excluded partial coverage from corroboration/divergence;
- added Access Now #KeepItOn STOP structured incidents with root-evidence lineage and no independent vote;
- exposed M-Lab/APNIC/STOP context in the dashboard with a separate context CSV export;
- retained explicit `no_data`/`partial`/error semantics and prohibited province/VPN fabrication;
- released from final production commit `9087809d6a87ae578dd590d185c35b4438319b2d` with tag/Release `v1.1.0`.

## 1.0.1 — 2026-09-08

- enabled Cloudflare Radar integration with a real server-side Radar Read token;
- added consistent Iran + selected-ASN scoping, range-aware aggregation, traffic-anomaly normalization and read-only Radar acceptance testing;
- kept credentials out of source/Git/build artifacts.

## 1.0.0 — 2026-09-08

- reconstructed the incomplete prototype export as a standalone Node.js application;
- removed simulated monitoring values and runtime dependency on prototype-specific modules;
- rebuilt the monitoring UI with explicit no-data/error states;
- hardened OONI/RIPE Atlas and added IODA, Tor, provider context and deterministic tests;
- eliminated third-party npm runtime dependencies.
