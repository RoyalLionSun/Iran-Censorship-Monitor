# Changelog

## Unreleased

- fourth audit (28 September 2026): the network comparison behind "blocked in N of M networks" now classifies each network by the same majority rule as the per-network table (`networkStatus`; one confirmed block among 100 tests no longer makes a network "blocked", it is "partly blocked" and counts as working), in the live and the store path alike; without the Iranian network registry it gives no comparison instead of counting networks registered abroad; the static-file cache also compares inode and change time; the request log keeps the path without its query string and adds the status code;
- change alerts, a shutdown day counter and expert analysis (27 September 2026): a nationwide outage beginning or ending, or one of the six main services turning blocked or reachable across Iran, becomes a feed entry in both languages (and a Telegram post, if set up) once a second check at least 50 minutes later confirms it (`lib/alerts.mjs`, `ALERT_CHECK_MINUTES`, default 30); a check without Cloudflare Radar or with a stale OONI answer changes nothing. An outage still under way is headed "since {date} · day {n}" on the page and in the feed. The weekly and monthly reports link Filterwatch's expert reports published in their period, in the reader's language, as context (`lib/filterwatch.mjs`, new entry in the source register); the daily feed entry is now found by its id, so an alert never makes it post twice;
- commit messages (27 September 2026): a `commit-msg` hook refuses co-author trailers whose address is not an anonymous GitHub one, and session or tool links, so no one but the committer is named;
- page weight budget (27 September 2026): a test keeps the dashboard's text and code under 220 KB as the server sends it (Brotli; 199.5 KB today) and names the largest files when it is exceeded; both languages stay loaded, since most readers have fast connections and repeat visits come from the browser cache;
- third audit (27 September 2026): the shutdown timeline no longer holds up a new Overview for more than ten seconds (the last timeline stands in, the answer is not kept as complete, the build finishes in the background), and the registrant lookups run side by side; `/api/stop` counts against the lookup budget, while the domain list and the ways around the filter stay outside because every page view loads them and many readers in Iran share one address; `docs/PRODUCTION.md` names the tested Node.js line;
- names of private persons (27 September 2026): the table of who has access on which network, the list of public bodies without tests and the network-coverage review (`/api/asn-coverage`) showed registry names unfiltered, so a network registered to a private person in Iran could appear with that person's name; the shutdown timeline already hid them. One rule (`publicNetworkName` in `lib/asn-names.mjs`) now applies everywhere: a name is shown only when it names an organisation, otherwise the network's number. The catalogue marks such a network (`privateRegistrant`) and keeps no name, handle or organisation for it; `/api/asn-registry` and the registry check's log leave them out as well. One exception: a network that still carried traffic during a nationwide shutdown is named in the shutdown timeline with its registrant as the RIPE Database lists it ("registered to … (RIPE Database)"), in English and Farsi, because keeping a connection while the country was cut off is the finding (for example AS210705 on 2–5 March 2026: about 5.8% of Iran's remaining traffic, 0.08% the week before); the registrant is the one the RIPE Database recorded at the time (its version history: the aut-num valid then and its organisation's name then), shown with the date and the network's name then, and kept with the finished shutdown, so a later change of registrant does not replace it (AS210705 was named "RapidoServer" in March 2026 and renamed after its registrant in September); stored shutdown timelines and reports of the older format are built again once;
- privacy (27 September 2026): verification records and guides describe browser checks generically; the time-zone test runs in Tehran time; the browser gates look for Chrome, then Edge, then Brave; a document check rejects descriptions of a personal setup or home directory, and the commit hook asks for commits in UTC;
- code security review (27 September 2026): links that are stored or sent to others (feed, open data, reports, Telegram posts) no longer take the request's `Host` header, which a visitor could set to their own address; they use `PUBLIC_URL` or the server's own address, and Telegram posts need `PUBLIC_URL`. A report not yet written counts against the visitor's budget for new Overviews; before, any visitor could make the server start one Overview per week or month and spend the budget its own requests (feed, widget, sources page) share, so these now carry a key made at each start and are not charged. A server bound to `0.0.0.0` or `::` reaches itself over loopback. GDELT links are kept only when they are web addresses (`http`/`https`);
- the all-Iran snapshot behind the open data, `/tools`, the feed and the widget is built a minute after start and every six hours, so the first reader after a restart gets it at once (it took seconds to minutes on demand);
- hardening (27 September 2026): every page carries the same security headers, now also `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` (cross-origin only for the widget, the feed and open data) and the Permissions-Policy on report pages; the server cuts off requests that arrive too slowly; the browser gates repeat a page that is still loading with a larger time budget instead of failing on a busy CI runner;
- audit of 27 September 2026: the runtime requirement is Node.js 22.13 or newer (`node:sqlite`; 20.11 was stated but could not start the server); the per-visitor budgets use a bounded table (least recently seen addresses are forgotten past 10,000) and, behind `TRUST_PROXY=1`, the last `X-Forwarded-For` entry, which the visitor cannot set; lookups a visitor can make unique (single measurements, domain drill-downs, target searches, providers, routing updates, intelligence) have their own budget (`LOOKUPS_PER_10_MIN`, default 120); CSV exports neutralise cells that would run as spreadsheet formulas; `PUBLIC_URL` is escaped in the page's meta tags; the CI secret scan also rejects Telegram bot tokens and assigned service keys;
- error answers (27 September 2026, found by CodeQL): an unexpected internal error (file system, programming) now answers with a generic message and goes to the server log instead of reaching the reader; every error text shown to readers has the server's paths removed; validation errors are still explained;
- repository security (27 September 2026): secret scanning with push protection, private vulnerability reporting, Dependabot alerts and security updates with monthly updates of the pinned Actions (`.github/dependabot.yml`), CodeQL code scanning, rulesets protecting `main` from deletion and force-push and release tags `v*` from change or deletion, Actions limited to GitHub's own actions pinned to commits with a read-only default token and approval for workflows from forks; wiki and projects off, squash merge only; `SECURITY.md` describes reporting and protection.

## 1.9.0 — 2026-09-27

The plain-language redesign; summary in `release-notes/v1.9.0.md`.

### Overview, sources, reports and resilience (2026-09-23 to 2026-09-26)

- **support** (26 September 2026): GitHub Sponsors profile with the repository's "Sponsor" button (`.github/FUNDING.yml`), a footer link in English and Farsi for supporters outside Iran and a README section on what donations pay for;
- **offline copy fix** (26 September 2026): the service worker stored every opened page (reports, updates, tools, sources) under the dashboard's address, so offline the dashboard could be replaced by the last report opened; other pages now keep their own address (cache `icm-offline-v2` replaces the old one);
- **operator health** (26 September 2026): `/api/health` reports uptime, version, each collector path with last run, last success, newest measurement and last error, cache sizes and `issues` (a switched-on path silent for three hours or with data older than 36 hours, a path error, OONI limiting requests) with `status: degraded`; `ok` stays true for readiness checks;
- **tools page** (26 September 2026): `/tools` lists only tools measured from inside Iran (Tor Browser, Snowflake, Psiphon, Riseup VPN, Cloudflare WARP, encrypted DNS) with devices, current results, the official download pages and the official channels for blocked sites (gettor@torproject.org, @GetTor_Bot, get@psiphon3.com), checked on the providers' pages; linked from the "Ways around the filter" card;
- **sources page** (26 September 2026): `/sources` in English and Farsi groups every source by what it may support and shows how it answered for the default view, taken from the warm cache; the source register links to it;
- **open daily data** (26 September 2026): `/data/latest.json`, `/data/YYYY-MM-DD.json` and `/data/index.json` publish the day's findings for all of Iran (headline, six services with "blocked since", changes, further services, ways around the filter, usage, network counts) as aggregated JSON under CC BY-NC-SA 4.0, readable from any website; one file per day in `var/data/`; described with the other public interfaces in `docs/API.md`. GitHub issue forms (service, finding, source) and a pull-request checklist; each form warns against anything that could identify people in Iran;
- performance review (26 September 2026): the last good answers are stored one file per answer, so a save writes only what changed (the single 17 MB file took about 90 ms to serialise and blocked the server on every save); large JSON answers are compressed in Node's worker threads, and a cached Overview is serialised and compressed once and then served from memory (about 1 ms instead of about 10 ms);
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
- a nationwide shutdown is established only when source-native nationwide impact, two independent technical roots and a confirmed or acknowledged national Pulse record overlap in time; confidence stops at medium because root lineage is unverified;
- a nationwide Radar outage now also applies to a selected network: Radar files it under the country without ASNs, so the default `AS58224` view previously reported only "WhatsApp and Telegram show signs of blocking" in the middle of the 2026 blackout;
- the Overview dates each Radar outage, shows how far Cloudflare-observed traffic from Iran fell against the week before (chart with daily values), reports an outage that ended inside the period as ended and names what stayed blocked, and sets the Pulse record against the Radar dates;
- Radar quality days without sampled traffic are no longer read as 0 ms / 0 Mbit/s;
- the Farsi top bar no longer pushes the action buttons off-screen when the source summary is long;
- a view can be shared as a link: network, test, target, period and language are kept in the URL and restored on opening;
- the filter bar lists the nationwide outages Cloudflare Radar has dated for Iran since 2022; choosing one opens it with the week before and after;
- during a nationwide outage the service board explains that missing tests are a consequence of the outage, not a sign that a service worked;
- a complete, clean answer for a period that ended two or more days ago is served from memory for 24 hours; failed, stale, pending or partial answers are never kept;
- historical routing lookups were never historical: RIPEstat silently ignores a timestamp with milliseconds and answers with its latest snapshot. The alignment check marked those answers `unknown`, so no false claim was made, but routing for past periods and the control/data-plane divergence never worked. The timestamp is now sent in whole seconds; for the 2026 blackout the divergence (routes visible, data plane nationwide disrupted) is now reported;
- the routing card no longer calls an answer from another time "aligned";
- during a nationwide outage the Overview dates it in the headline, the shutdown tile says the outage was measured (the curated record stays unconfirmed), and connection-quality values are marked as describing only the traffic that still got through;
- OONI files measurements under Iran by probe geolocation, not network. In the 2026 blackouts most "Iranian" Web Connectivity tests came from networks registered abroad (1–20 March: 66% from AS142578, Hong Kong; 10–20 January: 100% from AS9009, a hosting/VPN provider; September 2026: 0.0%). Country-wide OONI figures now count only networks registered in Iran (RIPEstat country resource list, cached for a day); excluded tests are subtracted day by day and reported to the reader. Without the registry the exclusion is reported as not applied;
- a service with no usable test in the selected network is answered on its tile from tests in other Iranian networks, labelled as such and drawn with a dashed edge; the network's own status and claims stay network-only;
- access claims rest only on inside-out measurements: Censored Planet, which measures from abroad towards servers in Iran, is context only; OONI evidence samples in country scope skip probes on networks registered abroad, and such records are marked in the URL drilldown. docs/INTERPRETATION.md lists where every source measures from;
- the service brands now include the hosts OONI actually tests: `www.whatsapp.com`, `t.me`, `telegram.me` and `web.facebook.com` were missing, so WhatsApp's website reported "not tested" while hundreds of tests existed (AS58224, 17–23 September 2026: blocking confirmed in 21 of 154);
- a connectivity signal names its latest event (source, kind and time), and a week in which neither outage monitors nor the incident record report a nationwide outage shows "None reported" instead of "Not confirmed";
- the Overview names, per blocked service, the Iranian networks in which it was not blocked, partly blocked (at least as many tests got through as were blocked) or showed problems without a confirmed block, with operator names and test counts; one OONI aggregation (domain × network, Iranian networks only) feeds it;
- "Who has access" on the Overview lists every Iranian network that tested the popular services in the period, with its operator, its kind (mobile operator, internet provider, hosting, public body, international organisation …), its access level (full, partly, blocked) and a mark per service; networks without any test are counted, public bodies among them named. Names and kinds come from a directory of all Iranian networks (`var/asn-directory/latest.json`) written by `node scripts/fetch-iran-asn-inventory.mjs --write`;
- a separate block "Privileged access (reported, not measured)" summarises what primary sources report about Internet Pro and white SIM cards, each statement with its source and date (rewritten on 25 September 2026, see below). The dossier's claim of a dedicated white-SIM APN without DPI has no primary source and was not taken over. The fail-closed SIM policy in docs/design-records/PROVINCE_SIM_FEASIBILITY.md is unchanged: the dashboard does not try to identify privileged lines;
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
- resilience work (`docs/DATA_RESILIENCE_PLAN.md`): a local store, an hourly collector and store-backed answers exist, plus independent inside-out paths (RIPE Atlas DNS/TLS, Globalping DNS/HTTPS, only probes on Iranian-registered networks) and an OONI raw-file path. **Default operation stays live and lightweight** (owner decision, 24 September 2026: the project is public and self-hosted, so no host may be made to download OONI's raw files, about 400 MB per day, or keep an archive); everything above is off until switched on, and the raw-file path and backfill are opt-in only (`OONI_S3_ENABLED=1`). The header badge's tooltip names which route answered and each path's state. Independent results appear per service as their own tile line and answer only where OONI has none, labelled.
- mobile apps without an OONI app test are answered through their **app servers**: the servers the Instagram, WhatsApp, Facebook, X and YouTube apps talk to (`i.instagram.com`, `edge-chat.instagram.com`, `*.cdninstagram.com`, `*.whatsapp.net`, `*.fbcdn.net`, `*.twimg.com`, `*.ytimg.com` …) are already on Citizen Lab's global test list, so OONI devices in Iran test them. Each service tile shows them as their own line ("App servers (i.instagram.com and 4 more): blocked; 1,093 of 1,440 tests failed", TCI, 17–23 September 2026), decided by majority; a blocked majority counts for the service's status. Labelled "app servers", not "app test": apps may also use other transports (QUIC, fixed addresses) or fallbacks. Missing from the lists: YouTube's API and video servers, X's API, `graph.facebook.com`, TikTok's app servers (submitted to Citizen Lab's test lists, pull request #2277);
- Latin names inside Farsi sentences (servers, networks, sources) are isolated left-to-right, and the Farsi lines avoid brackets around them, because the browser rendered those brackets unmirrored;
- header, the same in both languages: logo right, the name "Iran Censorship Monitor" in white in the middle (the subtitle repeated the name and was removed), and @RoyalLionSun left in the logo's gold, in Edwardian Script ITC where the reader has it installed (it ships with Microsoft Office and may not be redistributed, so it is only referenced with `local()`), otherwise in the similar Pinyon Script, self-hosted under the SIL Open Font License in `public/fonts/` because the page loads no external fonts. Below the header a toolbar holds the Overview / Technical analysis switch and, opposite, language, update time, Refresh and Export; the filters follow. The sources badge with its per-source tooltip sits with the source register. The update time appears only once data has arrived and is fully localized in Farsi;
- with "All networks in Iran" selected, sentences no longer speak of "this network": each such text has an all-Iran wording (locale key + `.iran`, chosen centrally in `v18-situation.js`), e.g. "Confirmed by tests that people ran inside Iran". The network selection reads "All networks in Iran" instead of the technical "may hit OONI row limit";
- network selection checked against RIPE Atlas's population coverage for Iran (sg-pub.ripe.net/petros/population_coverage): the six Iranian networks with estimated users that were missing were added (Negin Ertebatate Ava AS56548, IsIran AS25306, MahanNet AS44090, Petiak AS51469, Sari System Bandarabbas AS59573, AS210705, registered to a private person and shown by number only; type "unclassified" until known). Cloudflare AS13335 and NetCrafters AS203273 are registered abroad and stay out. "All networks in Iran" already counts all 858 networks registered in Iran. The same list shows that MCI (AS197207, about 48% of users) has no RIPE Atlas probe at all, Irancell 2 and TCI 8, so RIPE Atlas can never answer for MCI; OONI does;
- a test wrote its two sample networks into the stored Iran registry (`var/iran-asns.json`); fixed, and a far shorter answer can no longer replace a stored registry;
- **use of Cloudflare's WARP VPN among users in Iran** (APNIC Labs, AS13335's share of all samples filed under Iran, 30-day averages): shown in the "Ways around the filter today" board with today's share, a year ago, the lowest month and twelve monthly bars. It shows when this way around the filter stopped working: about 2.5–4% in 2025, under 1% from February to August 2026 (0.1% in July), 6.4% on 20 September 2026. Days with fewer than 1,000 samples for all of Iran (the blackouts) are left out rather than turned into shares. An estimate and circumvention context, never an access claim for a service; about 5 MB from APNIC every 12 hours;
- **report export** (Export menu): "Word report (.docx)" builds a real Word file in the browser (no library: WordprocessingML in a stored ZIP), Farsi set right to left, statuses coloured; "PDF report" opens the same report in a print layout (`report-print.css`) and the browser's "Save as PDF" writes the file, because a PDF generated in code cannot set Farsi without shipping fonts and a shaping engine. Both take their text from the rendered Overview, so language, wording and figures match the screen. Checked on the real page in both languages: valid .docx (ZIP checksums, well-formed XML) and a clean A4 layout;
- a new label "Signal" once made the page translate the messenger Signal into "indicator" in Farsi (static texts are translated by their English wording); a test now fails if any interface text is spelled like a service name;
- Technical analysis opens with "Test results per website", before how the measurements are assessed: one card per service (six, in two rows of three) with its tested addresses as rows (tests, confirmed, anomalous, last day, "Inspect URLs"), the servers its app uses, and one line naming addresses nobody tested. Before, each address was its own card (Telegram three times) and a separate box listed "Instagram: not tested" for the alias instagram.com while www.instagram.com was blocked; that box is gone. The header counts the tests of all these websites instead of one address;
- audit of 24 September 2026 (`docs/design-records/AUDIT_2026-09.md`): Brotli/gzip and ETags (a page view from about 1.2 MB to about 200 KB; unchanged files cost nothing on return), an offline copy of exactly the viewed page with a dated notice (`public/sw.js`, online always fresh), link previews with a header-style image, installable app manifest, skip link, reduced motion, one main heading, Persian digits in the technical view, reports reachable on phones, Persian browsers open in Farsi, footer mirrors the header. Proposals needing a decision are listed there;
- **"Blocked since"** per service on the Overview tiles: monthly OONI results since January 2022 on TCI, MCI and Irancell (about 92% of users; inside-out only), majority rule per month, as a sentence ("Blocked throughout since at least Jan 2022", "Blocked without interruption since Feb 2023") and a strip of one bar per month. Months more than half covered by a nationwide shutdown (Cloudflare Radar) are purple and neutral, as are months with fewer than 10 tests; more than three such months in a row end a "since". Completed months are stored in `var/history/` and only the current month is asked again, at most once a day (initially 18 OONI queries of about 8 s each). WhatsApp's strip shows the 2024–2026 period when it was reachable;
- visible "Install app" button (where the browser offers it; iPhone gets a short guide) and "Share this finding" (the phone's share sheet, or Telegram/WhatsApp/X links and "Copy link");
- **"What changed" feed** (`/feed.xml`, `/feed.xml?lang=fa`, Atom): one entry per day for all of Iran with the headline, the changes against the period before, "blocked since" per service and the WARP share, in the page's own wording (the server uses the page's locale files). Built from the cached Overview at most every 6 hours; linked in the page head and footer. Optional: each new day's entry is posted to a Telegram channel per language (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_EN/FA`);
- **embeddable widget** (`/widget.svg`, `?lang=fa`): an image of the six main services with status and "blocked since", in the header's style, for news sites and NGOs; an image works everywhere while the page itself refuses framing. Export menu → "Widget for your website" shows both previews and a one-line code to copy. Built from the same 30-minute snapshot as the feed;
- **monthly reports** (`/report?month=YYYY-MM`, `&lang=fa`; index `/reports`, linked in the footer): a page per month for all of Iran — headline, the six services with website/app figures and "blocked since" as of the month's end, the comparison with the period before, further services by group, who had access, nationwide shutdowns and WARP use — light and printable ("Save as PDF"), in the Persian calendar in Farsi. A finished month is written once to `var/reports/` (only from a complete answer) and never recomputed;
- licences: code MIT (`LICENSE`); published results CC BY-NC-SA 4.0 following OONI's data licence (`DATA_LICENSE.md`), credited in the footer, feed, widget and reports; logo and preview image excluded. Security headers: Permissions-Policy, and HSTS once `PUBLIC_URL` is https;
- a returning reader sees the saved state of the same view at once, marked "updating…", while the fresh answer loads; the fresh answer replaces it (and a copy is never shown over a fresher answer);
- footer: two links in the reader's language, "Monthly reports" and "Daily updates" (`/updates`, a readable page of the feed's entries with how to follow them by RSS or Telegram). Before, four links showed "Monthly reports" twice in Farsi and the raw XML feeds, which look broken to ordinary readers; the licence line is now fully translated and right to left in Farsi;
- **weekly reports** (`/report?week=YYYY-MM-DD`, the week's Saturday; weeks run Saturday to Friday, the working week in Iran): the monthly report's page for one week, cached in `var/reports` once complete. `/reports` lists the last 8 weeks and 12 months. The footer now reads "Reports: Daily, Weekly, Monthly" (daily = `/updates`), its tagline says in plain words what the page measures, and header/footer logo and handle are 10 % / 15 % larger.
- **AI services** (More services and the "Who has access" tabs), 19 services: ChatGPT (moved from Everyday), Google Gemini, Claude, DeepSeek, Perplexity (OONI website tests); Microsoft Copilot, Grok, Meta AI, the image tools Midjourney, Adobe Firefly, Leonardo AI, Ideogram, the video tools Sora, Runway, Kling AI, Pika, Luma Dream Machine and the audio tools ElevenLabs and Suno are on no Citizen Lab list and have no OONI test from Iran (26 September 2026): shown as not tested, with an image/video/audio tag, and listed for submission in docs/OUTREACH_VPN_DATA.md. The access table shows columns only for services tested somewhere. ChatGPT, Gemini and Claude carry "not offered in Iran": OpenAI, Google and Anthropic leave Iran off their own lists of served countries (checked 26 September 2026), so a reachable website does not mean the provider accepts users in Iran.
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


### Claim-based interpretation

- replaced the global `status/severity/confidence` ladder with separate connectivity, interference, routing, quality and shutdown claims;
- made severity, confidence, verification, coverage and attribution independent per-claim axes with no global numeric health score;
- prevented cross-dimension evidence, source counts and IODA/Radar event counts from increasing disruption severity or proving censorship;
- limited OONI `confirmed` to the measured blocking claim and kept cause, intent and actor attribution separate;
- kept partial Censored Planet results visible while excluding them from automatic support/confidence;
- required adequate relevant coverage before any no-disruption/no-interference finding; missing data remains explicitly unknown;
- disabled automatic nationwide-shutdown establishment after finding that event labels alone did not establish time, scope or root-evidence alignment; Pulse verification remains separate analyst context.
- stopped raising positive-claim confidence/verification merely because two source families report events within one selected window; per-incident alignment remains future work.

### Runtime compatibility and browser coverage

- removed the v1.9 overview fetch interceptor and wired the real app loader directly to Overview and source health;
- made old-backend responses and request failures visible instead of leaving an empty or indefinitely loading Overview;
- added a real-app browser gate for valid, legacy and failed API responses alongside the existing fixtures;
- removed a legacy source-health header overwrite and kept query failures neutral rather than marking them as critical incidents.

### User-facing hierarchy

- added a default Overview with a plain-language headline, user impact, four distinct question-oriented status areas, current findings, explicit unknowns and evidence/coverage;
- separated Overview from Technical analysis without removing the existing charts, raw measurements, source status or drill-down;
- retained source-health colors exclusively for data availability/usability rather than incident severity;
- added paired English/Farsi strings and direction-safe rendering for every new controlled interpretation surface.

### Routing time alignment and verification

- aligned RIPEstat routing-status requests to the selected historical window and exposed alignment state;
- suppressed control-/data-plane divergence when routing time alignment is unknown;
- stopped describing BGP visibility as control-plane health and stopped treating generic IODA/Radar event counts as severe data-plane impact;
- replaced legacy assessment regression expectations with claim-boundary, missing-data, shutdown, partial-source and time-alignment tests;
- before the runtime compatibility changes, passed the 324/324 deterministic suite, production build, browser presentation and EN/FA/RTL fixtures, and live public-source acceptance for `2026-08-30..2026-09-12` / `AS58224`; the additional real-app browser gate still needed a browser run;
- restored and regression-tested the stable `#situation-headline` DOM hook required by the browser presentation contract;
- kept `package.json` at `1.8.0` until the 1.9.0 release on 2026-09-27.

### Service findings and scope fixes (2026-09-22)

- integrated OONI service findings: priority service domains on the first screen, a per-domain Web Connectivity table with a bounded, on-demand URL drilldown, and WhatsApp/Telegram app tests shown separately from website results;
- routine circumvention monitoring now requests only `OONI_ROUTINE_TESTS`; the legacy Signal test stays available as a manual selection;
- added Facebook, Instagram, X/Twitter, Telegram Web and YouTube web targets to the target selection;
- country-level Censored Planet results no longer count toward coverage or support for a selected ASN, target or non-web test;
- current-window RIPEstat routing lookups use the stable latest-snapshot URL instead of a per-request timestamp that exceeded the request timeout; RIPEstat `query_time` is parsed as UTC;
- normalized line endings to LF and added `.gitattributes`;
- passed 349/349 deterministic tests, production build, release-notes gate, `verify:ui` with headless Chrome and a live public-source run for `AS58224`.

### Plain-language Overview and source reliability (2026-09-22)

- the Overview now opens with a situation board for non-technical readers: a headline that names confirmed blocked services, six service tiles (website and app shown separately), and a status row for internet connection, test connections, global routing and complete shutdown;
- added `services`, `summary.headline` and `summary.latestObservation` to the interpretation; `/api/overview` queries the OONI domain aggregation and app tests for this;
- the "affected services" unknown is replaced by "other services" once services were tested, removing a contradiction with the service results;
- finding metrics are labelled (`OONI · measurements: 44,091` instead of `OONI: 44,091`);
- per-website test details moved into the Overview below the assessment cards;
- Censored Planet requests use the `IR` country code; the API had started rejecting `Iran`, so every response was partial;
- RIPE Atlas ping-stats reads the current single-probe object format; connection quality was reported as unmeasured although all probes delivered data;
- Node's 250 ms per-address connect attempt is raised to 2.5 s; APNIC (Australia) failed with ETIMEDOUT on hosts without IPv6;
- 359/359 deterministic tests, build, release-notes gate and `verify:ui` pass.

### Farsi readability and slow-source handling (2026-09-22)

- Farsi sentences no longer start with a Latin word, which reversed their reading order; a locale test now enforces this for every Persian sentence;
- the header age value is isolated inside the Persian sentence, so `<1 min` is no longer rendered as `min 1>`;
- a routing lookup that exceeds the request timeout is revalidated in the background and cached; the Overview says the lookup is still being fetched instead of reporting no data;
- source-health wording is plain: `12 of 13 data sources available · 11 delivered data · 1 not answering`.

### Overview for non-technical readers (2026-09-22)

- a selection now means the service, not one hostname: selecting Facebook no longer reported "not tested" while the same page reported Facebook as blocked, and WhatsApp/Telegram selections include their app test;
- the target filter offers each service exactly once instead of per-host duplicates; a contract test keeps it that way;
- unrelated app findings can no longer drive the headline of a website selection, and a selected test without a service tile (Tor, Psiphon, DNS) gets its own headline;
- the Overview is reduced to three blocks: situation board, "What this means for you" in plain sentences, and the open questions for the current selection;
- assessment cards, findings, evidence matrix and per-website test details moved to Technical analysis, removing the fourfold repetition of the same numbers;
- the status row drops the routing tile for lay readers; routing stays in the technical assessment;
- a single unavailable side source is no longer displayed in alarm red.

### Coverage behind a finding (2026-09-22)

- service tiles state the measured days ("Measured on 7 of 7 days"), so a week of testing is no longer indistinguishable from a single day;
- an explicit service selection additionally samples the independent measurement runs behind the finding and reports a full sample as a floor;
- OONI domain aggregation carries `observedDays`; a fully qualified domain with a trailing root dot is accepted instead of rejected.

### Blocking mechanism (2026-09-23)

- service tiles state how a service is blocked: via the name lookup (DNS), blocked connections (IP), a block page, or an interrupted encrypted connection;
- the plain-language panel explains the dominant mechanism for the named service with its share of the affected tests;
- the mechanism comes from the OONI blocking type and confirmed block fingerprints, is only counted for measurements that actually have a finding, and an unspecified mechanism is never presented as one;
- the evidence samples for the affected services run in one parallel round, which kept the cold Overview at about 14 s and a warm one at 2.6 s.

### Nationwide shutdown rule (2026-09-23)

- with Internet Society Pulse access configured, the documented establishment rule is implemented and tested: source-native nationwide impact, two independent technical connectivity roots, and a confirmed or acknowledged national Pulse record whose time range overlaps both a nationwide Radar annotation and an IODA event;
- confidence stops at medium because root lineage between the sources is still unverified, Pulse never counts as a technical source, and an established shutdown is stated for its period rather than in the present tense;
- a national record that misses the rule, such as the 138-day record Pulse marks unconfirmed, is shown as context with its verification level and period instead of disappearing;
- verified live: 13-25 June 2025 is established as a nationwide shutdown, February 2026 is not established but reports the unconfirmed record, and the current window reports neither.

### Last known state and missing shutdown access (2026-09-23)

- a source that fails or rate-limits the dashboard falls back to its last successful answer for the same scope, marked `stale` with the time it was fetched, bounded to 120 remembered scopes;
- stale data stays visible as the last known state but cannot support a current claim, cannot count toward coverage and shows no current values; the Overview marks it as `LAST KNOWN SITUATION` and names the outage in the scope line;
- the shutdown tile now names the missing Internet Society Pulse access instead of leaving a generic caveat, and the setup files document how to request it.

### Historical robustness (2026-09-23)

- a tested input that is not a plain host name (`128.31.0.39:9131`, `doh.seby.io:8443`, `varzesh`) is skipped and counted instead of discarding the whole window; five such rows had blinded the dashboard for September 2022;
- the same host in several spellings (`Instagram.com` and `instagram.com`) is merged into one domain group, and a day measured under two spellings counts once; an identical row twice still fails closed;
- validated against the documented September 2022 event: AS58224, AS44244 and AS197207 reproduce blocked services, 5 to 9 connectivity events and a country-wide pattern across 56 measured networks.

### Network scope of a finding (2026-09-23)

- the plain-language panel states in how many measured Iranian networks the headline service is blocked, shows problems or stays reachable, which separates a provider decision from a country-wide pattern;
- one additional aggregation grouped by `probe_asn` answers this for the headline service, so the check costs a single request;
- the comparison is scope evidence: it never raises severity and never counts as a second source.

### Connection quality and OONI quota (2026-09-23)

- Cloudflare Radar quality (latency and bandwidth from real user traffic in the selected network) is a second source for the connection-quality claim, so that claim no longer rests on 2 to 9 RIPE Atlas probes alone;
- the Radar summary endpoint silently answers ASN queries with a 90-day window, so only the daily time series is used and every response is checked against the requested window before it counts;
- the status row states the measured values a reader can relate to (`5.1 Mbit/s · 115 ms`) instead of ping arrival alone;
- the connection-quality claim carries the quartile spread and the DNS response time, so a median no longer stands alone;
- OONI answered `429 quota exceeded` once a dashboard load fired a dozen parallel queries: OONI traffic now passes one gate with at most two parallel requests, daily-grained results are cached for ten minutes, evidence samples are capped at two per load, and a rate limit is reported as such and followed by a cooldown that serves cached values instead of hammering upstream.

## 1.8.0 — 2026-09-10

### Plain-language current situation

- added a prominent current-situation summary derived only from the existing reviewed assessment/public-summary contract rather than introducing a second scoring system;
- distinguishes insufficient data, no corroborated major disruption, one-source elevation, corroborated disruption and strong multi-source disruption;
- exposes supporting signals and control-plane/data-plane divergence while explicitly preserving that BGP visibility is not end-user Internet availability;
- states that absence of a detected major disruption is not proof that Internet access is fully normal and does not automatically claim a complete nationwide shutdown;
- added concise `What this means` explanations to high-value panels while preserving raw values, provenance and technical drill-down.

### English/Farsi UX and RTL

- added a central versioned English/Farsi locale architecture and persistent `EN | فارسی` language switch;
- applies deterministic `en/ltr` and `fa/rtl` document direction;
- translates controlled static text, status text, historical v11-v17 context panels and whitelisted dynamic runtime sentence frames;
- preserves arbitrary external-source content verbatim and adds no runtime Google/DeepL/AI translation dependency;
- keeps ASN, IP/prefix, BGP path, URL, timestamp and other technical values direction-safe/LTR where appropriate;
- added locale-key parity and runtime-translation tests, including technical-token preservation and external-content non-translation.

### Verification / release integrity

- stabilized the recurring legacy Headless Chrome fixture-readiness flake by increasing only virtual-time/process timeout budgets without weakening fixture assertions;
- completion PR #31 CI `34523935503` passed after its deterministic test caught and corrected one untranslated Farsi topology-template value;
- final v1.8 feature `main` CI `34524065320` passed **301/301 tests**, production build, both real Headless Chrome presentation gates, committed-secret/private-key scan and production runtime smoke testing;
- v1.8 changes presentation/i18n behavior only, so no new live-source acceptance or upstream workflow is introduced;
- no new censorship sensor, independent vote or deployment authorization is added; `deploymentAuthorized:false` remains unchanged.

## 1.7.0 — 2026-09-10

### Operational ASN coverage

- added operator-triggered persistence of the existing RIPE/RIR Iran ASN inventory and ipverse enrichment to the bounded local `var/asn-coverage/latest.json` snapshot;
- added fail-closed snapshot validation for schema, IR scope, timestamps, internal counts, SHA-256 provenance, candidate bounds/uniqueness and zero-vote semantics;
- added explicit `observed`, `stale`, `no_data` and `error` states so absence or invalid data cannot become zero Iran ASNs;
- added `GET /api/asn-coverage`, which reads only the local snapshot and performs no dashboard-time RIPE/ipverse network request;
- added the `Coverage and review queue` dashboard panel with bounded analyst-priority rows and preserved context-only semantics;
- kept RIPE/RIR country scope authoritative and ipverse secondary, with no ASN inventory/topology field promoted to censorship evidence.

### Live runtime acceptance / RIPEstat compatibility

- completed a real 2026-09-10 operator acceptance from public upstreams through snapshot persistence, server parsing, `/api/asn-coverage` and browser rendering;
- observed 856 RIR-associated ASNs, 856 registered / 593 RIPE-RIS-routed country-level ASNs, 23/23 curated ASNs inside inventory, 856/856 ipverse metadata matches, zero secondary metadata misses, zero secondary country mismatches and a bounded 100-entry review queue;
- treated those counts as acceptance observations rather than release constants or per-ASN reachability claims;
- fixed live RIPEstat `country-resource-list` compatibility when a valid IR-scoped response omitted the documented `data.resource` echo;
- retained the hard-scoped `resource=IR` request, explicit non-IR rejection and mandatory `data.resources.asn` validation;
- added a deterministic regression test for the observed live response shape.

### CI / release integrity

- disabled redundant routine CI on feature-branch pushes while retaining PR-to-main, `main`, `v*` tag and manual CI triggers;
- kept the large ipverse world download out of routine GitHub Actions;
- v1.7 feature PR #24 CI `34465799214` and post-merge `main` CI `34465863148` passed;
- RIPEstat hotfix PR #26 CI `34469766079` and post-merge `main` CI `34469839475` passed;
- deterministic suite reached **287/287 tests**, with production build, real Headless Chrome presentation, secret/private-key scan and runtime smoke tests passing;
- v1.7.0 does **not** authorize an Iran Fleet Stage-1 pilot; `deploymentAuthorized:false` remains unchanged.

## 1.6.0 — 2026-09-10

### Publication scope

- v1.6.0 is the next published release after v1.4.0; v1.5.0 was repository-verified but was not tagged or published as a GitHub Release;
- the v1.6.0 publication therefore includes both the v1.5 ASN identity/inventory work and the v1.6 shutdown-context work.

### Current shutdown intelligence

- hardened Internet Society Pulse Iran scoping, timestamp validation, selected-window overlap and open-ended-event semantics;
- preserved Pulse verification level, type, cause, affected regions and provenance while keeping `token_required`, `no_data`, observed and error states distinct;
- documented Access Now #KeepItOn STOP as a separate historical curated corpus currently published through 2025;
- added conservative STOP/Pulse correlation requiring temporal overlap plus matching broad scope;
- every correlation remains an analyst candidate with `possibleSameIncident:true`, `automaticMerge:false` and `independentTechnicalVote:false`;
- exposed Pulse and correlation context in `/api/intelligence` and the dashboard without creating a second technical vote or duplicate upstream request.

### Context export / release integrity

- extended context CSV export with Pulse status/events and STOP/Pulse candidate correlations while preserving separate provenance;
- missing Pulse credentials export as `matched=not_inferred`, never zero incidents;
- added two deterministic export regression tests, raising the stable candidate from 275 to **277 tests**;
- added the v1.6 export and shutdown presentation modules to the early syntax gate;
- added canonical `release-notes/v1.6.0.md` and aligned release/version documentation;
- no new periodic workflow or live-source CI dependency was introduced.

### Verification / deployment boundary

- v1.6 backend post-merge `main` CI `34442988321` passed;
- v1.6 dashboard branch CI `34443294299`, PR CI `34443351394` and post-merge `main` CI `34443425466` passed;
- the final release branch must pass the 277-test deterministic suite, release-notes gate, production build, real Headless Chrome, committed-secret/private-key scan and runtime smoke test before publication;
- STOP, Pulse, their correlation, registry/inventory/topology metadata and other contextual sources add zero independent censorship votes;
- v1.6.0 does **not** authorize an Iran Fleet Stage-1 pilot; `deploymentAuthorized:false` remains unchanged.

## 1.5.0 — 2026-09-10

### Registry-qualified Iran ASN scope

- corrected stale/misleading curated ASN identities against current RIPE registry objects and removed AS35718 from Iran scope;
- separated canonical registry identity from operational/business aliases;
- introduced explicit `operatorFamily` grouping so related ASNs cannot be mistaken for independent operators or censorship evidence;
- distinguished TCI from TIC/Zirsakht and ITCO/DCI from TIC;
- expanded reviewed Iran access/backbone/cloud/topology coverage;
- added Fanap Telecom / ZiTEL AS206065 (`FDI`) and AS24631 (`FANAPTELECOM-FCP`) under one operator family.

### Registry drift / provider selection

- added direct RIPE Database REST `aut-num` validation for curated ASN, `as-name`, organization handle and authoritative `ASSIGNED`/`LEGACY` status;
- replaced positional provider comparison selection with an explicit reviewed profile set;
- validated 23/23 curated profiles across 18 operator families in the latest applicable live registry gate.

### Complete country inventory boundary

- documented `data/asns.json` as a curated monitoring/topology catalogue rather than a complete Iran ASN universe;
- added operator-triggered RIPEstat `country-resource-list` inventory based on RIR Statistics country association;
- added separate RIPEstat `country-asns` registered/routed country-level counts with RIS timestamps;
- preserves curated coverage/drift without inferring an undocumented ASN-by-ASN routed set.

### Secondary topology prioritization

- added on-demand CC0 `ipverse/as-metadata` JSON enrichment only after RIPE/RIR establishes Iran scope;
- preserves classification, network-role, prefix/connectivity, provider/customer/peer, degree, reach, `lastAnnounced` and change metadata with source-qualified semantics;
- byte-bounds the world dataset and SHA-256 anchors the exact downloaded bytes;
- surfaces ipverse/RIR country disagreement as a data-quality finding rather than silently changing country scope;
- builds a deterministic analyst review queue using transparent review classes instead of an invented censorship-likelihood score;
- keeps the large world-dataset download out of routine GitHub Actions.

### Verification / deployment boundary

- deterministic suite expanded to **264 tests**;
- feature head CI `34403372561` passed;
- feature PR #15 CI `34440814125` passed;
- v1.5 feature merge to `main` completed in `7821cf56233308f177755d1c92d838e307fac6d2`;
- post-feature-merge `main` CI `34440868635` passed;
- latest applicable full live-source acceptance `34399378248` passed, including direct RIPE registry validation, RIPE RIS Live and Route Views/CAIDA BGPStream broker checks;
- ASN registry/inventory/topology metadata adds zero independent censorship votes;
- v1.5 does **not** authorize an Iran Fleet Stage-1 pilot; repository policy remains `deploymentAuthorized:false`.

## 1.4.0 — 2026-09-09

### Circumvention transport depth

- preserved Iran Tor transport observations as lower/upper estimate bounds rather than exact users;
- added directional comparison only when before/during estimate intervals do not overlap; overlapping/touching intervals remain indeterminate;
- added global BridgeDB requested-transport demand as explicitly `GLOBAL · not Iran-specific` context;
- BridgeDB is excluded from Iran incident correlation and contributes no independent censorship vote.

### Incident context

- added bounded temporal correlation between Iran Tor transport observations and Access Now #KeepItOn STOP incident windows;
- correlation remains temporal context only and cannot create causality, blocking attribution, national availability status or an extra technical vote;
- missing paired observations remain `no_data` and partial upstream coverage remains `partial`.

### Ookla Open Data review

- added a reviewed contract for official quarterly fixed/mobile Ookla Open Data objects;
- no Iran aggregate is published without an approved country-boundary dataset and spatial join;
- bounding-box shortcuts, fabricated country aggregates and throttling/censorship attribution remain prohibited.

### Release integrity / verification

- added canonical `release-notes/vX.Y.Z.md` files and a stable-version release-notes CI gate;
- added a release-publication recovery workflow that fills an empty GitHub Release body from canonical notes without overwriting existing notes;
- deterministic suite expanded to **237 tests**;
- feature branch CI `34388597794` passed;
- feature PR #12 CI `34388825541` passed;
- v1.4 feature merge to `main` completed in `cf121adf1cdc976c58b591b53debf1d9e987bef3`;
- post-feature-merge `main` CI `34389188256` passed;
- live public-source acceptance `34388597366` passed;
- production build, release-notes gate, real headless Chrome, secret/private-key scan and runtime smoke tests passed.

### Deployment boundary

- Tor, BridgeDB, STOP and Ookla remain context-only and add zero independent censorship votes;
- v1.4 does **not** authorize an Iran Fleet Stage-1 pilot or active protocol/circumvention probing;
- province/SIM inference remains prohibited and VPN/NIN claims retain their controlled-target/manual-review gates;
- repository policy remains `deploymentAuthorized:false`.

## 1.3.0 — 2026-09-09

### Topology / route-origin integrity

- added CAIDA ASRank selected-ASN topology context for rank, customer cone, degree and inferred AS relationships;
- preserves ASRank provenance overlap with CAIDA Ark, Route Views and RIPE routing inputs so topology context cannot inflate routing-source independence;
- added RIPEstat RPKI validation for a bounded set of currently announced prefixes plus bounded monthly IPv4/IPv6 VRP history;
- preserves RPKI states `valid`, `invalid_asn`, `invalid_length` and `unknown` without converting them into censorship or hijack intent;
- keeps ASRank and RPKI as context-only evidence with `independentCensorshipVote:false`.

### Circumvention source review

- re-reviewed Psiphon and Ceno/eQualitie as valuable Iran circumvention/resilience context;
- did not create unsupported runtime telemetry adapters because no stable supported public machine-readable Iran time-series API was established;
- retained the rule that reports/articles remain dated contextual evidence rather than scraped or synthetic telemetry.

### Dashboard / verification

- added dedicated ASRank and RPKI dashboard panels separated from censorship assessment/source-family voting;
- expanded the real headless-Chrome gate to verify ASRank/RPKI rendering alongside M-Lab/APNIC/STOP;
- deterministic suite expanded to **211 tests**;
- feature PR #9 CI `34375070768` passed;
- v1.3 feature merge to `main` completed in `4f6615c309c1797f3cbcdaae2700d0d79159ca59`;
- post-feature-merge `main` CI `34382084051` passed **211/211** tests, production build, headless Chrome, secret/private-key scan and runtime smoke tests;
- live public-source acceptance `34374634682` passed, including CAIDA ASRank (`partial`), RIPEstat RPKI (`partial`), RIPE RIS Live and Route Views/CAIDA BGPStream.

### Deployment boundary

- v1.3 does **not** authorize an Iran Fleet Stage-1 pilot;
- `partial`, `no_data` and errors remain explicit and never become national/province availability verdicts;
- external systemd/egress, real controlled endpoint, key-management, rollback, voluntary operator-consent and explicit authorization gates remain mandatory;
- repository policy remains `deploymentAuthorized:false`.

## 1.2.0 — 2026-09-09

### Routing / source depth

- added a second passive routing path through CAIDA BGPStream tooling restricted to Route Views live resources;
- explicitly prevents RIPE data accessed through BGPStream from being double-counted as an independent source;
- added bounded Route Views collection and a real CAIDA broker acceptance gate;
- retained all BGP/Route Views/RIS events as control-plane context rather than censorship votes.

### Owned-probe fleet laboratory architecture

- added signed short-lived Ed25519 manifests containing only approved target IDs and bounded Class-A DNS/TCP/TLS/HTTPS test definitions;
- added local endpoint resolution so the scheduler cannot supply arbitrary hosts, URLs, ports or commands;
- added authenticated HMAC result envelopes, strict schemas and rejection of sensitive/device/subscriber/network identity fields;
- added bounded ingestion, replay, rate, concurrency and memory-only queue controls;
- added local kill/enable gates and time-bounded pseudonymous consent/withdrawal enforcement;
- added fixed Stage-1 HTTPS control/collection contracts with hostname verification and SPKI pinning;
- added collection-edge admission controls that exclude source IP/X-Forwarded-For from evidence/identity semantics;
- added systemd laboratory sandbox/default-deny specifications and negative egress validation tooling;
- added key provisioning/rotation/revocation requirements with no committed/CLI secrets;
- added fail-closed rollback with local withdrawal, central revocation, target retirement, known-safe version selection, no remote shell and no automatic re-enable;
- added per-probe publication isolation so multiple owned probes remain one source family and cannot produce national/province availability badges.

### Protocol / NIN / segmentation evidence policy

- defined a fail-closed VPN/circumvention protocol gate: website reachability is not WireGuard/OpenVPN/V2Ray/Outline transport evidence;
- actual transport evidence requires controlled endpoints, neutral controls, same-probe pairing, repeated observations, documented coverage, reviewed design and analyst review;
- even complete protocol evidence is analyst-review readiness, never an automatic blocked/available verdict;
- defined NIN-vs-global prerequisites using separately reviewed target classes, at least two independently hosted global controls and same-probe bounded-time pairing;
- kept NIN comparison non-operational because the current target policy does not authorize a NIN target class;
- formally deferred province publication and forbade source-IP/ASN/latency-derived province inference;
- marked white-SIM vs ordinary-SIM measurement NO-GO under the current privacy model.

### Additional source review

- reviewed APNIC HTTP/3/QUIC, DNS-over-IPv6 and DNS query-type/HTTPS-record data as contextual protocol/deployment candidates;
- did not add unsupported visualization scraping or pseudo-independent runtime sources where a stable supported machine-readable/provenance contract was not established.

### UI / verification

- added a real headless Chrome/Chromium presentation gate without Playwright/Puppeteer dependencies;
- the gate loads the actual context module through a loopback fixture and verifies M-Lab, APNIC and Access Now STOP rendering and separated source-family semantics;
- deterministic suite expanded to **203 tests**;
- readiness CI `34366466998` passed;
- PR #6 CI `34368934884` passed;
- v1.2 feature merge to `main` completed in `9dac687bc9bf83282ad3aa650255cafbb372160c`;
- post-feature-merge `main` CI `34369377194` passed;
- live public-source acceptance `34365369630` passed on the corresponding runtime/UI implementation.

### Deployment boundary

- v1.2 release code includes the Fleet Stage-1 laboratory architecture but does **not** authorize an Iran pilot;
- external systemd/egress, real endpoint, key-management, rollback and voluntary operator-consent gates remain mandatory plus explicit authorization;
- repository policy remains `deploymentAuthorized:false`.

## 1.1.0 — 2026-09-09

- shifted the product toward Iran-specific censorship intelligence with strict measurement/context separation;
- added Censored Planet, RIPEstat/RIPE RIS, Globalping, PeeringDB, IHR, Citizen Lab, Tor transport bounds, Cloudflare protocol context, M-Lab NDT, APNIC IPv6 and passive RIPE RIS Live;
- hardened RIPE Atlas through bounded per-probe daily `ping-stats` and excluded partial coverage from corroboration/divergence;
- added Access Now #KeepItOn STOP structured incidents with root-evidence lineage and no independent vote;
- exposed M-Lab/APNIC/STOP context in the dashboard with a separate context CSV export;
- retained explicit `no_data`/`partial`/error semantics and prohibited province/VPN fabrication;
- released from final production commit `9087809d6a87ae578dd590d185c35b4438319b2d` with tag/Release `v1.1.0`.

## 1.0.1 — 2026-09-08

- enabled Cloudflare Radar integration with a real server-side Radar Read token;
- added consistent Iran + selected-ASN scoping, range-aware aggregation, traffic-anomaly normalization and read-only Radar acceptance testing;
- kept credentials out of source/Git/build artifacts.

## 1.0.0 — 2026-09-08

- first standalone Node.js application with no third-party runtime dependencies;
- no simulated monitoring values;
- rebuilt the monitoring UI with explicit no-data/error states;
- hardened OONI/RIPE Atlas and added IODA, Tor, provider context and deterministic tests;
- eliminated third-party npm runtime dependencies.
