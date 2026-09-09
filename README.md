# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol context, circumvention telemetry and curated shutdown/OSINT evidence.

**Release line:** `v1.4.0`  
**Production branch:** `main`  
**v1.4 feature merge:** `cf121adf1cdc976c58b591b53debf1d9e987bef3`  
**Release metadata branch:** `release/v1.4.0`

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
- **targets:** Citizen Lab Iran list;
- **shutdown/OSINT:** Internet Society Pulse, Access Now #KeepItOn STOP and curated/GDELT discovery.

RIPE and Route Views routing observations are control-plane evidence. BGPStream is an access/normalization framework, not a separate sensor. ASRank adds topology context but derives partly from overlapping routing inputs, so it also does not inflate independent-source counts.

## v1.4 additions

- preserves Iran Tor transport observations as published lower/upper estimate bounds;
- reports directional change only for non-overlapping paired estimate intervals;
- keeps overlapping/touching intervals indeterminate and missing pairs as `no_data`;
- separates BridgeDB requested-transport demand as **GLOBAL · not Iran-specific**;
- correlates Tor bounds with Access Now STOP incident windows as temporal context only, never causality or blocking attribution;
- adds an Ookla Open Data official-object contract while blocking fabricated Iran aggregation until a reviewed country-boundary spatial join exists;
- expands the real headless-Chrome presentation gate to bounded Tor/BridgeDB context;
- adds canonical release notes plus a stable-version CI gate and empty-release-body recovery workflow.

The Fleet Stage-1 laboratory architecture remains included but **not production-authorized**. Releasing v1.4 does not authorize an Iran probe deployment. `deploymentAuthorized` remains false.

## Integrity rules

1. No fabricated values or synthetic replacements for missing data.
2. BGP visibility is not proof of working end-user Internet.
3. OONI/Censored Planet anomalies are investigation signals, not automatic proof of censorship.
4. Performance degradation alone is not attributed to state throttling or intent.
5. Context sources do not inflate independent technical corroboration.
6. ASRank topology and RPKI validity do not create censorship votes.
7. Tor, BridgeDB, STOP and Ookla context add zero independent censorship votes.
8. BridgeDB global demand is never relabelled as Iran-specific.
9. Multiple owned probes remain one owned-probe source family.
10. A VPN-provider website result is not a WireGuard/OpenVPN/V2Ray/Outline transport result.
11. Province is not inferred from source IP, ASN, latency or reverse DNS.
12. White-SIM/ordinary-SIM status is not inferred or collected from sensitive subscriber identifiers.
13. NIN-vs-global claims require separately reviewed target classes and paired same-probe observations.
14. Active Globalping remains disabled by default.

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

The v1.4 deterministic suite contains **237 tests**. CI additionally runs the stable-release-notes gate, production build, committed-secret/private-key checks, runtime/404/traversal smoke tests and a real local headless-browser presentation gate.

Verified v1.4 feature-line gates:

- feature branch CI `34388597794` — success, 237/237;
- feature PR #12 CI `34388825541` — success;
- feature merge `cf121adf1cdc976c58b591b53debf1d9e987bef3`;
- post-feature-merge `main` CI `34389188256` — success;
- live-source acceptance `34388597366` — success.

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
