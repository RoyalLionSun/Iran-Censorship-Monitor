# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol context, circumvention telemetry and curated shutdown/OSINT evidence.

**Status:** `v1.1.0-dev` on `develop/v1.1`.

The application does **not** ship simulated monitoring values. Missing, unavailable, rate-limited or unconfigured sources remain explicit no-data/error states. Contextual reports never become independent technical sensor votes merely because they repeat an underlying measurement.

## Evidence architecture

The dashboard keeps observation families separate:

- **censorship/interference measurements:** OONI + Censored Planet;
- **data plane/connectivity:** RIPE Atlas + IODA + Cloudflare Radar;
- **performance/degradation context:** M-Lab NDT with sample-size-aware interpretation;
- **control plane:** RIPEstat / RIPE RIS, including bounded BGP announcement/withdrawal drilldown;
- **protocol/deployment context:** Cloudflare Radar protocol distributions + APNIC Labs IPv6 capability/preference;
- **Iran vantage coverage:** Globalping probe inventory; optional active measurements are disabled by default and operator-controlled;
- **circumvention:** Tor direct/bridge estimates and transport bounds plus contextual Psiphon/Proton/Ceno reporting;
- **topology/chokepoints:** PeeringDB + Internet Health Report AS Hegemony;
- **test inventory:** Citizen Lab Iran list;
- **curated shutdown incidents:** Internet Society Pulse when configured + Access Now #KeepItOn STOP;
- **OSINT discovery:** curated Iran-specialist/professional source registry + GDELT DOC 2.0.

A dedicated control/data-plane divergence classifier can flag high BGP visibility coexisting with severe user-path disruption. It reports that pattern as compatible with selective isolation/filtering/throttling/whitelisting, never as proof of mechanism or intent.

## Key integrity rules

1. No missing metric is replaced by a fabricated value.
2. BGP visibility is not treated as proof that users can reach the global Internet.
3. OONI/Censored Planet anomalies are investigation signals, not automatic proof of censorship.
4. Traffic or performance degradation alone is not automatically attributed to state censorship or throttling intent.
5. M-Lab and APNIC preserve sample/coverage metadata and are contextual, not additional censorship votes.
6. Access Now STOP, Pulse, GDELT and other OSINT remain contextual; their underlying evidence lineage must be reviewed before claiming independent corroboration.
7. Tor/circumvention usage is contextual and excluded from automatic disruption scoring.
8. Province-level or nationwide VPN success rates are not shown without a defensible measurement fleet.
9. Active Globalping measurements remain disabled by default and protected by server-side controls.
10. No high-risk in-country trigger/fuzzing workflow is included.

## Requirements

- Node.js **20.11 or newer**; Node.js 22 LTS is the verified CI runtime.
- Outbound DNS/HTTPS from the deployment host to configured public data sources.
- Optional Cloudflare Radar token restricted to `Account > Radar > Read`.
- Optional Internet Society Pulse API token.

The runtime has no third-party npm dependencies.

## Start locally

```bash
cp .env.example .env
npm start
```

Open `http://127.0.0.1:4173`.

Development mode:

```bash
npm run dev
```

## Validate

```bash
npm ci
npm run check
npm run build
npm run verify:radar   # optional; requires configured token + outbound DNS/HTTPS
```

`npm run check` performs server/client syntax checks and the complete deterministic offline suite. The permanent GitHub Actions workflow additionally performs a committed-secret check and local runtime/404/traversal smoke test.

## Environment

| Variable | Required | Purpose |
|---|---:|---|
| `CLOUDFLARE_RADAR_API_TOKEN` | No | Enables Cloudflare Radar. Server-side only. |
| `INTERNET_SOCIETY_PULSE_API_TOKEN` | No | Enables Internet Society Pulse shutdown context. Server-side only. |
| `GLOBALPING_API_TOKEN` | No | Optional higher Globalping upstream limits. |
| `GLOBALPING_ACTIVE_ENABLED` | No | Must explicitly be `true` before active Globalping can run. Default `false`. |
| `GLOBALPING_CONTROL_KEY` | No | Server-only operator key required for active Globalping. |
| `GLOBALPING_SERVER_RUNS_PER_HOUR` | No | Server-side active-run cap. |
| `HOST` | No | Bind address. Default `127.0.0.1`. |
| `PORT` | No | HTTP port. Default `4173`. |
| `CACHE_TTL_MS` | No | Default upstream in-memory cache TTL. |

The server loads `.env` without overwriting environment variables already provided by the process/service manager. `.env` is excluded from Git and production build artifacts.

## Production deployment

```bash
npm run build
cd dist
node server.mjs
```

For Internet-facing use, keep the Node listener private where practical and terminate HTTPS at a reverse proxy/managed ingress. See [PRODUCTION.md](PRODUCTION.md).

## Project layout

```text
public/               Dashboard UI
server.mjs            HTTP server and internal API routes
lib/                   Upstream adapters and assessment logic
data/                  Iran ASN/source registries
tests/                 Deterministic offline tests
scripts/               Build/verification tooling
dist/                  Generated production bundle
legacy/prototype-export/   Audit-only original prototype export
```

Detailed state and methodological boundaries:

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [VERIFICATION.md](VERIFICATION.md)
- [SECURITY.md](SECURITY.md)
- [PRODUCTION.md](PRODUCTION.md)
- [CHANGELOG.md](CHANGELOG.md)

## Historical source material

The original prototype export remains under `legacy/prototype-export/` for audit/reference only. It is not the development basis and the production runtime does not depend on prototype-specific modules.
