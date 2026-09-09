# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol context, circumvention telemetry and curated shutdown/OSINT evidence.

**Production release:** `v1.1.0`  
**Production branch:** `main`  
**Production commit:** `9087809d6a87ae578dd590d185c35b4438319b2d`  
**Development:** `v1.2.0-dev` on `develop/v1.2`

The application does **not** ship simulated monitoring values. Missing, unavailable, rate-limited or unconfigured sources remain explicit no-data/error states. Contextual reports never become independent technical sensor votes merely because they repeat an underlying measurement.

## Evidence architecture

- **censorship/interference:** OONI + Censored Planet;
- **data plane/connectivity:** RIPE Atlas + IODA + Cloudflare Radar;
- **performance:** M-Lab NDT with sample-aware interpretation;
- **control plane:** RIPEstat / RIPE RIS, passive RIPE RIS Live, and in v1.2 an optional passive Route Views stream collector through CAIDA BGPStream tooling;
- **protocol/deployment context:** Cloudflare Radar protocol distributions + APNIC Labs IPv6;
- **Iran vantage coverage:** Globalping passive inventory; active mode remains disabled by default;
- **circumvention:** Tor plus contextual Psiphon/Proton/Ceno reporting;
- **topology:** PeeringDB + Internet Health Report AS Hegemony;
- **targets:** Citizen Lab Iran list;
- **shutdown/OSINT:** Internet Society Pulse, Access Now #KeepItOn STOP and curated/GDELT discovery.

RIPE and Route Views routing observations are control-plane evidence. Reading RIPE through BGPStream would not create an independent source; the v1.2 second routing family is restricted to Route Views infrastructure.

## v1.2 development scope

Repository-side v1.2 work adds:

- bounded passive Route Views/BGPStream collection with explicit provenance separation from RIPE RIS;
- a security-reviewed owned-probe laboratory architecture for Class-A DNS/TCP/TLS/HTTPS observations;
- signed short-lived manifests, local target resolution, authenticated results, replay/rate/size limits and memory-only buffering;
- consent/withdrawal, trust, retention, sandbox, predeployment and rollback gates;
- fail-closed evidence rules for VPN transports and NIN-vs-global comparisons;
- explicit NO-GO/deferred decisions for province publication and white-SIM/ordinary-SIM segmentation;
- a real headless-Chrome presentation gate for M-Lab/APNIC/STOP context.

**Important:** v1.2 repository/laboratory readiness is not Iran deployment authorization. `deploymentAuthorized` remains false. A real Iran pilot requires the documented external host, endpoint, key, consent and rollback gates plus explicit authorization.

## Integrity rules

1. No fabricated values or synthetic replacements for missing data.
2. BGP visibility is not proof of working end-user Internet.
3. OONI/Censored Planet anomalies are investigation signals, not automatic proof of censorship.
4. Performance degradation alone is not attributed to state throttling or intent.
5. Context sources do not inflate independent technical corroboration.
6. Multiple owned probes remain one owned-probe source family.
7. A VPN-provider website result is not a WireGuard/OpenVPN/V2Ray/Outline transport result.
8. Province is not inferred from source IP, ASN, latency or reverse DNS.
9. White-SIM/ordinary-SIM status is not inferred or collected from sensitive subscriber identifiers.
10. NIN-vs-global claims require separately reviewed target classes and paired same-probe observations.
11. Active Globalping remains disabled by default; no risky in-country trigger/fuzzing workflow is included.

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

## Validate development state

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

Current v1.2 development verification contains **203 deterministic tests**. CI also runs the production build, committed-secret/private-key checks, runtime/404/traversal smoke tests and a real local headless-browser presentation gate.

Latest verified v1.2 runtime/UI gates before the readiness-documentation pass:

- normal CI `34365724780` — success;
- live public-source acceptance `34365369630` — success;
- real Chrome output: `UI PRESENTATION PASS · google-chrome · M-Lab/APNIC/STOP rendered in a real headless browser`.

## Optional passive routing collectors

RIPE RIS Live:

```bash
npm run collect:ris -- --asn AS58224
```

Route Views / BGPStream development collector:

```bash
npm run collect:routeviews -- --asn AS58224
```

Both are separate operator processes, passive, bounded to validated prefix scope and excluded from censorship votes. See [DATA_SOURCES.md](DATA_SOURCES.md) and [PRODUCTION.md](PRODUCTION.md).

## Project documentation

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [VERIFICATION.md](VERIFICATION.md)
- [SECURITY.md](SECURITY.md)
- [PRODUCTION.md](PRODUCTION.md)
- [CHANGELOG.md](CHANGELOG.md)
- [MEASUREMENT_FLEET.md](MEASUREMENT_FLEET.md)
- [FLEET_STAGE1_PREDEPLOYMENT.md](FLEET_STAGE1_PREDEPLOYMENT.md)
- [PROTOCOL_VPN_NIN_EVIDENCE.md](PROTOCOL_VPN_NIN_EVIDENCE.md)
- [PROVINCE_SIM_FEASIBILITY.md](PROVINCE_SIM_FEASIBILITY.md)

The original prototype export remains under `legacy/prototype-export/` for audit/reference only and is not the development basis.
