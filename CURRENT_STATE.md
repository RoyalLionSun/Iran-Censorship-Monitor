# Current State — unreleased v1.9 UX/interpretation work

Date: **2026-09-23**

Implementation basis: **`main` at `21938941e7b5e2da3f4fee55eb744879be1f76aa`**

Intended working branch: **`feat/v1.9-ux-interpretation`** (not present on the remote at analysis time)

Package version: **`1.8.0` intentionally unchanged**

## Working state

- the former global disruption ladder is replaced by the claim-based contract in `lib/interpretation.mjs`;
- connectivity, websites/filtering, routing, connection quality and shutdown are assessed separately;
- severity, confidence, verification, coverage and attribution are separate axes;
- source counts and raw IODA/Radar event counts cannot increase severity;
- missing/partial/unavailable data cannot become a normal state;
- historical RIPEstat routing lookups are aligned to the selected window and unknown alignment suppresses divergence;
- the default Overview presents user impact, four question-oriented areas, findings, unknowns and evidence/coverage;
- the former dashboard remains available under Technical analysis;
- all new controlled presentation is paired EN/FA with RTL/LTR handling;
- Censored Planet partial observations remain visible but cannot support automatic confidence;
- OONI service findings are integrated: priority service domains, a per-domain table with bounded URL drilldown and separate WhatsApp/Telegram app tests; routine circumvention monitoring no longer requests Signal;
- country-level Censored Planet results no longer cover or support claims about a selected ASN, target or non-web test;
- current-window RIPEstat routing uses the stable latest-snapshot lookup, and RIPEstat `query_time` is read as UTC; a cold historical routing lookup can still exceed the 12 s request timeout;
- the Overview holds three blocks for non-technical readers (situation board, what this means for you, open questions); the per-claim assessment, per-website details, findings and coverage matrix live in Technical analysis;
- service claims state their coverage: measured days per service, plus the independent measurement runs behind an explicitly selected service;
- a selection means a service and covers all of its hosts plus its app test, so the Overview cannot contradict itself for a selected service;
- the Overview opens with a plain-language situation board: headline naming confirmed blocked services, six service tiles (website and app separate) and a status row for connection, test connections, global routing and complete shutdown;
- Censored Planet, RIPE Atlas and APNIC deliver data again after fixes for an upstream country-code change, an upstream response-format change and a too-short connect attempt window;
- the deterministic suite passes **424/424 tests**; build and release-notes gate pass;
- `npm run verify:ui`, including the real-app Overview gate and the EN/FA/RTL fixture, passes with headless Chrome; live public sources were checked for `AS58224`, `2026-09-15..2026-09-22`;
- the earlier screenshot was caused by an old long-lived server process returning `publicSummary` while the newly served Overview expected `assessment.interpretation`; static assets and server modules were out of sync;
- a nationwide shutdown is established only when source-native nationwide impact, two independent technical roots and a confirmed or acknowledged national Pulse record overlap in time; confidence stops at medium because root lineage is unverified;
- line endings are LF and pinned by `.gitattributes`;
- a nationwide Radar outage now also applies to a selected network: Radar files it under the country without ASNs, so the default `AS58224` view previously reported only "WhatsApp and Telegram show signs of blocking" in the middle of the 2026 blackout;
- the Overview dates each Radar outage, shows how far Cloudflare-observed traffic from Iran fell against the week before (chart with daily values), reports an outage that ended inside the period as ended and names what stayed blocked, and sets the Pulse record against the Radar dates;
- Radar quality days without sampled traffic are no longer read as 0 ms / 0 Mbit/s;
- the Farsi top bar no longer pushes the action buttons off-screen when the source summary is long;
- a view can be shared as a link: network, test, target, period and language are kept in the URL and restored on opening;
- the filter bar lists the nationwide outages Cloudflare Radar has dated for Iran since 2022; choosing one opens it with the week before and after;
- during a nationwide outage the service board explains that missing tests are a consequence of the outage, not a sign that a service worked;
- a complete, clean answer for a period that ended two or more days ago is served from memory for 24 hours; failed, stale, pending or partial answers are never kept;
- the browser gates run with a headless browser (`CHROME_BIN`, `--headless=new`);
- historical routing lookups were never historical: RIPEstat silently ignores a timestamp with milliseconds and answers with its latest snapshot. The alignment check marked those answers `unknown`, so no false claim was made, but routing for past periods and the control/data-plane divergence never worked. The timestamp is now sent in whole seconds; for the 2026 blackout the divergence (routes visible, data plane nationwide disrupted) is now reported;
- the routing card no longer calls an answer from another time "aligned";
- during a nationwide outage the Overview dates it in the headline, the shutdown tile says the outage was measured (the curated record stays unconfirmed), and connection-quality values are marked as describing only the traffic that still got through;
- OONI files measurements under Iran by probe geolocation, not network. In the 2026 blackouts most "Iranian" Web Connectivity tests came from networks registered abroad (1–20 March: 66% from AS142578, Hong Kong; 10–20 January: 100% from AS9009, a hosting/VPN provider; September 2026: 0.0%). Country-wide OONI figures now count only networks registered in Iran (RIPEstat country resource list, cached for a day); excluded tests are subtracted day by day and reported to the reader. Without the registry the exclusion is reported as not applied;
- a service with no usable test in the selected network is answered on its tile from tests in other Iranian networks, labelled as such and drawn with a dashed edge; the network's own status and claims stay network-only;
- access claims rest only on inside-out measurements: Censored Planet, which measures from abroad towards servers in Iran, is context only; OONI evidence samples in country scope skip probes on networks registered abroad, and such records are marked in the URL drilldown. INTERPRETATION.md lists where every source measures from;
- the service brands now include the hosts OONI actually tests: `www.whatsapp.com`, `t.me`, `telegram.me` and `web.facebook.com` were missing, so WhatsApp's website reported "not tested" while hundreds of tests existed (AS58224, 17–23 September 2026: blocking confirmed in 21 of 154);
- a connectivity signal names its latest event (source, kind and time), and a week in which neither outage monitors nor the incident record report a nationwide outage shows "None reported" instead of "Not confirmed";
- the Overview names, per blocked service, the Iranian networks in which it was not blocked, partly blocked (at least as many tests got through as were blocked) or showed problems without a confirmed block, with operator names and test counts; one OONI aggregation (domain × network, Iranian networks only) feeds it;
- "Who has access" on the Overview lists every Iranian network that tested the popular services in the period, with its operator, its kind (mobile operator, internet provider, hosting, public body, international organisation …), its access level (full, partly, blocked) and a mark per service; networks without any test are counted, public bodies among them named. Names and kinds come from a directory of all Iranian networks (`var/asn-directory/latest.json`) written by `node scripts/fetch-iran-asn-inventory.mjs --write`;
- a separate block "Privileged access (reported, not measured)" summarises what primary sources report about Internet Pro and white SIM cards, each statement with its source and date (Filterwatch, CNN, Wikipedia/Zoomit, The New Region). The dossier's claim of a dedicated white-SIM APN without DPI has no primary source and was not taken over; the white-SIM count is given as the range of published estimates (more than 10,000 to about 50,000). The fail-closed SIM policy in PROVINCE_SIM_FEASIBILITY.md is unchanged: the dashboard does not try to identify privileged lines;
- the outage picker also lists shutdowns of single networks or regions that Radar dated, joined into episodes (for example the 2022 mobile curfews on MCI, Irancell and RighTel, 21 September to 15 October 2022, 16 shutdowns);
- Citizen Lab's analysis of leaked documents on a per-subscriber control interface (data cut-off, 2G restriction, per-user blocking or slowing) is added to the privileged-access block as sourced context; problems without a confirmed block are described as either a block or a deliberate slowdown, which the tests cannot tell apart;
- "More services" on the Overview adds 36 services in four groups (social and messaging, Persian-language news, VPN and circumvention tools, everyday services), chosen from what OONI tests regularly in Iran; website tests only. A service is judged by majority: reachable when most tests got through, partly when most got through but some were confirmed blocked, blocked when most failed and confirmed blocks outnumber successes, otherwise problems. The same rule now applies to the per-network access table;
- during a nationwide outage, results from other Iranian networks no longer stand in for a network: only the few networks that kept access can send tests then, so their results do not stand for Iran. The all-Iran view says so;
- regional outages cannot be charted: Radar's regional annotations for Iran name no region;
- a third-party dossier (Iran "digital apartheid" report v4.5, 23 Sep 2026) was checked against primary sources; only claims the project's own sources confirm were used, see below;
- no commit, push, release, tag or deployment authorization has been made for this working state.

## Next steps (agreed, not started)

- Test the "More services" chips live and correct what does not fit.
- "Who has access": let the reader switch the columns by group (the four new groups) instead of only the six main services.
- Find a way to check mobile apps, not only websites (only WhatsApp and Telegram have OONI app tests today).
- Tor Metrics, M-Lab and APNIC also assign users by geolocation; check whether foreign VPN exits distort them as they did OONI.

## Decisions

- **Maximum selectable period (currently 120 days) — decided: keep.** Internet Society Pulse lists one *unconfirmed* national record for 8 January to 26 May 2026 (138 days). Cloudflare Radar, a technical source, dates two separate nationwide outages inside it: 8 January 16:30 UTC to 1 February 2026 and 28 February 07:00 UTC to 26 May 12:00 UTC (about 23 and 87 days). Both fit the limit, each is now charted with its week before and after, and the Pulse record stays visible with the note that Radar dates it differently. Raising the limit is therefore not needed to show the 2026 blackout.
- **IPv6 — decided: keep measuring, read against the network's own history.** IPv6 is not switched off in Iran as a whole: APNIC measures about 14% of Iranian users as IPv6-capable in October 2025, about 0.2% in June 2026 and about 24% on 20 September 2026. It is in practice a mobile protocol there: MCI (about 14–17%) and Irancell (about 18–20%) use it, while TCI and the other fixed, business and backbone networks stayed below 2% before, during and after the blackout — they never deployed it. The country and mobile values are therefore a real disruption indicator (the January collapse, the February gap and June), while a low value in a fixed network means nothing. The Technical analysis now shows APNIC's sample-weighted level for the 12 months before the selected period next to the current value, with a note that a low share only signals a disruption where IPv6 was in use before. No Overview sentence and no Radar IPv6 series were added: the APNIC table already gives the daily values, and a fixed "normal" share would be a project-defined threshold.
- **Internet Society Pulse API surface.** Only `/shutdowns` is used. The other 25 documented endpoints (IPv6, HTTPS, TLS, DNSSEC, ROA/ROV, IXP and market concentration) duplicate sources this project already has, and `/net-loss` is a modelled economic estimate rather than a measurement.

## Checked against primary sources: the 2026 blackout

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

The exact model is documented in [INTERPRETATION.md](INTERPRETATION.md). Validation results for this uncommitted state are recorded at the top of [VERIFICATION.md](VERIFICATION.md).

---

## Historical v1.8.0 release-line record

Date: **2026-09-10**  
Current release line: **`v1.8.0`**  
Production branch: **`main`**  
Previous published release: **`v1.7.0`** at `2af215401c963542e7bfc1d9e23c90c0ad2f01aa`

## v1.8.0 release state

- Issue #28, `v1.8 — plain-language current situation and English/Farsi UX foundation`, is completed.
- The v1.8 feature work is merged to `main`; current pre-release `main` before release metadata is `a8c7ba4e522b9b05404658408a714c3a87c12a4c`.
- Feature PR #29 CI `34521384028` passed before merge.
- A recurring legacy Headless Chrome fixture-readiness timing flake was stabilized by PR #30; PR CI `34521917702` and post-merge `main` CI `34522031963` passed.
- The post-merge completeness audit found remaining controlled runtime English text under Farsi mode; Issue #28 was deliberately reopened until that gap was closed.
- Completion PR #31 added versioned runtime/context locale layers and deterministic coverage. Its first CI correctly caught one untranslated Farsi topology template; the corrected PR CI `34523935503` passed.
- Final v1.8 feature `main` CI `34524065320` passed the full gate.
- Current deterministic suite: **301/301 tests passed**.
- Repository policy remains `deploymentAuthorized:false`.

## Plain-language current situation

v1.8 adds a prominent public-facing summary derived only from the existing reviewed assessment object. It does not introduce another score or independent evidence path.

The summary distinguishes:

- insufficient data;
- no corroborated major disruption;
- an elevated signal in one source;
- corroborated disruption signals;
- strong multi-source disruption signals.

The presentation preserves the evidence boundary explicitly:

- BGP control-plane visibility is not proof of working end-user Internet;
- absence of a detected major disruption is not proof that Internet access is fully normal;
- source anomalies or performance degradation do not establish censorship mechanism, political intent or attribution by themselves;
- the current assessment does not automatically assert a complete nationwide shutdown;
- translated presentation text cannot create or increase an evidence vote.

High-value panels also expose concise `What this means` explanations while keeping source-specific measurements, provenance and technical drill-down visible.

## English/Farsi and RTL

The dashboard now has a central versioned English/Farsi translation architecture with a persistent `EN | فارسی` switch.

Implemented contract:

- English applies `lang=en` and `dir=ltr`; Farsi applies `lang=fa` and `dir=rtl`;
- static UI, controlled status text, explanatory text, historical v11-v17 context panels and whitelisted dynamic runtime sentence frames have paired EN/FA locale entries;
- arbitrary external-source titles and narrative content remain verbatim unless an explicit translated companion exists;
- no runtime Google, DeepL, AI or other machine-translation dependency is used;
- ASN identifiers, IP/prefix values, BGP paths, URLs, timestamps and other technical values remain direction-safe/LTR where appropriate;
- dynamic templates translate only the controlled framing and preserve their technical values;
- browser-local language persistence is verified in a real Chrome/Chromium gate.

## Verification

The final v1.8 feature state has passed:

- **301/301 deterministic tests**;
- syntax checks for application, assessment, i18n, locale, verification and collector modules;
- canonical release-note gate on the then-current stable line;
- production build;
- legacy presentation Headless Chrome gate;
- EN → FA/RTL → EN Headless Chrome gate, including persistence, Farsi runtime text, LTR technical fields and external-content preservation;
- committed-secret/private-key rejection;
- production runtime smoke test.

No v1.8 live-source acceptance was added because v1.8 changes presentation/i18n behavior only. It does not change upstream collection, source parsing, source semantics, censorship voting, ASN inventory generation or public-source acceptance contracts.

## Inherited v1.7 operational ASN acceptance

The v1.7 release path was exercised on a real Node.js runtime using public upstreams. That acceptance remains the applicable runtime baseline because v1.8 does not modify the ASN collection path.

Observed snapshot on 2026-09-10:

- country: `IR`;
- RIR-associated inventory: **856 ASNs**;
- RIPE country-level registered/routed counts: **856 / 593**;
- registered minus routed: **263**;
- curated catalogue: **23/23 inside inventory**, 23/856 = **2.69%**;
- ipverse metadata matches: **856/856**;
- secondary metadata missing: **0**;
- secondary country mismatch: **0**;
- persisted review queue: **100** candidates;
- snapshot state through `/api/asn-coverage`: **`observed`**;
- root and candidate semantics retain `independentCensorshipVote:false`.

These are acceptance observations, not hard-coded release constants. RIPE `routedCount` remains a country-level RIPE RIS control-plane count and is not an ASN-by-ASN reachability classification.

## Evidence invariants

- no fabricated values or silent replacement of missing data;
- RIR association != current routing; BGP visibility != end-user reachability;
- RIPE country-level routed counts are not an ASN-by-ASN routed set;
- ipverse metadata is secondary topology/review context and cannot override RIR country scope;
- candidate priority != censorship likelihood or political importance;
- topology/registry/inventory metadata create zero independent censorship votes;
- anomaly/performance degradation != automatic censorship or throttling attribution;
- STOP and Pulse are curated context, not raw independent sensors;
- temporal/scope correlation != incident identity or causality;
- `token_required`, `no_data`, `partial`, stale data and source errors stay explicit;
- no province or SIM-class inference;
- website reachability is not VPN-transport evidence;
- NIN claims require reviewed paired target classes;
- active Globalping remains disabled by default;
- `deploymentAuthorized:false` remains authoritative.

## Fleet deployment boundary

v1.8.0 does not authorize an Iran pilot. Real isolated Linux/systemd sandbox and negative-egress validation, project-controlled endpoints/collection edge, out-of-band key lifecycle testing, rollback testing, voluntary operator consent/withdrawal and explicit deployment authorization remain external mandatory gates.
