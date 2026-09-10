# Production Deployment

## Supported release state

The v1.5 feature line is merged to `main` at `7821cf56233308f177755d1c92d838e307fac6d2`. Final `v1.5.0` release metadata is prepared on `release/v1.5.0`; tag/Release publication follows final metadata CI/merge.

The Fleet Stage-1 material remains **laboratory architecture**, not authorization to enable an Iran production probe. Release publication does not override `deploymentAuthorized:false` or the external predeployment gates.

## Dashboard topology

```text
Internet / administrator network
        |
      HTTPS
        v
Reverse proxy (TLS, access control, rate limit)
        |
  127.0.0.1:4173
        v
Iran Censorship Monitor / Node.js
        |
        +--> OONI / Censored Planet
        +--> RIPE Atlas / RIPEstat / RPKI / IODA
        +--> M-Lab / APNIC / Tor / Globalping
        +--> PeeringDB / IHR / CAIDA ASRank
        +--> Access Now / Citizen Lab / GDELT
        \--> Cloudflare Radar / Internet Society Pulse (optional tokens)

Optional passive operator processes
        +--> RIPE RIS Live
        \--> Route Views via BGPStream/bgpreader

Optional operator inventory job
        +--> RIPEstat country-resource-list / country-asns
        \--> ipverse/as-metadata JSON enrichment
```

Starting the dashboard does not start either routing collector or the ASN inventory/enrichment job.

## Build / validation

```bash
npm ci
npm run check
npm run verify:release-notes
npm run build
npm run verify:public
npm run verify:ris-live
npm run verify:bgpstream
npm run verify:ui
npm run verify:radar       # optional token
```

The v1.5 deterministic suite is **264/264 tests**, plus stable release-notes validation, production build, secret/private-key checks, runtime smoke testing and real headless-Chrome rendering. The latest applicable live-source acceptance verifies the bounded public-source adapters plus RIPE registry identity, RIS Live and Route Views broker connectivity. These repository gates do not supersede the external Fleet deployment gates.

## Dashboard service

Keep the Node listener private where practical and terminate HTTPS at a reverse proxy. A hardened systemd service should use an unprivileged account, `NoNewPrivileges=true`, private temporary space and read-only system/home protections appropriate to the distribution.

Typical environment values:

```text
HOST=127.0.0.1
PORT=4173
CACHE_TTL_MS=120000
CLOUDFLARE_RADAR_API_TOKEN=
INTERNET_SOCIETY_PULSE_API_TOKEN=
GLOBALPING_API_TOKEN=
GLOBALPING_ACTIVE_ENABLED=false
GLOBALPING_CONTROL_KEY=
GLOBALPING_SERVER_RUNS_PER_HOUR=10
```

Protect environment/secret files outside Git. Do not expose tokens to browser JavaScript.

## ASN identity and inventory — v1.5

`data/asns.json` is the reviewed dashboard/monitoring catalogue; it is not the complete Iran ASN universe.

The operator-triggered inventory command is:

```bash
node scripts/fetch-iran-asn-inventory.mjs
```

It obtains the canonical RIR-associated Iran ASN base population from RIPEstat `country-resource-list`, keeps RIPEstat `country-asns` registered/routed country counts separate, compares the complete inventory with curated profiles and may enrich the selected Iran ASNs from the public CC0 `ipverse/as-metadata` JSON dataset.

Operational rules:

- country membership comes from the RIPE/RIR inventory, not from ipverse classification;
- registry identity, routing visibility, topology metrics and censorship evidence remain separate dimensions;
- the ipverse world dataset is byte bounded and its exact downloaded bytes are SHA-256 anchored;
- secondary country disagreement is surfaced as a quality finding rather than silently overriding scope;
- the candidate queue is an analyst-review priority list, not a censorship score;
- the full world metadata download is intentionally **not** part of routine GitHub Actions;
- upstream/download/format failures remain explicit hard errors.

## Passive routing collectors

### RIPE RIS Live

```bash
npm run collect:ris -- --asn AS58224
```

The collector is passive, validates/limits prefix scope, writes under Git-ignored `var/ris-live/` and should run as a separate service/user with write access only to its output directory.

### Route Views / BGPStream

```bash
npm run collect:routeviews -- --asn AS58224
```

This is also a separate optional operator process. It must remain restricted to Route Views resources and validated prefix scope. BGPStream must not be used to relabel RIPE data as a second independent routing source. Route events remain control-plane context only.

## Circumvention context

- Iran Tor transport values remain lower/upper estimate bounds;
- non-overlapping intervals may support only a direction, never an exact client-count delta;
- global BridgeDB transport-demand data is explicitly not Iran-specific;
- Tor/BridgeDB ↔ STOP matching is temporal context only and cannot create causality or a censorship vote;
- no active VPN/circumvention protocol probing is enabled by this release.

## Ookla Open Data boundary

The repository includes only the reviewed official-object contract and feasibility policy. Do not publish an Iran Ookla aggregate until a reviewed country-boundary dataset and spatial join are implemented and validated. Do not use a bounding box as a country substitute and do not label performance differences as throttling/censorship without independent evidence.

## Release-note integrity

Stable versions require `release-notes/vX.Y.Z.md` to pass CI. The release-publication recovery workflow may populate an accidentally empty GitHub Release body from the canonical file, but it does not overwrite an existing body. Release notes do not authorize Fleet deployment.

## Fleet Stage-1 laboratory material — NOT production-authorized

Files under `deploy/fleet-stage1-lab/` exist to validate sandbox/egress requirements in an isolated Linux laboratory. They are not permission to enable an Iran probe.

Before any real Iran pilot, all of these external gates are mandatory:

1. run the systemd units on an isolated Linux host and verify actual kernel/cgroup privilege, filesystem, listener and negative-egress enforcement;
2. deploy real project-controlled benign Class-A control/measurement endpoints and a bounded collection edge;
3. provision scheduler/probe keys and SPKI pins out of band; exercise rotation and revocation;
4. execute and record the rollback procedure against a known-safe version;
5. obtain voluntary informed operator consent outside the repository and prove local withdrawal works without central connectivity;
6. receive explicit authorization before enabling the pilot.

Repository code deliberately keeps `deploymentAuthorized:false`. CI, PR approval, tagging or a release never override this boundary.

### Fleet network/evidence restrictions

- no remote shell or generic plugin execution;
- no arbitrary scheduler-supplied endpoint;
- no blocked-site lists, DPI trigger strings/fuzzing or throughput stress testing;
- no WireGuard/OpenVPN/V2Ray/Outline activation during the current Stage-1 Class-A pilot design;
- no province inference from source IP/ASN/latency;
- no white-SIM/ordinary-SIM inference or sensitive subscriber identifiers;
- no NIN-vs-global claim until a separately reviewed target taxonomy and paired design are approved;
- per-probe fleet output cannot automatically become a national/province availability or censorship badge.

## Reverse proxy / operational requirements

- TLS 1.2+ / TLS 1.3;
- preserve/strengthen application security headers;
- authentication/SSO/IP allowlisting where appropriate;
- request-rate limits for Internet-facing paths;
- never expose operator data directories or secrets;
- distinguish monitor failure from legitimate source-specific `no_data`, `partial`, token-required or rate-limited states.

Active Globalping remains disabled by default and should not be enabled without an explicit operational reason and the documented controls.
