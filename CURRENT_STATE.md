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
- OONI service findings are integrated: priority service domains, a per-domain table with bounded URL drilldown and separate WhatsApp/Telegram app tests; Signal and Facebook Messenger app tests are part of routine monitoring;
- country-level Censored Planet results no longer cover or support claims about a selected ASN, target or non-web test;
- current-window RIPEstat routing uses the stable latest-snapshot lookup, and RIPEstat `query_time` is read as UTC; a cold historical routing lookup can still exceed the 12 s request timeout;
- the Overview holds three blocks for non-technical readers (situation board, what this means for you, open questions); the per-claim assessment, per-website details, findings and coverage matrix live in Technical analysis;
- service claims state their coverage: measured days per service, plus the independent measurement runs behind an explicitly selected service;
- a selection means a service and covers all of its hosts plus its app test, so the Overview cannot contradict itself for a selected service;
- the Overview opens with a plain-language situation board: headline naming confirmed blocked services, six service tiles (website and app separate) and a status row for connection, test connections, global routing and complete shutdown;
- Censored Planet, RIPE Atlas and APNIC deliver data again after fixes for an upstream country-code change, an upstream response-format change and a too-short connect attempt window;
- the deterministic suite passes **466/466 tests**; build and release-notes gate pass;
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
- a separate block "Privileged access (reported, not measured)" summarises what primary sources report about Internet Pro and white SIM cards, each statement with its source and date (rewritten on 25 September 2026, see below). The dossier's claim of a dedicated white-SIM APN without DPI has no primary source and was not taken over. The fail-closed SIM policy in PROVINCE_SIM_FEASIBILITY.md is unchanged: the dashboard does not try to identify privileged lines;
- the outage picker also lists shutdowns of single networks or regions that Radar dated, joined into episodes (for example the 2022 mobile curfews on MCI, Irancell and RighTel, 21 September to 15 October 2022, 16 shutdowns);
- Citizen Lab's analysis of leaked documents on a per-subscriber control interface (data cut-off, 2G restriction, per-user blocking or slowing) is added to the privileged-access block as sourced context; problems without a confirmed block are described as either a block or a deliberate slowdown, which the tests cannot tell apart;
- "More services" on the Overview adds 36 services in four groups (social and messaging, Persian-language news, VPN and circumvention tools, everyday services), chosen from what OONI tests regularly in Iran; website tests only. A service is judged by majority: reachable when most tests got through, partly when most got through but some were confirmed blocked, blocked when most failed and confirmed blocks outnumber successes, otherwise problems. The same rule now applies to the per-network access table;
- during a nationwide outage, results from other Iranian networks no longer stand in for a network: only the few networks that kept access can send tests then, so their results do not stand for Iran. The all-Iran view says so;
- "Who has access" switches between the six main services and the four further groups; a network whose services each had fewer than five tests is marked "few, may be one person", dimmed and sorted after well-covered networks of its level;
- APNIC's Iran figure also counts networks registered abroad: 8.6% of its samples, mostly Cloudflare (AS13335, the WARP VPN) at 87% IPv6, which lifts Iran's IPv6 share from 12.1% (Iranian networks only) to 17.8%. The IPv6 panel shows the foreign share and both values for all of Iran. Tor Metrics publishes country totals only and M-Lab's country aggregate has no network filter, so both stay context and are documented as unfilterable;
- app tests: besides WhatsApp and Telegram, OONI's Signal, Facebook Messenger, Psiphon and Tor app tests are shown (Facebook tile: Messenger app; Signal, Psiphon and Tor chips: app status next to the website). Signal and Messenger are routine again, since OONI runs each more than 4,000 times a month in Iran. App results follow the majority rule too;
- "What changed" below the headline compares every service's website status with the period of the same length right before, in the same network, using services with at least five tests in both periods; it is withheld with an explanation when a nationwide outage overlaps either period, because tests then came only from networks that kept access;
- the server warms the default Overview on start and every few minutes; a current period's answer is kept for ten minutes (one minute if a part is missing), identical requests arriving together share one computation, so the default view opens at once instead of after 8–12 s;
- a short table of contents under the headline links to the Overview's sections;
- OONI answers are cached 15 minutes and a current Overview 10 minutes, warmed every 9.5 minutes, to stay inside OONI's request quota with the added queries; when OONI limits requests, the service board says so instead of only "No data";
- OONI meters query time per address. With the added queries and a day of testing the quota ran out ("quota exceeded", HTTP 429) and every panel showed no data. Now: after "quota exceeded" the server waits 15 minutes before asking again; windows that ended two or more days ago are cached for a day and the expensive domain-by-network query for an hour; the last good answers are stored in `var/last-good/sources.json` and survive a restart, so an outage upstream shows the dated last known state instead of empty panels; app tests that all failed no longer overwrite the last good answer;
- regional outages cannot be charted: Radar's regional annotations for Iran name no region;
- a third-party dossier (Iran "digital apartheid" report v4.5, 23 Sep 2026) was checked against primary sources; only claims the project's own sources confirm were used, see below;
- no commit, push, release, tag or deployment authorization has been made for this working state.

- resilience work (`DATA_RESILIENCE_PLAN.md`): a local store, an hourly collector and store-backed answers exist, plus independent inside-out paths (RIPE Atlas DNS/TLS, Globalping DNS/HTTPS, only probes on Iranian-registered networks) and an OONI raw-file path. **Default operation stays live and lightweight** (owner decision, 24 September 2026: the project is public and self-hosted, so no host may be made to download OONI's raw files, about 400 MB per day, or keep an archive); everything above is off until switched on, and the raw-file path and backfill are opt-in only (`OONI_S3_ENABLED=1`). The header badge's tooltip names which route answered and each path's state. Independent results appear per service as their own tile line and answer only where OONI has none, labelled. Open: switching RIPE Atlas on (owner is checking credits; 60 connected probes in 33 Iranian networks, including TCI and Irancell) and the ethics decision; Globalping has only 6 probes in Iran, all in hosting and CDN networks.

- mobile apps without an OONI app test are answered through their **app servers**: the servers the Instagram, WhatsApp, Facebook, X and YouTube apps talk to (`i.instagram.com`, `edge-chat.instagram.com`, `*.cdninstagram.com`, `*.whatsapp.net`, `*.fbcdn.net`, `*.twimg.com`, `*.ytimg.com` …) are already on Citizen Lab's global test list, so OONI devices in Iran test them. Each service tile shows them as their own line ("App servers (i.instagram.com and 4 more): blocked; 1,093 of 1,440 tests failed", TCI, 17–23 September 2026), decided by majority; a blocked majority counts for the service's status. Labelled "app servers", not "app test": apps may also use other transports (QUIC, fixed addresses) or fallbacks. Missing from the lists: YouTube's API and video servers, X's API, `graph.facebook.com`, TikTok's app servers (a pull request to Citizen Lab's test lists is being prepared);
- Latin names inside Farsi sentences (servers, networks, sources) are isolated left-to-right, and the Farsi lines avoid brackets around them, because the browser rendered those brackets unmirrored;

- header, the same in both languages: logo right, the name "Iran Censorship Monitor" in white in the middle (the subtitle repeated the name and was removed), and @RoyalLionSun left in the logo's gold, in Edwardian Script ITC where the reader has it installed (it ships with Microsoft Office and may not be redistributed, so it is only referenced with `local()`), otherwise in the similar Pinyon Script, self-hosted under the SIL Open Font License in `public/fonts/` because the page loads no external fonts. Below the header a toolbar holds the Overview / Technical analysis switch and, opposite, language, update time, Refresh and Export; the filters follow. The sources badge with its per-source tooltip sits with the source register. The update time appears only once data has arrived and is fully localized in Farsi;

- with "All networks in Iran" selected, sentences no longer speak of "this network": each such text has an all-Iran wording (locale key + `.iran`, chosen centrally in `v18-situation.js`), e.g. "Confirmed by tests that people ran inside Iran". The network selection reads "All networks in Iran" instead of the technical "may hit OONI row limit";

- network selection checked against RIPE Atlas's population coverage for Iran (sg-pub.ripe.net/petros/population_coverage): the six Iranian networks with estimated users that were missing were added (Negin Ertebatate Ava AS56548, IsIran AS25306, MahanNet AS44090, Petiak AS51469, Sari System Bandarabbas AS59573, AS210705, registered to a private person and shown by number only; type "unclassified" until known). Cloudflare AS13335 and NetCrafters AS203273 are registered abroad and stay out. "All networks in Iran" already counts all 858 networks registered in Iran. The same list shows that MCI (AS197207, about 48% of users) has no RIPE Atlas probe at all, Irancell 2 and TCI 8, so RIPE Atlas can never answer for MCI; OONI does;
- a test wrote its two sample networks into the stored Iran registry (`var/iran-asns.json`); fixed, and a far shorter answer can no longer replace a stored registry;

- **use of Cloudflare's WARP VPN among users in Iran** (APNIC Labs, AS13335's share of all samples filed under Iran, 30-day averages): shown in the "Ways around the filter today" board with today's share, a year ago, the lowest month and twelve monthly bars. It shows when this way around the filter stopped working: about 2.5–4% in 2025, under 1% from February to August 2026 (0.1% in July), 6.4% on 20 September 2026. Days with fewer than 1,000 samples for all of Iran (the blackouts) are left out rather than turned into shares. An estimate and circumvention context, never an access claim for a service; about 5 MB from APNIC every 12 hours;

- **report export** (Export menu): "Word report (.docx)" builds a real Word file in the browser (no library: WordprocessingML in a stored ZIP), Farsi set right to left, statuses coloured; "PDF report" opens the same report in a print layout (`report-print.css`) and the browser's "Save as PDF" writes the file, because a PDF generated in code cannot set Farsi without shipping fonts and a shaping engine. Both take their text from the rendered Overview, so language, wording and figures match the screen. Checked on the real page in both languages: valid .docx (ZIP checksums, well-formed XML) and a clean A4 layout;
- a new label "Signal" once made the page translate the messenger Signal into "indicator" in Farsi (static texts are translated by their English wording); a test now fails if any interface text is spelled like a service name;

- Technical analysis opens with "Test results per website", before how the measurements are assessed: one card per service (six, in two rows of three) with its tested addresses as rows (tests, confirmed, anomalous, last day, "Inspect URLs"), the servers its app uses, and one line naming addresses nobody tested. Before, each address was its own card (Telegram three times) and a separate box listed "Instagram: not tested" for the alias instagram.com while www.instagram.com was blocked; that box is gone. The header counts the tests of all these websites instead of one address;

- audit of 24 September 2026 (`AUDIT_2026-09.md`): Brotli/gzip and ETags (a page view from about 1.2 MB to about 200 KB; unchanged files cost nothing on return), an offline copy of exactly the viewed page with a dated notice (`public/sw.js`, online always fresh), link previews with a header-style image, installable app manifest, skip link, reduced motion, one main heading, Persian digits in the technical view, reports reachable on phones, Persian browsers open in Farsi, footer mirrors the header. Proposals needing a decision are listed there;

- **"Blocked since"** per service on the Overview tiles: monthly OONI results since January 2022 on TCI, MCI and Irancell (about 92% of users; inside-out only), majority rule per month, as a sentence ("Blocked throughout since at least Jan 2022", "Blocked without interruption since Feb 2023") and a strip of one bar per month. Months more than half covered by a nationwide shutdown (Cloudflare Radar) are purple and neutral, as are months with fewer than 10 tests; more than three such months in a row end a "since". Completed months are stored in `var/history/` and only the current month is asked again, at most once a day (initially 18 OONI queries of about 8 s each). WhatsApp's strip shows the 2024–2026 period when it was reachable;
- visible "Install app" button (where the browser offers it; iPhone gets a short guide) and "Share this finding" (the phone's share sheet, or Telegram/WhatsApp/X links and "Copy link");

- **"What changed" feed** (`/feed.xml`, `/feed.xml?lang=fa`, Atom): one entry per day for all of Iran with the headline, the changes against the period before, "blocked since" per service and the WARP share, in the page's own wording (the server uses the page's locale files). Built from the cached Overview at most every 6 hours; linked in the page head and footer. Optional: each new day's entry is posted to a Telegram channel per language (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_EN/FA`);
- the overview browser gate occasionally reports "no requests" right after other headless runs; it passes on rerun (three in a row on 25 September 2026);

- **embeddable widget** (`/widget.svg`, `?lang=fa`): an image of the six main services with status and "blocked since", in the header's style, for news sites and NGOs; an image works everywhere while the page itself refuses framing. Export menu → "Widget for your website" shows both previews and a one-line code to copy. Built from the same 30-minute snapshot as the feed;

- **monthly reports** (`/report?month=YYYY-MM`, `&lang=fa`; index `/reports`, linked in the footer): a page per month for all of Iran — headline, the six services with website/app figures and "blocked since" as of the month's end, the comparison with the period before, further services by group, who had access, nationwide shutdowns and WARP use — light and printable ("Save as PDF"), in the Persian calendar in Farsi. A finished month is written once to `var/reports/` (only from a complete answer) and never recomputed;
- licences: code MIT (`LICENSE`); published results CC BY-NC-SA 4.0 following OONI's data licence (`DATA_LICENSE.md`), credited in the footer, feed, widget and reports; logo and preview image excluded. Security headers: Permissions-Policy, and HSTS once `PUBLIC_URL` is https;

- a returning reader sees the saved state of the same view at once, marked "updating…", while the fresh answer loads; the fresh answer replaces it (and a copy is never shown over a fresher answer);

- footer: two links in the reader's language, "Monthly reports" and "Daily updates" (`/updates`, a readable page of the feed's entries with how to follow them by RSS or Telegram). Before, four links showed "Monthly reports" twice in Farsi and the raw XML feeds, which look broken to ordinary readers; the licence line is now fully translated and right to left in Farsi;
- **weekly reports** (`/report?week=YYYY-MM-DD`, the week's Saturday; weeks run Saturday to Friday, the working week in Iran): the monthly report's page for one week, cached in `var/reports` once complete. `/reports` lists the last 8 weeks and 12 months. The footer now reads "Reports: Daily, Weekly, Monthly" (daily = `/updates`), its tagline says in plain words what the page measures, and header/footer logo and handle are 10 % / 15 % larger.
- **AI services** (More services and the "Who has access" tabs), 19 services: ChatGPT (moved from Everyday), Google Gemini, Claude, DeepSeek, Perplexity (OONI website tests); Microsoft Copilot, Grok, Meta AI, the image tools Midjourney, Adobe Firefly, Leonardo AI, Ideogram, the video tools Sora, Runway, Kling AI, Pika, Luma Dream Machine and the audio tools ElevenLabs and Suno are on no Citizen Lab list and have no OONI test from Iran (26 September 2026): shown as not tested, with an image/video/audio tag, and listed for submission in OUTREACH_VPN_DATA.md. The access table shows columns only for services tested somewhere. ChatGPT, Gemini and Claude carry "not offered in Iran": OpenAI, Google and Anthropic leave Iran off their own lists of served countries (checked 26 September 2026), so a reachable website does not mean the provider accepts users in Iran.
- **Active probes may check AI services** (owner's criterion, 26 September 2026: whether *using* a service is punishable decides, not whether it is blocked). Targets: the six mass services every round plus 5 of the 19 AI services in turn (`roundHosts` in `lib/active-collector.mjs`); news, opposition and circumvention stay OONI-only. Where OONI has no test, a More services chip shows the independent check's result tagged "independent check". The paths still need `ACTIVE_MEASUREMENTS_ENABLED`, and RIPE Atlas needs credits.

- "Privileged access" panel rewritten and checked against primary sources on 25 September 2026 (no Wikipedia, no hedging, newest first, every line dated): the Cyberspace Regulation Plan bill of 26 August 2026 (RFE/RL), Bloomberg's investigation of 15 September 2026, the end of Internet Pro on 25 May 2026 (ISNA via Avash), Internet Pro's approval, groups, price and services (Iran International, Al Jazeera, CNN, Filterwatch), the AS12880 gateway collapse of 15 March 2026 (NetBlocks via Parsine), white SIM cards (Zoomit: about 50,000 in November 2025, up from fewer than 3,000 before the June 2025 war; handed to loyal voices during the 2026 war per Iran International, 10 March 2026; Khabar Foori on who grants them; the withdrawal announcement of 11 December 2025) and Citizen Lab's per-subscriber control documents;

- **"Ways around the filter today"** (Overview, after the status row): OONI's own tests of six ways around the filter, run from inside Iranian networks — Tor with its built-in bridges (`tor`), Tor via Snowflake (`torsf`), Tor without bridges (`vanilla_tor`), Psiphon (`psiphon`), Riseup VPN (`riseupvpn`) and the STUN servers Snowflake and video calls need (`stunreachability`). Each tile says works / partly (one failure in ten or more) / fails, with "worked in X of Y tests" or "failed in X of Y tests". Tests that ended in an error are not counted; below 20 usable tests a tile says "too few tests". For a selected network with too few tests, the Iran-wide figure is shown, labelled "across Iran" (not during a nationwide shutdown). Foreign networks are excluded as everywhere. The WARP share moved here from "More services". Example, AS58224, 17–23 September 2026: Tor worked in 347 of 412 tests (partly), Snowflake failed in 33 of 35, Psiphon failed in 313 of 419, STUN worked in 1,913 of 2,292;

- **"How the shutdown unfolded"** (Overview, under the outage traffic chart, and in the monthly report): for the nationwide outage in the selected period, hour by hour in Tehran time, from three public sources — routing (RIPE RIS via RIPEstat `country-resource-stats`, IPv4 and IPv6 prefixes seen worldwide), traffic (Cloudflare Radar netflows from Iran, compared with the same hour a day earlier) and reachability from abroad (IODA active probing, Iranian /24 blocks answering). Then which Iranian networks still carried the remaining traffic in the first week against the week before (Radar top ASes; networks registered abroad left out; networks registered to a private person shown by number only). Routing and IODA are labelled as outside views of connectivity, never access claims. Verified examples: 8 January 2026 — IPv6 routes 433 → 33 between 14:30 and 15:30 Tehran time, traffic below half and reachable blocks 12,173 → 423 (3.5%) between 20:30 and 21:30, IPv4 routes to 84%; first week: TIC AS49666 35% of the remaining traffic (before: under 0.1%), Fanap AS24631 13%, Fanava AS41881 12%, ITCO AS12880 10%, MCI 3% (before 33%); IPv6 did not return. 18 June 2025: IPv4 routes stayed at 97% — traffic was stopped without taking the networks off the map. Eight small requests per outage; a finished outage is stored in `var/anatomy/` and never fetched again. The source dossier's claim "AS31549 (Rasana)" is wrong: AS31549 is Aria Shatel (RIPE, Radar);

- **"Who decides what is blocked"** (Overview, before "Privileged access", same dated style; checked 25 September 2026): the Cyberspace Regulation Plan bill of 26 August 2026 (moved here from the privileged panel); the Special Task Force of 12 May 2026, its 9–2 vote of 25 May and the suspension by the Court of Administrative Justice on 26 May (Factnameh/ASL19, 29 May 2026), with the measured return of traffic on 26 May; who orders shutdowns — not published for January 2026, "competent authorities" (ICT ministry, June 2025), the Country Security Council (ICT minister, November 2019; Entekhab, 16 January 2026); the EU's listing of 29 January 2026 from the Official Journal text of Council Implementing Regulation (EU) 2026/267 — the Working Group for Determining Instances of Criminal Content (under the Attorney General's Office and the Ministry of Justice; tools to reduce bandwidth, block social media and VPNs), the contractors Yaftar and Douran Software Technologies, and SATRA; and TIC's measured share of the remaining traffic. Corrections against the source dossier: SATRA oversees online video and streaming, not internet filtering; Seraj runs online campaigns, not blocking (left out); Ariantel is an MVNO whose PROTEI documents show planning, not confirmed deployment (Citizen Lab, 2023); no primary source says the Supreme National Security Council ordered the January 2026 shutdown;

- **Dated context from one list** (`public/context-items.js`): both context panels ("Who decides what is blocked", "Privileged access") are built from one list of entries, each with a date or span, English and Farsi text and dated sources. The page sorts newest first by the latest date (a month without a day counts as its middle), writes the dates itself (Persian calendar in Farsi, also inside the Farsi texts) and can mark an entry "new" for 30 days (`added`). Adding a development is one entry; `tests/context-items.test.mjs` enforces date, both languages, no leading date in the text, no Latin start in Farsi, known sources and no Wikipedia;
- **"What this means for you"** is now five plain questions with short answers (do the big apps work, does a way around the filter help, does the internet itself work, how is it blocked, how sure is this); speed figures, counts per blocking method, Pulse context and excluded foreign tests are folded under "Numbers behind this". **"What we do not know"** lists concrete questions with what is known and a link to the answer on the page: networks without tests (e.g. 832 of 858 in a week), privileged lines, who ordered the blocks, unconfirmed problems (block or slowdown), untested services, who could still connect during a shutdown;

- **Source register and badge count the same sources**: the badge counted 13 adapters (8 in the all-Iran view) while the register shows 18 sources. Now Cloudflare Radar and Internet Society Pulse are counted too, RPKI counts as part of the RIPEstat entry, every register card shows what that source did for the current view (answered, no data in this period, needs a selected network, needs an operator token, not answering, loaded separately), and one line explains the total, e.g. "18 sources in the register · 10 queried for this view, 10 of them answered · 4 only with a selected network · 4 loaded separately". A missing Radar token counts as not configured, a stale fallback as not answering;

- **Ways around the filter, extended** (25 September 2026): two tiles for **encrypted DNS** from OONI's dnscheck test — resolvers set by name (dns.google, cloudflare-dns.com) and by IP address (1.1.1.1, 8.8.8.8). OONI's aggregate counts every dnscheck run as failed in every country (checked against two other countries), so a sample of 12 single measurements per group from Iran-registered networks is read and classified every 12 hours (`lib/encrypted-dns.mjs`). First result, 18–24 September: by name 0 of 12 worked (the server name is answered with a false internal address, `dns_bogon_error`), by address 7 of 12 (partly; timeouts). Below the tiles: the **download sites** of the tools (OONI website tests; 5 of 6 blocked), **Tor use from Iran** (Tor Metrics: about 93,000 a day directly, 21,000 via bridges), the WARP share, and an explicit note that V2Ray/Xray, Shadowsocks, Trojan, Hysteria, WireGuard, OpenVPN, Hiddify/NekoBox/Outline, commercial VPNs and Starlink are not measured from inside Iran by any public source, so no claim is made about them;

- **Review round of 25 September 2026 (bugs, display, performance):** checked in a real browser across all-Iran, single networks (Shatel, MCI, ITCO), the January 2026 shutdown, the technical view, phone width (390 px), both languages and a live language switch: no script errors, no untranslated keys or placeholders, no horizontal overflow, every control named. Fixed: the Persian middle dot read as a zero next to Persian digits (now the Persian comma, 68 strings and all joins); an untested network's heading said "not enough measurements" although the Iran-wide answer was clear (now "Not tested in this network – across Iran, all 6 popular services are blocked"); the Tor Project chip and the Tor tile disagreed (one rule now); tables and tiles vanished or said "too few tests" while OONI limited requests (now the last answer for the same period, dated); unbounded upstream cache (now bounded); no keyboard focus on links. Phones: the filters fold into one line so the finding is on the first screen; share and jump bars swipe sideways; the jump bar stays under the header and lights the section being read. Performance: first visit 370 → 284 KB (subset handle font 39 → 5 KB, WebP logo 34 → 15 KB, technical tables load with the technical view); a new view about 25 → 11 s (the encrypted-DNS sample reads in parallel and never holds up the answer); all modules preloaded; `Server-Timing` header shows each source's time;

- **Psiphon Conduit and Tor bridge types** (ways around the filter): Psiphon's public statistics (`stats.psianalytics.live/conduitStats`, the data behind conduit.psiphon.ca/stats) give the daily Conduit connections from clients in Iran (about 0.55–1.3 million a day in September 2026) and the Conduit stations run in Iran (46,799); shown as a line with 30 bars, in "What this means" and in the shared message. OONI's Psiphon test (about 72% failing) tries Psiphon's own servers, so the tile now says that most users connect through Conduit. Tor Metrics' daily users from Iran per bridge type (obfs4 ~12,000, WebTunnel ~5,000, Snowflake ~2,400, meek ~250) are shown under the Tor line: people use what works, so a type that drops suddenly is probably blocked. Both are usage from inside Iran, never access claims; Psiphon is a new source-register entry;

- **One design language for the Overview** (owner's choice, 26 September 2026): every section is its own card with one blue title, in the order of importance — current situation, "What this means" and "What we do not know", what changed, popular services, ways around the filter, more services, who has access, who decides, privileged access, connection (status tiles, outage traffic, shutdown timeline), sources. Every box inside is the same tile: dark surface, thin border and a coloured stripe at the start only for a status (red blocked, amber partly/problems, green works, grey context); no gradients, tinted surfaces or dashed borders; charts in the title blue. The jump bar sits between the heading card and the sections and stays under the header for the whole page;

## Next steps (agreed, not started)

- **Going online:** everything to do on the real server is collected in [GO_LIVE.md](GO_LIVE.md) (`PUBLIC_URL`, tokens, backup of `var/`, reachability from Iran, Citizen Lab PR #2277 typo, RIPE credits, real-phone check).

- **The dashboard itself must be reachable from Iran** before it is published: the Farsi version is for people there. Plan hosting so it is not behind a provider Iran blocks (e.g. not solely behind Cloudflare), offer mirrors and an .onion address for Tor users, and once online, check our own address from inside Iran (OONI Run link with the dashboard URL, or a Citizen Lab list entry).

- Test the "More services" chips live and correct what does not fit.
- Submit the missing app servers (YouTube API/video, X API, graph.facebook.com, TikTok) to Citizen Lab's test lists; optionally an OONI Run link with them for volunteers.

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
