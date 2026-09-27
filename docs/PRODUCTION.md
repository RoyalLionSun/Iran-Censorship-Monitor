# Production Deployment

## Release state

The current release is v1.9.0 (27 September 2026), the plain-language redesign. The step-by-step checklist for going online is [GO_LIVE.md](../GO_LIVE.md).

Publishing the dashboard does not authorize a probe deployment in Iran: `deploymentAuthorized:false` stays, and the Fleet Stage-1 material remains a laboratory design.

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
Iran Censorship Monitor / Node.js  (state in var/: local store, last good answers, reports)
        |
        +--> OONI (+ optional collector into var/store/monitor.db)
        +--> Cloudflare Radar / Internet Society Pulse (optional tokens)
        +--> RIPE Atlas / RIPEstat / RPKI / IODA / Censored Planet
        +--> M-Lab / APNIC / Tor Metrics / Psiphon statistics / Globalping
        +--> PeeringDB / IHR / CAIDA ASRank
        \--> Access Now / Citizen Lab / GDELT
        (optional: RIPE Atlas and Globalping DNS/TLS checks, Telegram posts)

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

`npm run check` runs all deterministic tests; the latest count and date are recorded in [VERIFICATION.md](VERIFICATION.md). Routine CI also validates syntax, canonical release notes, production build, real Headless Chrome presentation, committed-secret/private-key leakage and runtime/404/traversal behavior.

## Dashboard service

Node.js 22.13 or newer is required (`node:sqlite`); the project is tested on the current Node.js 22 release (CI) and on 22.22. `node:sqlite` is still marked experimental upstream, so update Node within the 22 line and run `npm run check` after each update.

Keep the Node listener private where practical and terminate HTTPS at a reverse proxy. Run the service as an unprivileged account with appropriate systemd hardening (`NoNewPrivileges`, private temporary space and read-only system/home protections appropriate to the distribution).

Every setting is explained in `.env.example`. On a public server set at least `PUBLIC_URL` (shared links, feed, reports) and, behind a reverse proxy, `TRUST_PROXY=1` so the per-address budget sees real visitor addresses. Keep the server off a home connection: visitors see the address of the machine that answers. Back up `var/` (last good answers, finished reports, history).

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

## Shutdown context

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
