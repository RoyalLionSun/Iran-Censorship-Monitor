# Production Deployment

## Supported release state

The release candidate is **v1.6.0** on `release/v1.6.0`, based on pre-release `main` commit `42e8775cfd7a51f882a78172caee181ed613e23f`. v1.4.0 is the latest previously published GitHub Release; the repository-verified v1.5 line was not tagged/published, so v1.6.0 is the next publication and includes both v1.5 ASN/inventory work and v1.6 shutdown-context work.

Release publication does not authorize an Iran probe deployment. Repository policy remains `deploymentAuthorized:false` and the Fleet Stage-1 material remains laboratory architecture.

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
        \--> ipverse/as-metadata enrichment
```

Starting the dashboard does not start the passive routing collectors or the ASN inventory/enrichment job.

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

The v1.6.0 release candidate contains **277 deterministic tests** after the final context-export regressions. Routine CI also validates syntax, canonical release notes, production build, real Headless Chrome presentation, committed-secret/private-key leakage and runtime/404/traversal behavior.

## Dashboard service

Keep the Node listener private where practical and terminate HTTPS at a reverse proxy. Run the service as an unprivileged account with appropriate systemd hardening (`NoNewPrivileges`, private temporary space and read-only system/home protections appropriate to the distribution).

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

Protect environment/secret files outside Git and never expose tokens to browser JavaScript.

## ASN identity and inventory

`data/asns.json` is a reviewed monitoring/topology catalogue, not the complete Iran ASN universe.

```bash
node scripts/fetch-iran-asn-inventory.mjs
```

The operator-triggered command establishes country scope from RIPE/RIR data, keeps aggregate registered/routed statistics separate, compares the complete country inventory with curated profiles and can enrich the selected Iran ASN set from `ipverse/as-metadata`.

Country identity, routing visibility, topology and censorship evidence remain separate dimensions. The large world dataset is byte bounded, exact-byte SHA-256 anchored and intentionally excluded from routine GitHub Actions.

## Passive routing collectors

```bash
npm run collect:ris -- --asn AS58224
npm run collect:routeviews -- --asn AS58224
```

Both are separate optional operator processes, bounded to validated scope. BGPStream is not a separate sensor when it transports another provider's data. Routing observations remain control-plane context only.

## Shutdown context — v1.6

Internet Society Pulse is an optional token-gated curated source. The runtime preserves explicit `token_required`, `no_data`, observed and error states. Missing Pulse access is never treated as zero incidents.

Access Now STOP and Pulse remain separate provenance records. STOP/Pulse correlation requires temporal overlap plus matching broad scope and remains analyst navigation only: `possibleSameIncident:true`, `automaticMerge:false`, `independentTechnicalVote:false`.

The dashboard and context CSV preserve Pulse verification/type/cause/affected-region context. CSV exports unavailable token coverage as `matched=not_inferred`.

## Release-note integrity

Stable package versions require `release-notes/vX.Y.Z.md`. The release-publication recovery workflow can populate an accidentally empty GitHub Release body from the canonical file but does not overwrite an existing release body. Tagging or release publication does not satisfy deployment gates.

## Fleet Stage-1 — NOT production-authorized

Before any real Iran pilot, all external gates remain mandatory:

1. validate actual Linux/systemd kernel/cgroup sandbox and negative egress on an isolated host;
2. deploy real project-controlled benign Class-A control/measurement endpoints and a bounded collection edge;
3. provision scheduler/probe keys and pins out of band and exercise rotation/revocation;
4. execute rollback against a known-safe version;
5. obtain voluntary informed operator consent and prove withdrawal works without central connectivity;
6. receive explicit authorization before enabling the pilot.

Current restrictions remain: no remote shell/generic plugin execution, no arbitrary scheduler-supplied endpoints, no DPI trigger strings/fuzzing or throughput stress testing, no active VPN/circumvention transport probing in Stage 1, no province inference, no SIM entitlement inference and no NIN-vs-global claim without the separately reviewed paired-target design.

A green CI, PR, tag or release never overrides `deploymentAuthorized:false`.
