# Current state

Date: **2026-09-26** · Branch: **`main`** · Version: **1.8.0**, moving to **1.9.0** at release (see [GO_LIVE.md](GO_LIVE.md))

The dated history of every change is in [CHANGELOG.md](CHANGELOG.md); this page says what the project is and does today.

## What the dashboard does

- **Overview** (English and Farsi, for non-technical readers), one card per section in order of importance: current situation with headline and "what changed"; what this means for you and what we do not know; the six main services (website, app and app servers, "blocked since", per-network exceptions); ways around the filter (OONI's Tor, Snowflake, Psiphon, Riseup VPN, STUN and encrypted-DNS tests, download sites, Tor and Psiphon Conduit use, Cloudflare WARP share); further services in five groups (social and messaging, Persian-language news, VPN tools, 19 AI services, everyday services); who has access, per Iranian network and service group; who decides what is blocked and privileged access (dated primary sources, `public/context-items.js`); the connection (status tiles, outage traffic, how a shutdown unfolded); sources.
- **Technical analysis**: test results per website and address, the per-claim assessment, source cards, routing, traffic, quality and IPv6 charts, raw measurements.
- **Reports and sharing**: daily updates (`/updates`, `/feed.xml`, optional Telegram), weekly reports (Saturday to Friday) and monthly reports (`/reports`), `/widget.svg`, CSV/PDF/Word export, share menu, installable app, offline copy of the last answer.
- **Any period up to 120 days**, any Iranian network or all of Iran, with the nationwide outages Cloudflare Radar dated since 2022 selectable directly.

## Evidence rules

- Only measurements from networks registered in Iran count as evidence of access (RIPEstat country resource list); OONI tests filed under Iran from foreign VPN or hosting networks are left out and counted.
- Outside-in sources (Censored Planet, IODA, routing) are context only. Usage figures (Tor, Psiphon, WARP) are never access claims.
- No empty answers where a wider scope or another source answers: a network without tests shows the Iran-wide result, labelled; a rate-limited source shows its last good answer with its date.
- Details: [INTERPRETATION.md](INTERPRETATION.md), [DATA_SOURCES.md](DATA_SOURCES.md).

## Operation

- **Default is live and lightweight:** the server asks the public sources on demand, caches bounded answers and keeps the last good answer per source in `var/`. No heavy downloads.
- **Optional collector** (`MONITOR_COLLECTOR=1`): hourly OONI pages into the local store (`var/store/monitor.db`); OONI raw files only with `OONI_S3_ENABLED=1`.
- **Optional independent checks** (`ACTIVE_MEASUREMENTS_ENABLED=true`): RIPE Atlas (needs credits) and Globalping probes on Iranian networks check only services whose use is not punishable: the six mass services every round and five of the AI services in turn; news, opposition and circumvention stay with OONI. See [DATA_RESILIENCE_PLAN.md](DATA_RESILIENCE_PLAN.md).
- **Verification (2026-09-26):** `npm run check` 514/514 tests; release-notes gate, build and live public-source acceptance (`npm run verify:public`, AS58224) pass; GitHub CI on `main` green; browser checks in English, Farsi and at phone width without errors or horizontal overflow.

## Open items

- **Going online:** [GO_LIVE.md](GO_LIVE.md): public address, a server that is not a home connection, `TRUST_PROXY`, backups, version 1.9.0.
- **Reachable from Iran:** plan hosting that Iran does not block, mirrors and an .onion address; once online, test the dashboard's own address from inside Iran (OONI Run link or a Citizen Lab list entry).
- **Test lists:** Citizen Lab pull request #2277 (app servers; fix the `robots.txt.txt` typo); submit the sites in [OUTREACH_VPN_DATA.md](OUTREACH_VPN_DATA.md) that OONI does not test yet (opposition sites, 14 AI services).
- **RIPE Atlas credits:** request sent once the repository is public; alternatively host a probe.

## Known limits

- MCI (about half of Iran's users) has no RIPE Atlas probe; OONI answers for it.
- V2Ray/Xray, Shadowsocks, WireGuard, commercial VPNs and Starlink are not measured from inside Iran by any public source; no claim is made about them.
- Regional outages cannot be charted: Radar's regional annotations for Iran name no region.
- Tor Metrics and M-Lab's country aggregate cannot be filtered by network and stay context.
- Privileged lines (white SIM cards, "Internet Pro") run over the ordinary mobile networks and cannot be told apart in the tests; the dashboard deliberately does not try.

## Decisions

- **Targets of the independent checks — decided (26 September 2026):** whether *using* a service is punishable decides, not whether it is blocked; the six mass services and the AI services are allowed, news, opposition and circumvention stay with OONI.
- **Lightweight self-hosting — decided (24 September 2026):** no default path may download OONI's raw files or keep an archive.
- **Maximum selectable period (currently 120 days) — decided: keep.** Internet Society Pulse lists one *unconfirmed* national record for 8 January to 26 May 2026 (138 days). Cloudflare Radar, a technical source, dates two separate nationwide outages inside it: 8 January 16:30 UTC to 1 February 2026 and 28 February 07:00 UTC to 26 May 12:00 UTC (about 23 and 87 days). Both fit the limit, each is now charted with its week before and after, and the Pulse record stays visible with the note that Radar dates it differently. Raising the limit is therefore not needed to show the 2026 blackout.
- **IPv6 — decided: keep measuring, read against the network's own history.** IPv6 is not switched off in Iran as a whole: APNIC measures about 14% of Iranian users as IPv6-capable in October 2025, about 0.2% in June 2026 and about 24% on 20 September 2026. It is in practice a mobile protocol there: MCI (about 14–17%) and Irancell (about 18–20%) use it, while TCI and the other fixed, business and backbone networks stayed below 2% before, during and after the blackout — they never deployed it. The country and mobile values are therefore a real disruption indicator (the January collapse, the February gap and June), while a low value in a fixed network means nothing. The Technical analysis now shows APNIC's sample-weighted level for the 12 months before the selected period next to the current value, with a note that a low share only signals a disruption where IPv6 was in use before. No Overview sentence and no Radar IPv6 series were added: the APNIC table already gives the daily values, and a fixed "normal" share would be a project-defined threshold.
- **Internet Society Pulse API surface.** Only `/shutdowns` is used. The other 25 documented endpoints (IPv6, HTTPS, TLS, DNSSEC, ROA/ROV, IXP and market concentration) duplicate sources this project already has, and `/net-loss` is a modelled economic estimate rather than a measurement.

## Checked against primary sources: the 2026 blackout

Claims of a third-party dossier (Iran "digital apartheid" report v4.5, 23 September 2026), checked against the project's primary sources:

| Claim in the dossier | Primary source check | Used |
|---|---|---|
| Two blackout phases, not one continuous block | Radar: two nationwide annotations (8 Jan–1 Feb, 28 Feb–26 May) | yes, as Radar dates |
| Traffic near zero but not zero | Radar daily traffic: lowest 0.01% (phase 1) and 0.06% (phase 2) of the week before, typically 2.1% and 0.7% | yes, as traffic share only |
| Remaining traffic belongs to allow-listed users | not measurable with the project's sources | no — the dashboard says the remainder does not show who could connect |
| Restored connectivity is not open access | OONI after 26 May: Instagram, Telegram, YouTube, X, Facebook still confirmed blocked in AS58224 | yes |
| BGP path to one hosting provider carried only allow-listed traffic | BGP shows routes, not who sends traffic over them | no |
| Loss of IPv6 before the traffic collapse | Radar IPv6 share: usually 6–7%; on 8 Jan it fell to ~0 from about 12:00 UTC, hours before the traffic collapse (16:30–18:45 UTC); it stayed near 0 through the February gap and until early July, back to ~5–6% by September | as context in Technical analysis, read against each network's own 12-month level |
| Mobile was unstable after 26 May, fixed-line recovered | Radar per network: MCI (mobile) recovered more slowly than TCI, but Irancell (mobile) as fast as TCI | yes, as a per-network line in the traffic chart; no mobile/fixed generalisation |

The dossier's account-forensics and legal sections are outside this project's scope.
