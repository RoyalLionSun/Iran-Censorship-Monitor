# Iran measurement fleet — v1.2 safety and evidence specification

Status: **architecture/design only**. This document does not authorize deployment of probes or enable active protocol/circumvention testing.

## Purpose

Public telemetry cannot reliably answer every Iran-specific question the dashboard may eventually need to answer, especially:

- whether a particular protocol works from a particular Iranian access network;
- whether global-Internet reachability differs from domestic/NIN reachability;
- whether observations differ by access technology, ISP/ASN or coarse region;
- whether a VPN/protocol failure is reproducible from more than one controlled vantage.

An owned/controlled probe fleet can close some of those gaps, but only if operator safety, privacy, target provenance and measurement coverage are treated as release requirements rather than afterthoughts.

## Safety references

The design follows the direction of established measurement systems and current safe-measurement guidance:

- OONI warns that censorship testing is observable by an ISP/government and may create risk for users in some countries: <https://ooni.org/about/risks/>
- RIPE Atlas documents an outbound-only probe model with no open listening ports and constrained measurement capabilities: <https://atlas.ripe.net/docs/faq/security-and-privacy/>
- RIPE Atlas also demonstrates that probe/result metadata can expose network and location information unless deliberately minimized: <https://atlas.ripe.net/docs/apis/rest-api-manual/authentication/anonymous-access>
- IRTF PEARG safe-measurement work emphasizes evaluating present and future risk to people affected by Internet measurement: <https://datatracker.ietf.org/doc/draft-irtf-pearg-safe-internet-measurement/>

These references inform the architecture; this project does not claim that using the same safeguards eliminates risk.

## Threat model

Assume that an Iranian ISP, upstream provider or state-level observer may be able to see:

- DNS queries made by the probe;
- destination IPs and ports;
- TLS SNI where not encrypted by the protocol in use;
- connection timing and frequency;
- distinctive protocol handshakes;
- the probe's public source IP;
- traffic to the collection endpoint.

Also assume that a compromised central server or stolen probe credential must not become a general-purpose remote-command or arbitrary-network-scanning capability.

Therefore the probe must be designed as a **narrow measurement appliance**, not a remote shell or generic scanner.

## Non-goals

The initial fleet must not:

- fuzz DPI/censorship equipment;
- probe arbitrary user-supplied hosts or URLs;
- test provocative/blocked-site lists by default;
- automatically start Tor, VPN or circumvention protocols;
- attempt censorship evasion merely to make the measurement channel work;
- collect packet payloads from unrelated local traffic;
- expose an inbound management port;
- collect IMSI, IMEI, phone number, SIM serial, Wi-Fi SSID/BSSID, MAC address or precise GPS coordinates;
- infer province, SIM class or VPN availability from IP geolocation alone;
- claim national/provincial status from a single probe or single ASN.

## Probe architecture

### Network posture

The probe should:

- initiate outbound TLS connections only;
- expose no inbound control, SSH, HTTP or debug listener in normal operation;
- run with a dedicated unprivileged service identity where the platform permits it;
- use an egress allowlist for collection/control infrastructure where practical;
- never accept arbitrary command strings, shell fragments or arbitrary target URLs from the server.

### Control model

The central service may schedule only **predefined test IDs** that are present in a locally installed allowlist on the probe.

A test definition contains bounded parameters such as:

- test family;
- target ID from a local target registry;
- address family;
- maximum attempts;
- timeout;
- rate/jitter window.

The central service must not be able to transform a safe test ID into an arbitrary scanner through free-form hostnames, IP addresses, ports or command-line arguments.

Future remote manifests should be cryptographically signed. A probe must reject an unsigned, expired or unknown test definition. Updating the set of permitted measurement classes is a software/policy update, not an ordinary scheduler action.

### Kill switch

Every probe requires a local operator-controlled disable mechanism that stops measurements without requiring contact with the central service.

Loss of contact with the server must fail closed: no queued expansion of test scope and no fallback to additional targets.

## Measurement classes

### Class A — low-risk controlled reachability

Eligible for the first pilot after operator review:

- DNS A/AAAA lookup of project-controlled benign hostnames;
- TCP connection to project-controlled service endpoints;
- TLS handshake to project-controlled HTTPS endpoints;
- HTTP(S) GET/HEAD of a small static project-controlled object;
- basic IPv4/IPv6 reachability where the target is explicitly controlled/approved.

These measurements establish transport/reachability behavior; they do not by themselves prove censorship or intent.

### Class B — controlled path/performance context

Possible after the Class A pilot:

- bounded RTT/loss sampling to approved targets;
- small fixed-size throughput objects with strict transfer caps;
- paired domestic/global control targets.

Performance degradation remains contextual and must not automatically become a censorship vote.

### Class C — protocol/VPN reachability

**Disabled by default.** Requires a separate explicit operator and security approval before implementation or activation.

If approved, a test may connect only to a project-controlled endpoint using a fixed reviewed protocol profile. Examples such as WireGuard/OpenVPN/V2Ray/Outline are measurement families, not generic configuration upload mechanisms.

Requirements before Class C can run:

- explicit informed consent for the specific probe/operator;
- fixed project-controlled endpoint(s);
- no arbitrary peer/server configuration from the central scheduler;
- bounded handshake/runtime/traffic volume;
- clear control measurement immediately before/after the protocol test;
- separate result label from ordinary HTTPS reachability;
- local ability to disable the class independently of other measurements.

A failed handshake reports that the tested protocol/profile failed from that probe at that time. It does **not** imply national blocking.

### Class D — high-risk research

Not part of the normal fleet:

- blocked-site list testing;
- censorship-trigger strings;
- protocol/DPI fuzzing;
- active evasion testing;
- arbitrary traceroute/scanning campaigns;
- experiments designed to discover censorship trigger thresholds.

Class D requires a separate research/safety process and is outside the normal dashboard runtime.

## Target registry and NIN/global classification

Targets must be versioned records, not free-form scheduler input.

Each target should include:

- stable `targetId`;
- owner/operator;
- purpose;
- expected address family;
- expected service/port;
- maximum request size;
- geographic/network classification evidence;
- activation and retirement timestamps.

### Global control targets

Use more than one independently hosted project-controlled global endpoint so a single hosting/provider failure cannot be misread as Iranian filtering.

### Domestic/NIN targets

A target must not be labeled `nin` merely because it is hosted in Iran or has an Iranian domain name. NIN classification needs documented network evidence and periodic revalidation.

A future NIN-vs-global result is a **paired observation** from the same probe and time window. Domestic success plus global failure is compatible with selective isolation, but is not by itself proof of a deliberate national whitelisting policy.

## Probe identity and privacy

### Probe identifier

Use a random project-specific identifier with no embedded identity, phone number, device serial, geographic code or ASN.

### Source IP

The ingestion edge may need the source IP transiently for abuse protection and ASN derivation. The application dataset should store the derived ASN/network context and discard the full source IP as early as operationally practical.

If temporary infrastructure logs contain source IPs, their retention and access controls must be documented separately before an Iran deployment.

### Geography

Province is optional, coarse and operator-declared. Do not persist exact coordinates.

Do not reverse-geocode a source IP into a province and present that as measured ground truth.

### Access/SIM metadata

Allowed future categorical metadata may include operator-declared access type such as fixed/mobile and an explicitly defined SIM class. Do not collect hardware/subscriber identifiers.

`white-SIM`, ordinary-SIM or similar categories require a documented definition and an operator who knowingly supplies that category. The server must never infer it.

## Result schema requirements

Every fleet result should preserve at least:

- pseudonymous `probeId`;
- probe software/policy version;
- UTC measurement timestamp;
- test definition/version;
- target ID/version;
- ASN/network context;
- optional coarse province/access category;
- protocol/address family;
- individual DNS/TCP/TLS/HTTP outcomes where applicable;
- timing/sample counts;
- explicit timeout/error class;
- collection timestamp;
- evidence role;
- coverage metadata.

Missing fields remain missing. A timeout is not converted to `blocked`; an error is not converted to zero throughput; an offline probe is not a successful observation.

## Evidence and display gates

A single probe result is an observation from one vantage only.

Before the dashboard publishes country-, province-, ISP- or protocol-level summaries, a **coverage policy must be calibrated and versioned**. Until that policy exists, fleet results may be inspected per-probe/per-network but must not produce a national/provincial availability badge.

The coverage policy must account for at least:

- number of distinct probes;
- number of distinct ASNs/networks;
- fixed versus mobile access diversity where relevant;
- geographic diversity where explicitly known;
- number and spacing of measurement rounds;
- control-target health;
- success/failure consistency;
- missing/offline probes;
- software/policy version consistency.

No numeric threshold is invented in this design document. Thresholds must be calibrated from a pilot dataset and then committed as a versioned policy with tests.

## Corroboration model

Fleet observations form their own source family: `owned-probe-fleet`.

Multiple probes inside the fleet improve **coverage within that source family**; they do not automatically become multiple independent external sources.

External corroboration remains separate, for example:

- OONI/Censored Planet for interference evidence;
- RIPE Atlas/IODA for connectivity;
- RIPE RIS and Route Views for routing control plane;
- M-Lab for performance context.

A contextual article or STOP/Pulse incident that cites those measurements does not create another independent technical vote.

## Ingestion security requirements

Before accepting Iran probe data, the server-side ingestion path must provide:

- per-probe revocable credentials;
- authenticated TLS transport;
- strict request-size limits;
- schema validation before persistence;
- replay protection or bounded timestamp/nonce validation;
- per-probe and global rate limits;
- no arbitrary filesystem path supplied by the probe;
- no executable content or remote code path;
- audit logging that does not unnecessarily retain sensitive source metadata;
- immediate probe credential revocation.

The dashboard server should consume normalized results from this ingestion boundary rather than sharing a generic command channel with probes.

## Data retention

Initial deployment should minimize raw data by default.

Before pilot activation, the project must define and document:

- whether raw probe results are persisted at all;
- maximum raw-result retention;
- aggregation interval and aggregate retention;
- infrastructure log retention;
- deletion/revocation behavior when a probe operator withdraws.

No indefinite raw retention is implied by this design.

## Deployment stages

### Stage 0 — laboratory validation outside Iran

- implement probe and ingestion protocol;
- validate outbound-only posture;
- verify target allowlist enforcement;
- verify that arbitrary targets/ports/commands are impossible;
- test credential rotation/revocation;
- test no-data/offline semantics.

### Stage 1 — one explicitly consenting Iran pilot probe

Only Class A tests. No VPN/circumvention/blocked-site testing. Results remain per-probe and are not presented as national status.

### Stage 2 — controlled multi-network pilot

Add consenting probes on distinct access networks. Measure Class A and, after review, bounded Class B. Use the dataset to calibrate coverage thresholds.

### Stage 3 — versioned coverage policy

Commit empirically justified display gates and deterministic tests. Only then may aggregated ISP/country/province views be considered.

### Stage 4 — optional protocol tests

Class C remains a separate opt-in release gate with explicit risk review. It is not unlocked merely because Stage 3 succeeded.

## Release blockers

The owned Iran probe fleet must remain **not deployed / no_data** until all of the following are true:

- probe threat model reviewed;
- outbound-only implementation verified;
- arbitrary-target/command injection prevented and tested;
- target registry established;
- ingestion authentication/revocation implemented;
- source-IP/log retention policy decided;
- operator consent/withdrawal procedure documented;
- Stage 0 tests green;
- dashboard cannot convert insufficient coverage into national/provincial claims.

Protocol/VPN/NIN claims have additional blockers described above.

## Current v1.2 decision

This specification intentionally stops before deployment. The next engineering step is a **local/laboratory-only ingestion and probe protocol** implementing Class A with synthetic/local test fixtures. Iran deployment is not a prerequisite for developing or testing that code.
