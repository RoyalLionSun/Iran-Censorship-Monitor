# Iran Censorship Monitor

Iran-focused censorship-intelligence dashboard for technical measurements, routing/control-plane state, data-plane performance, protocol and circumvention context, ASN topology/inventory, and curated shutdown/OSINT evidence.

**Working line:** unreleased `v1.9` UX/interpretation redesign (`package.json` intentionally remains `1.8.0`)

**Production branch:** `main`

> **Before going online:** work through [GO_LIVE.md](GO_LIVE.md) — public address (`PUBLIC_URL`), tokens, data backup, reachability from Iran and the open items with Citizen Lab and RIPE.

The application does **not** fabricate monitoring values or convert missing access into positive/negative observations. `no_data`, `partial`, `token_required`, rate-limited and hard-error states remain explicit. Contextual reports never become independent technical sensor votes merely because they cite or repeat underlying measurements.

## Evidence architecture

- **censorship/interference:** OONI + Censored Planet;
- **data plane/connectivity:** RIPE Atlas + IODA + Cloudflare Radar;
- **performance:** M-Lab NDT; Ookla remains behind the reviewed country-aggregation feasibility boundary;
- **control plane:** RIPEstat / RIPE RIS, passive RIPE RIS Live and optional Route Views live collection through CAIDA BGPStream tooling;
- **route-origin integrity:** RIPEstat RPKI, context only;
- **protocol/deployment:** Cloudflare Radar protocol distributions + APNIC Labs IPv6;
- **Iran vantage coverage:** Globalping passive inventory, with protected active mode disabled by default;
- **circumvention:** Iran Tor direct/bridge/transport estimate bounds plus contextual Psiphon/Proton/Ceno reporting;
- **topology:** PeeringDB + IHR AS Hegemony + CAIDA ASRank;
- **ASN identity/inventory:** reviewed registry-qualified catalogue + RIPE/RIR country inventory + optional ipverse enrichment;
- **targets:** Citizen Lab Iran list;
- **shutdown/OSINT:** Internet Society Pulse + Access Now #KeepItOn STOP + curated/GDELT discovery.

## Unreleased v1.9 — claim-based interpretation

The v1.9 working line replaces the single global disruption ladder with a claim-based interpretation contract. It evaluates **general connectivity**, **websites/filtering**, **routing**, **connection quality** and **shutdown status** separately. Severity, confidence, verification, coverage and attribution are independent axes; evidence from different dimensions is never merged into a generic critical state or censorship conclusion.

The default **Overview** answers what is happening, what it may mean for users, what was actually observed and what remains unknown. **Technical analysis** retains the source measurements, charts and raw detail. Source-health colors continue to describe data availability only, never disruption severity.

Historical RIPEstat routing lookups are now aligned to the selected time window. BGP visibility remains a routing observation and never becomes proof of website or end-user reachability. IODA/Radar event counts are observations, not impact scores. Tor remains circumvention context rather than an Internet-health indicator.

The exact contract is documented in [INTERPRETATION.md](INTERPRETATION.md). This line is not yet released, committed or version-bumped.

## v1.8.0 — current situation and English/Farsi UX

v1.8.0 adds a plain-language presentation layer without changing the underlying measurement assessment, source independence or deployment policy.

The dashboard now includes a prominent **Current Situation** summary derived from the existing reviewed assessment. It distinguishes insufficient data, no corroborated major disruption, one-source elevation, corroborated disruption and strong multi-source disruption. The summary also states what the evidence does **not** establish: BGP visibility is not end-user availability, absence of a detected major disruption is not proof that Internet access is fully normal, and the current model does not make an automatic complete-nationwide-shutdown claim.

High-value panels include concise **What this means** explanations while preserving raw values, provenance and technical drill-down.

The UI now has a persistent `EN | فارسی` switch with deterministic English/LTR and Farsi/RTL behavior. Controlled static and dynamic UI text is translated through versioned local dictionaries; arbitrary external-source content is deliberately preserved verbatim. ASN identifiers, IP addresses/prefixes, BGP paths, URLs, timestamps and other technical values remain direction-safe/LTR where appropriate. There is no runtime Google/DeepL/AI translation dependency.

v1.8.0 contains **301 deterministic tests** plus real Headless Chrome coverage for EN → FA/RTL → EN switching, persistence, translated runtime text, technical LTR fields and preservation of external-source content. No new censorship sensor or independent vote is introduced, and `deploymentAuthorized:false` remains unchanged.

## v1.7.0 — operational ASN coverage

v1.7.0 made the existing ASN inventory/enrichment operationally visible without turning the dashboard into a new upstream crawler or censorship sensor.

Generate/update the bounded local snapshot from the same deployment tree as the server:

```bash
node scripts/fetch-iran-asn-inventory.mjs --write
```

The snapshot is written to `var/asn-coverage/latest.json`. `GET /api/asn-coverage` reads only that local file; normal dashboard loading therefore does not download the RIPE inventory or the ipverse world dataset. Missing, stale and invalid snapshots remain explicit states. The dashboard shows bounded coverage statistics and review candidates only; candidate priority remains topology/inventory context and creates zero censorship votes.

The 2026-09-10 live runtime acceptance successfully generated, persisted and served an `observed` Iran snapshot. It observed 856 RIR-associated ASNs, 856 registered / 593 RIPE-RIS-routed country-level ASNs, 23/23 curated ASNs inside inventory, 856/856 ipverse metadata matches, zero secondary metadata misses, zero secondary country mismatches and a bounded 100-entry review queue. These values are observations from that acceptance run, not hard-coded release constants.

The live acceptance also exposed a RIPEstat `country-resource-list` response variant that omitted the documented `data.resource` echo. The v1.7 hotfix keeps the request explicitly scoped to `resource=IR`, tolerates only the omitted echo, still rejects an explicit non-IR resource, and retains `resources.asn` structural validation.

Routine CI no longer runs for feature-branch pushes. Pull-request CI, `main` CI and `v*` tag CI remain enabled; the operator-triggered large ipverse download stays outside routine Actions.

See [ASN_COVERAGE_RUNTIME.md](ASN_COVERAGE_RUNTIME.md).

## v1.6.0

v1.6.0 is published at commit `8da70a85aa61fc064292330b4eaca83238abf3a3` and includes the repository work from the unpublished v1.5 line.

### ASN scope included from v1.5 development

- registry-qualified identities and explicit operator-family grouping;
- Fanap Telecom / ZiTEL AS206065 and AS24631 retained as separate routing identities under one family;
- curated monitoring catalogue explicitly separated from the complete RIR-associated Iran ASN population;
- RIPEstat registered/routed country counts kept separate from per-ASN routing claims;
- operator-triggered CC0 ipverse enrichment with byte ceiling, SHA-256 provenance and transparent review classes.

For a full operator-triggered inventory printed to stdout:

```bash
node scripts/fetch-iran-asn-inventory.mjs
```

The large ipverse world dataset is intentionally not downloaded by routine GitHub Actions.

### Current shutdown context

- Internet Society Pulse parsing is Iran-scoped, range validated and preserves verification/type/cause/affected-region context;
- missing Pulse credentials remain `token_required`, never zero incidents;
- Access Now STOP remains a separate historical curated source, currently documented through 2025;
- STOP/Pulse correlation requires both temporal overlap and a matching broad scope class;
- correlation emits analyst candidates only: `possibleSameIncident:true`, `automaticMerge:false`, `independentTechnicalVote:false`;
- Pulse and correlation are visible in the dashboard and included in context CSV export with separate provenance.

## Integrity rules

1. No fabricated values or synthetic substitutes for missing data.
2. RIR country association is not current routing visibility.
3. BGP visibility is not proof of working end-user Internet.
4. Measurement anomalies are investigation signals, not automatic censorship proof.
5. Performance degradation alone is not attributed to throttling or political intent.
6. Context sources do not inflate independent technical corroboration.
7. Multiple ASNs in one operator family do not become independent censorship sources.
8. ASRank, ipverse and RPKI metadata create no censorship votes.
9. Tor, BridgeDB, STOP, Pulse and shutdown correlation create zero independent censorship votes.
10. `token_required`, `no_data`, stale data and source failure are never reinterpreted as zero incidents, zero inventory or availability.
11. Multiple owned probes remain one owned-probe source family.
12. Website reachability is not VPN-transport evidence.
13. Province and SIM entitlement class are not inferred.
14. NIN-vs-global claims require reviewed target classes and paired same-probe observations.
15. Active Globalping remains disabled by default.
16. `deploymentAuthorized:false` remains authoritative.
17. Severity, confidence, verification, coverage and attribution are evaluated per claim and never collapsed into a global score.
18. Source count may increase confidence only for the same time-/scope-aligned claim; it never increases severity.
19. Missing, partial, stale or unavailable data never implies a normal state.

## Requirements

- Node.js **20.11+**; Node.js 22 is the CI runtime.
- Outbound DNS/HTTPS to configured public sources.
- Optional Cloudflare Radar Read token and Internet Society Pulse API token.

There are no third-party npm runtime dependencies.

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
npm run verify:radar   # optional token
```

Without a Chromium on the machine, Google's headless test browser needs
no administrator rights and opens no windows:
`npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/chrome-headless`, then
`CHROME_BIN=<path it prints> npm run verify:ui`. It is preferable to a desktop browser, which
briefly opens empty windows on the desktop. For readable Farsi screenshots a Persian-capable font
must be installed (e.g. Vazirmatn or Noto Sans Arabic in `~/.local/share/fonts`).

v1.8.0 contains **301 deterministic tests** and retains the production build, real Headless Chrome presentation, committed-secret/private-key leakage and runtime/404/traversal gates.

## Going online

See the checklist [GO_LIVE.md](GO_LIVE.md). Most important: on the real server, set `PUBLIC_URL` in
`.env` to the dashboard's public address (for example `PUBLIC_URL=https://example.org`). Shared
links, link previews, the feed and the monthly reports then use it; on a test machine they use the
local address instead.

## Optional passive routing collectors

```bash
npm run collect:ris -- --asn AS58224
npm run collect:routeviews -- --asn AS58224
```

Both are separate bounded operator processes and remain control-plane context only.

## Project documentation

- [CURRENT_STATE.md](CURRENT_STATE.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [INTERPRETATION.md](INTERPRETATION.md)
- [DATA_SOURCES.md](DATA_SOURCES.md)
- [ASN_COVERAGE_RUNTIME.md](ASN_COVERAGE_RUNTIME.md)
- [SHUTDOWN_CONTEXT.md](SHUTDOWN_CONTEXT.md)
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

The original prototype export under `legacy/prototype-export/` is audit/reference material only and is not the development basis.


## Licence

Code: MIT (`LICENSE`). Published results (dashboard findings, feed, widget, reports, exports):
CC BY-NC-SA 4.0, following OONI's data licence (`DATA_LICENSE.md`). Logo and preview image are not
licensed for reuse.

## Daily Telegram posts (optional)

The dashboard can post each day's "What changed" entry (the same text as `/feed.xml`) to a
Telegram channel, one per language:

1. In Telegram, open **@BotFather**, send `/newbot` and follow the steps; copy the token it gives.
2. Create a channel (e.g. one in English and one in Farsi) and add the bot as an **administrator**
   with the right to post.
3. In `.env` set `TELEGRAM_BOT_TOKEN=<token>`, `TELEGRAM_CHANNEL_EN=@your_channel` and/or
   `TELEGRAM_CHANNEL_FA=@your_farsi_channel`, then restart the server.

The first feed request of a new day builds the entry and posts it; nothing is posted without these
settings. Readers without Telegram can subscribe to `/feed.xml` (or `/feed.xml?lang=fa`).
