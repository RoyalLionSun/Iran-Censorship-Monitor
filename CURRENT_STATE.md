# Current State — v1.1.0 development

Version: **1.1.0-dev**  
Audit date: **2026-09-08**  
Development branch: **`develop/v1.1`**

## Canonical branch model

- `main` remains the verified v1.0.1 production baseline.
- `develop/v1.1` contains the current v1.1 censorship-intelligence expansion.
- The verified v1.1 source import is committed on GitHub; temporary `bootstrap-v11` transport files have been removed.
- Permanent GitHub CI runs on branch pushes and pull requests against `main`.

## Implemented measurement and intelligence layers

### Existing baseline sensors

- OONI;
- Cloudflare Radar, token-gated server-side;
- RIPE Atlas;
- IODA;
- Tor Metrics.

### v1.1 additions

- Censored Planet GraphQL / CenAlert;
- RIPEstat / RIPE RIS routing visibility, prefix and neighbour context;
- bounded on-demand BGP announcement/withdrawal drilldown with AS paths and collector metadata;
- Globalping Iran probe inventory;
- protected, disabled-by-default Globalping active measurement endpoint;
- Tor bridge transport low/high bounds;
- Cloudflare Radar HTTP protocol/version, IP version and TLS-version distributions;
- PeeringDB topology context;
- Internet Health Report AS-Hegemony dependency/chokepoint context;
- Citizen Lab Iran target inventory;
- token-gated Internet Society Pulse context;
- curated Iran-intelligence source registry;
- allowlisted GDELT professional-source discovery;
- control-plane / data-plane divergence classification;
- dense UI panels for routing, interference, vantage coverage, topology, protocol mix, targets and intelligence.

## Methodological rules enforced

- BGP visibility is not treated as proof of user Internet availability.
- OONI or Censored Planet anomalies are not automatically labeled censorship.
- Tor/circumvention activity remains contextual evidence rather than an automatic disruption vote.
- OSINT is separated from technical sensors and does not create duplicate independent evidence when it cites an underlying measurement source.
- Missing data stays explicit; no province-level or VPN availability values are fabricated.
- Control/data-plane divergence is presented as an inferred pattern with confidence, not as a directly measured censorship mechanism.

## Active-measurement safety

Globalping active measurements are disabled by default and protected by server-side controls. The implementation restricts target classes and measurement scope and prevents private, loopback, link-local, CGNAT and reserved-address targets from being used as a measurement/SSRF proxy.

## Validation status

The v1.1 development source has passed:

- deterministic adapter/parser/scope tests;
- **42/42 offline tests**;
- `npm ci`;
- `npm run check`;
- production build;
- committed-secret scan;
- `.env` absence check;
- runtime `/api/health` smoke test;
- root-page HTTP 200 check;
- unknown-path HTTP 404 check;
- traversal-style path HTTP 404 check;
- GitHub Actions CI on the final development branch.

## Operational boundary

The original development sandbox did not provide reliable outbound DNS to all public upstream APIs. Parser behavior, query construction, security boundaries and local runtime behavior are deterministic and tested; end-to-end live-source freshness still depends on deployment on a host with normal outbound Internet access.

## Not yet implemented / intentionally deferred

- M-Lab aggregation layer for throughput/RTT/loss with sample-size-aware interpretation;
- continuous RIPE RIS Live / CAIDA BGPStream ingestion;
- owned in-country Iran probe mesh;
- trustworthy province-level continuous telemetry;
- live nationwide WireGuard/OpenVPN/V2Ray/Outline status;
- white-SIM versus ordinary-SIM measurements;
- robust continuous NIN-versus-global end-user reachability;
- automatic live ingestion of sources that only expose reports/aggregates rather than a stable machine-readable feed.

These remain future work and must not be represented as live measurements until a defensible data path exists.
