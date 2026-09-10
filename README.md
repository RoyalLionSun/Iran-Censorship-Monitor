# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol context, circumvention telemetry and curated shutdown/OSINT evidence.

**Release line:** `v1.5.0`  
**Production branch:** `main`  
**v1.5 feature merge:** `7821cf56233308f177755d1c92d838e307fac6d2`  
**Release metadata branch:** `release/v1.5.0`

The application does **not** ship simulated monitoring values. Missing, unavailable, rate-limited or unconfigured sources remain explicit no-data/error states. Contextual reports never become independent technical sensor votes merely because they repeat an underlying measurement.

## Evidence architecture

- **censorship/interference:** OONI + Censored Planet;
- **data plane/connectivity:** RIPE Atlas + IODA + Cloudflare Radar;
- **performance:** M-Lab NDT, with Ookla Open Data currently limited to a reviewed feasibility/contract layer until a defensible Iran spatial aggregation is implemented;
- **control plane:** RIPEstat / RIPE RIS, passive RIPE RIS Live, and optional passive Route Views live collection through CAIDA BGPStream tooling;
- **route-origin integrity:** RIPEstat RPKI validation/history, context only;
- **protocol/deployment context:** Cloudflare Radar protocol distributions + APNIC Labs IPv6;
- **Iran vantage coverage:** Globalping passive inventory; active mode remains disabled by default;
- **circumvention:** Iran Tor direct/bridge/transport estimates plus contextual Psiphon/Proton/Ceno reporting;
- **topology:** PeeringDB + Internet Health Report AS Hegemony + CAIDA ASRank;
- **ASN identity/inventory:** reviewed registry-qualified ASN catalogue + RIPE/RIR country inventory + secondary ipverse review enrichment;
- **targets:** Citizen Lab Iran list;
- **shutdown/OSINT:** Internet Society Pulse, Access Now #KeepItOn STOP and curated/GDELT discovery.

RIPE and Route Views routing observations are control-plane evidence. BGPStream is an access/normalization framework, not a separate sensor. ASRank and ipverse add topology/review context but do not inflate independent censorship-source counts.

## v1.5 additions

- replaces ad-hoc ASN labels with registry-qualified identity records, aliases, roles and explicit operator families;
- corrects known stale/misclassified entries and removes AS35718 from Iran scope;
- distinguishes TCI from TIC/Zirsakht and ITCO/DCI from TIC;
- adds Fanap Telecom / ZiTEL as one operator family with AS206065 and AS24631 retained as distinct routing identities;
- expands reviewed Iran access/backbone/cloud/topology coverage;
- validates curated ASN hard identity keys through direct RIPE Database REST `aut-num` objects;
- makes provider comparison an explicit reviewed set rather than an array-position assumption;
- separates the curated monitoring catalogue from the complete RIR-associated Iran ASN population;
- adds RIPEstat registered-vs-routed country-level ASN counts without fabricating an ASN-by-ASN routed set;
- adds on-demand CC0 ipverse enrichment with byte ceiling, SHA-256 provenance and a transparent deterministic analyst review queue;
- keeps all registry/inventory/topology metadata at `independentCensorshipVote:false`.

The Fleet Stage-1 laboratory architecture remains included but **not production-authorized**. Releasing v1.5 does not authorize an Iran probe deployment. `deploymentAuthorized` remains false.

## ASN inventory / prioritization

`data/asns.json` is a reviewed monitoring/topology catalogue, **not** a claim of complete Iran ASN coverage.

For an operator-triggered current inventory:

```bash
node scripts/fetch-iran-asn-inventory.mjs
```

The command establishes country scope from RIPEstat/RIR statistics, keeps country-level registered/routed RIPE RIS counts separate, compares the full inventory with curated profiles, and enriches only the RIR-selected Iran ASNs from `ipverse/as-metadata`.

The ipverse world JSON is intentionally not downloaded by routine GitHub Actions. Its exact downloaded bytes are SHA-256 anchored and byte bounded. Secondary country/classification fields cannot override the canonical RIR country scope and never become censorship evidence.

## Integrity rules

1. No fabricated values or synthetic replacements for missing data.
2. RIR country association is not the same as current routing visibility.
3. BGP visibility is not proof of working end-user Internet.
4. OONI/Censored Planet anomalies are investigation signals, not automatic proof of censorship.
5. Performance degradation alone is not attributed to state throttling or intent.
6. Context sources do not inflate independent technical corroboration.
7. Multiple ASNs in one operator family do not become independent censorship sources.
8. ASRank, ipverse topology and RPKI validity do not create censorship votes.
9. Tor, BridgeDB, STOP and Ookla context add zero independent censorship votes.
10. BridgeDB global demand is never relabelled as Iran-specific.
11. Multiple owned probes remain one owned-probe source family.
12. A VPN-provider website result is not a WireGuard/OpenVPN/V2Ray/Outline transport result.
13. Province is not inferred from source IP, ASN, latency or reverse DNS.
14. White-SIM/ordinary-SIM status is not inferred or collected from sensitive subscriber identifiers.
15. NIN-vs-global claims require separately reviewed target classes and paired same-probe observations.
16. Active Globalping remains disabled by default.

## Requirements

- Node.js **20.11+**; Node.js 22 is the verified CI runtime.
- Outbound DNS/HTTPS from the dashboard host to configured public sources.
- Optional Cloudflare Radar Read token and Internet Society Pulse token.

The runtime has no third-party npm dependencies.

## Start locally

```bash
cp .env.example .env
npm start
```

Open `http://127.0.0.1:4173`.

## Validate

```bash
npm ci
npm run check
npm run verify:release-notes
npm run build
npm run verify:public
npm run verify:ris-live
npm run verify:bgpstream
npm run verify:ui
npm run verify:radar   # optional; requires configured Radar token
```

The v1.5 deterministic suite contains **264 tests**. CI additionally runs the stable-release-notes gate, production build, committed-secret/private-key checks, runtime/404/traversal smoke tests and a real local headless-browser presentation gate.

Verified v1.5 feature-line gates:

- feature head CI `34403372561` — success, 264/264;
- feature PR #15 CI `34440814125` — success;
- feature merge `7821cf56233308f177755d1c92d838e307fac6d2`;
- post-feature-merge `main` CI `34440868635` — success;
- latest applicable live-source acceptance `34399378248` — success, including 23/23 curated RIPE registry identities.

## Optional passive routing collectors

RIPE RIS Live:

```bash
npm run collect:ris -- --asn AS58224
```

Route Views / BGPStream:

```bash
npm run collect:routeviews -- --asn AS58224
```

Both are separate operator processes, passive, bounded to validated prefix scope and excluded from censorship votes.

## Project documentation

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [ASN_IDENTITY_METHOD.md](ASN_IDENTITY_METHOD.md)
- [ASN_INVENTORY_METHOD.md](ASN_INVENTORY_METHOD.md)
- [SOURCE_REVIEW_V13.md](SOURCE_REVIEW_V13.md)
- [CIRCUMVENTION_CONTEXT.md](CIRCUMVENTION_CONTEXT.md)
- [CIRCUMVENTION_BOUND_CHANGE.md](CIRCUMVENTION_BOUND_CHANGE.md)
- [OOKLA_OPEN_DATA_FEASIBILITY.md](OOKLA_OPEN_DATA_FEASIBILITY.md)
- [VERIFICATION.md](VERIFICATION.md)
- [SECURITY.md](SECURITY.md)
- [PRODUCTION.md](PRODUCTION.md)
- [CHANGELOG.md](CHANGELOG.md)
- [MEASUREMENT_FLEET.md](MEASUREMENT_FLEET.md)
- [FLEET_STAGE1_PREDEPLOYMENT.md](FLEET_STAGE1_PREDEPLOYMENT.md)
- [PROTOCOL_VPN_NIN_EVIDENCE.md](PROTOCOL_VPN_NIN_EVIDENCE.md)
- [PROVINCE_SIM_FEASIBILITY.md](PROVINCE_SIM_FEASIBILITY.md)

The original prototype export remains under `legacy/prototype-export/` for audit/reference only and is not the development basis.
