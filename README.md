# Iran Censorship Monitor

Production-oriented monitoring dashboard for Internet connectivity, censorship indicators, routing/outage signals, and circumvention context in Iran.

**Status:** v1.0.1 · reconstructed from the prototype export and made independently runnable on 2026-09-08.

The application does **not** ship simulated monitoring values. Live upstream observations are requested server-side. When a source is unavailable, unconfigured, rate-limited, or has no data, the UI reports that state instead of inventing a value.

## v1.1 censorship-intelligence layers

The application now separates evidence by observation family instead of collapsing everything into a generic availability score:

- **censorship measurement:** OONI + Censored Planet;
- **data plane / outages:** RIPE Atlas + IODA + Cloudflare Radar;
- **control plane:** RIPEstat / RIPE RIS, with bounded on-demand BGP announcements/withdrawals;
- **Iran vantage coverage:** Globalping probe inventory; active measurements are disabled by default and operator-controlled;
- **circumvention:** Tor direct/bridge estimates plus country × transport lower/upper bounds;
- **topology/chokepoints:** PeeringDB + Internet Health Report AS Hegemony;
- **test inventory:** Citizen Lab Iran list;
- **curated incident context:** Internet Society Pulse when a token is configured;
- **OSINT discovery:** curated Iran-specialist/professional source registry + GDELT DOC 2.0 allowlisted discovery.

A dedicated control/data-plane divergence classifier flags the Iran-relevant pattern where BGP visibility remains high while independent user-path disruption signals are severe. This is described as **compatible with** selective isolation/filtering/throttling/whitelisting, never as proof of mechanism or intent.

## What is monitored

- **OONI** — censorship/application measurements for Iran, optionally scoped to an Iranian ASN and target.
- **RIPE Atlas** — active public probes and built-in Ping measurement 1001 for path RTT/loss context.
- **IODA** — country/ASN connectivity signals and outage-event context.
- **Tor Metrics** — direct and bridge user estimates for Iran as circumvention context.
- **Cloudflare Radar** — HTTP traffic, outage annotations, traffic anomalies, and BGP hijack context when a Radar Read API token is configured.
- **OONI circumvention/messaging tests** — Tor, Psiphon, Signal, WhatsApp, Telegram.
- **Local field measurements** — optional browser-local control-vs-tunnel entries for WireGuard/OpenVPN/etc.; these are never pre-populated and are not presented as a national live probe fleet.

## Requirements

- Node.js **20.11 or newer**. Node.js 22 LTS is recommended for production.
- Outbound HTTPS/DNS access from the server to the public measurement APIs.
- Optional Cloudflare Radar API token with `Account > Radar > Read`. The token is loaded server-side only.

No runtime npm dependencies are required.

## Start locally

```bash
cp .env.example .env
npm start
```

Open `http://127.0.0.1:4173`.

Development with automatic Node restart:

```bash
npm run dev
```

## Validate

```bash
npm run check
npm run verify:radar   # requires configured token + outbound DNS/HTTPS
npm run build
```

`npm run check` performs JavaScript syntax checks and the complete offline test suite. `npm run verify:radar` performs a live, read-only Cloudflare Radar acceptance check without printing the token. `npm run build` creates a production bundle in `dist/`.

## Environment

| Variable | Required | Purpose |
|---|---:|---|
| `CLOUDFLARE_RADAR_API_TOKEN` | No | Enables the Cloudflare Radar source. Leave empty to show an explicit `token_required` state. |
| `HOST` | No | Bind address. Default `127.0.0.1`. Use `0.0.0.0` only behind an appropriately secured reverse proxy/firewall. |
| `PORT` | No | HTTP port. Default `4173`. |
| `CACHE_TTL_MS` | No | In-memory upstream response cache. Default `120000` ms. |

The server loads `.env` automatically and never overwrites environment variables already supplied by the operating system/service manager.

## Production deployment

Build a minimal runtime directory:

```bash
npm run build
cd dist
node server.mjs
```

For Internet-facing use, place the Node service behind an HTTPS reverse proxy such as Nginx, Caddy, Apache, HAProxy, or a managed ingress. Terminate TLS at the proxy and keep the Node listener private where practical.

A minimal systemd example is documented in [PRODUCTION.md](PRODUCTION.md).

## Integrity rules

1. No missing metric is replaced by a fabricated value.
2. OONI result sets that hit the API's 1000-row list limit are explicitly marked truncated. Their anomaly rate is excluded from automated disruption classification.
3. RIPE Atlas path loss/RTT is not labeled as national Internet availability.
4. IODA outage detections are disruption indicators, not proof of censorship intent.
5. Tor user-count deviations are context signals, not automatic censorship attribution.
6. Cloudflare Radar is enabled only with a real Radar Read token. Iran and selected-ASN filters are applied consistently to Radar HTTP, outage and traffic-anomaly queries; BGP uses `involvedCountry=IR` or `involvedAsn` as appropriate.
7. WireGuard/OpenVPN are not claimed as live country-wide tests because this project currently has no owned probe fleet in Iran.
8. Multi-source status expresses corroboration of measurement signals, not political attribution.

## Project layout

```text
public/               Dashboard UI
server.mjs            HTTP server and internal API routes
lib/                   Upstream adapters and assessment logic
data/                  Iran ASN inventory and source registry
tests/                 Deterministic offline tests
scripts/               Build tooling
dist/                  Generated production bundle
legacy/prototype-export/   Untouched original prototype project export
```

See also:

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [CURRENT_STATE.md](CURRENT_STATE.md)
- [MANUS_DEPENDENCIES.md](MANUS_DEPENDENCIES.md)
- [SECURITY.md](SECURITY.md)
- [PRODUCTION.md](PRODUCTION.md)
- [CHANGELOG.md](CHANGELOG.md)

## Original prototype export

The original 27-file export is preserved byte-for-byte under `legacy/prototype-export/` for audit/reference. The production application does not depend on prototype-specific runtime modules.
