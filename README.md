# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol context, circumvention telemetry and curated shutdown/OSINT evidence.

**Release line:** `v1.3.0`  
**Production branch:** `main`  
**v1.3 feature merge:** `4f6615c309c1797f3cbcdaae2700d0d79159ca59`  
**Release metadata branch:** `release/v1.3.0` (tag/Release publication follows final metadata CI/merge)

The application does **not** ship simulated monitoring values. Missing, unavailable, rate-limited or unconfigured sources remain explicit no-data/error states. Contextual reports never become independent technical sensor votes merely because they repeat an underlying measurement.

## Evidence architecture

- **censorship/interference:** OONI + Censored Planet;
- **data plane/connectivity:** RIPE Atlas + IODA + Cloudflare Radar;
- **performance:** M-Lab NDT with sample-aware interpretation;
- **control plane:** RIPEstat / RIPE RIS, passive RIPE RIS Live, and optional passive Route Views live collection through CAIDA BGPStream tooling;
- **route-origin integrity:** RIPEstat RPKI validation/history, context only;
- **protocol/deployment context:** Cloudflare Radar protocol distributions + APNIC Labs IPv6;
- **Iran vantage coverage:** Globalping passive inventory; active mode remains disabled by default;
- **circumvention:** Tor plus contextual Psiphon/Proton/Ceno reporting;
- **topology:** PeeringDB + Internet Health Report AS Hegemony + CAIDA ASRank;
- **targets:** Citizen Lab Iran list;
- **shutdown/OSINT:** Internet Society Pulse, Access Now #KeepItOn STOP and curated/GDELT discovery.

RIPE and Route Views routing observations are control-plane evidence. BGPStream is an access/normalization framework, not a separate sensor; RIPE data accessed through BGPStream remains RIPE evidence and is never double-counted. ASRank adds topology context but derives partly from routing inputs that overlap existing sources, so it also does not inflate independent-source counts.

## v1.3 additions

- CAIDA ASRank selected-ASN topology context for rank, customer cone, degree and inferred relationships;
- explicit ASRank provenance/overlap handling with `independentCensorshipVote:false`;
- RIPEstat RPKI validation of a bounded announced-prefix set plus bounded monthly IPv4/IPv6 VRP history;
- RPKI `valid`, `invalid_asn`, `invalid_length` and `unknown` states preserved without censorship/hijack attribution;
- dedicated ASRank/RPKI context panels excluded from censorship assessment voting;
- Psiphon and Ceno/eQualitie re-reviewed as context-only because no stable supported public machine-readable Iran time-series API was established;
- expanded real headless-Chrome presentation gate covering M-Lab/APNIC/STOP plus ASRank/RPKI.

The v1.2 Fleet Stage-1 laboratory architecture remains included but **not production-authorized**. Releasing v1.3 does not authorize an Iran probe deployment. `deploymentAuthorized` remains false and a real pilot still requires the external host, endpoint, key, consent and rollback gates documented in the repository plus explicit authorization.

## Integrity rules

1. No fabricated values or synthetic replacements for missing data.
2. BGP visibility is not proof of working end-user Internet.
3. OONI/Censored Planet anomalies are investigation signals, not automatic proof of censorship.
4. Performance degradation alone is not attributed to state throttling or intent.
5. Context sources do not inflate independent technical corroboration.
6. ASRank topology and RPKI validity do not create censorship votes.
7. Multiple owned probes remain one owned-probe source family.
8. A VPN-provider website result is not a WireGuard/OpenVPN/V2Ray/Outline transport result.
9. Province is not inferred from source IP, ASN, latency or reverse DNS.
10. White-SIM/ordinary-SIM status is not inferred or collected from sensitive subscriber identifiers.
11. NIN-vs-global claims require separately reviewed target classes and paired same-probe observations.
12. Active Globalping remains disabled by default; no risky in-country trigger/fuzzing workflow is included.

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
npm run build
npm run verify:public
npm run verify:ris-live
npm run verify:bgpstream
npm run verify:ui
npm run verify:radar   # optional; requires configured Radar token
```

The v1.3 deterministic suite contains **211 tests**. CI additionally runs the production build, committed-secret/private-key checks, runtime/404/traversal smoke tests and a real local headless-browser presentation gate.

Verified release-line gates:

- feature PR #9 CI `34375070768` — success;
- post-feature-merge `main` CI `34382084051` — success, 211/211 tests;
- live-source acceptance `34374634682` — success;
- CAIDA ASRank and RIPEstat RPKI both returned valid `partial` coverage states during live acceptance;
- RIPE RIS Live and Route Views/CAIDA BGPStream acceptance — success;
- headless Chrome output: `UI PRESENTATION PASS · google-chrome · M-Lab/APNIC/STOP + ASRank/RPKI rendered in a real headless browser`.

## Optional passive routing collectors

RIPE RIS Live:

```bash
npm run collect:ris -- --asn AS58224
```

Route Views / BGPStream:

```bash
npm run collect:routeviews -- --asn AS58224
```

Both are separate operator processes, passive, bounded to validated prefix scope and excluded from censorship votes. See [DATA_SOURCES.md](DATA_SOURCES.md) and [PRODUCTION.md](PRODUCTION.md).

## Project documentation

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [SOURCE_REVIEW_V13.md](SOURCE_REVIEW_V13.md)
- [VERIFICATION.md](VERIFICATION.md)
- [SECURITY.md](SECURITY.md)
- [PRODUCTION.md](PRODUCTION.md)
- [CHANGELOG.md](CHANGELOG.md)
- [MEASUREMENT_FLEET.md](MEASUREMENT_FLEET.md)
- [FLEET_STAGE1_PREDEPLOYMENT.md](FLEET_STAGE1_PREDEPLOYMENT.md)
- [PROTOCOL_VPN_NIN_EVIDENCE.md](PROTOCOL_VPN_NIN_EVIDENCE.md)
- [PROVINCE_SIM_FEASIBILITY.md](PROVINCE_SIM_FEASIBILITY.md)

The original prototype export remains under `legacy/prototype-export/` for audit/reference only and is not the development basis.
