# Going online — checklist

Everything that still has to be done when the dashboard moves from the test machine to the real
server. Collected during development so nothing is forgotten; tick the boxes on the day.
Technical details of the service itself (reverse proxy, systemd hardening): see
[PRODUCTION.md](PRODUCTION.md).

## 0. Release number

- [ ] **Version 1.9.0** — the footer shows the released version, deliberately still `v1.8.0`
      while v1.9 is unreleased. At release, set `1.9.0` in `package.json` (and `package-lock.json`)
      and in `public/app.js` (`footerVersion`) and `public/index.html` (`#footer-version`).

## 1. Settings in `.env` on the server

The `.env` file stays on the server only; it is never committed and keys are never pasted into
chats or issues. `.env.example` explains every value.

- [ ] **`PUBLIC_URL=https://…`** — the public address. Without it, shared links contain the
      address the page was opened with (on the test machine `127.0.0.1`, useless to anyone else),
      link previews on Telegram/WhatsApp/X have no image, and HSTS stays off. Feed, monthly reports
      and the embeddable widget also use it.
- [ ] **`CLOUDFLARE_RADAR_API_TOKEN`** — traffic, outage dates, the outage chart and the
      hour-by-hour shutdown timeline. Without it these parts stay empty ("needs an operator token").
- [ ] **`INTERNET_SOCIETY_PULSE_API_TOKEN`** — optional, shutdown records as context.
- [ ] **`MONITOR_COLLECTOR=1`** — collects Iran's OONI measurements hourly into the local store,
      so the page keeps answering while OONI limits requests (without it, a new view during a
      limit shows "not available"). About 18 MB of disk per day, kept 60 days (`STORE_RETENTION_DAYS`,
      about 1 GB). Leave `OONI_S3_ENABLED` off (400 MB of raw files a day).
- [ ] **`RIPE_ATLAS_API_KEY`** and `ACTIVE_MEASUREMENTS_ENABLED=true` — the independent check of the
      six main services from RIPE Atlas probes in Iran. Needs enough RIPE Atlas credits (see 4).
- [ ] `GLOBALPING_API_TOKEN` — optional second independent check.
- [ ] `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_EN`, `TELEGRAM_CHANNEL_FA` — optional daily posts
      (README, "Daily Telegram posts").
- [ ] `HOST=127.0.0.1` behind the reverse proxy; `MONITOR_PREWARM` left on (default) so the first
      visitors do not wait for OONI.

## 1b. Reverse proxy

- [ ] Serve the page over **HTTPS with HTTP/2** (Caddy does both by default; nginx needs `http2`).
      The page preloads its 26 small script files at once; over HTTP/1.1 a browser opens only six
      connections, over HTTP/2 all of them arrive in one round, which matters on slow mobile links
      in Iran (measured: about a second less at 300 ms latency).
- [ ] Let the proxy pass `content-encoding` through: the server already compresses with Brotli/gzip.
- [ ] Set `TRUST_PROXY=1` behind the proxy, so the per-visitor limit on new views counts visitors,
      not the proxy (otherwise all readers share one limit).

## 2. Data that must survive restarts and be backed up

Everything lives in `var/` (not in git). Copy it along when moving and back it up regularly:

- `var/reports/` — finished monthly reports; written once and never recomputed.
- `var/anatomy/` — hour-by-hour timelines of finished shutdowns; never fetched again.
- `var/history/` — monthly "blocked since" history per service.
- `var/feed/` — the daily "What changed" entries (feed, `/updates`, Telegram).
- `var/store/` — collected measurements (SQLite).
- `var/iran-asns.json` — the list of Iran-registered networks (fallback when RIPEstat is down).
- `var/last-good/`, `var/asn-coverage/`, `var/asn-directory/` — fallbacks and caches.

## 3. The dashboard must be reachable from Iran

The Farsi version is for people in Iran; a dashboard they cannot open misses its purpose.

- [ ] Do not host it only behind a provider Iran blocks.
- [ ] Offer at least one mirror and an .onion address for Tor users.
- [ ] After going online, test the own address from inside Iran (OONI Run link with the dashboard
      URL, or an entry on Citizen Lab's Iran test list) and look at the results.

## 4. Open items with outside parties

- [ ] **Citizen Lab test list, pull request #2277**
      (https://github.com/citizenlab/test-lists/pull/2277): fix the typo
      `https://api.x.com/robots.txt.txt` → `https://api.x.com/robots.txt`. Once merged, OONI Probe
      tests the app servers and iranopasmigirim.com; the dashboard picks the results up by itself.
- [ ] **Test-list entries and data requests for VPN tools**: see [OUTREACH_VPN_DATA.md](OUTREACH_VPN_DATA.md)
      (eight URLs to submit on test-lists.ooni.org; a ready letter to Psiphon, Lantern, Hiddify, ASL19, Windscribe).
- [ ] **RIPE Atlas credits** for regular independent checks (request drafted during development).
- [ ] **Telegram channels** (English and Farsi) and the bot as administrator, if daily posts are wanted.

## 5. Checks on the day

- [ ] Open the page on a real phone (narrower than 500 px); the test browser could not go that narrow.
- [ ] Share a finding to Telegram and WhatsApp: the link shows the public address and a preview image.
- [ ] Open `/feed.xml`, `/updates`, `/reports` and one monthly report in both languages.
- [ ] Install the page as an app on a phone (manifest and icons).
- [ ] The source register says how many sources answered; a red "not answering" means a missing
      token or a blocked outgoing connection on the server.

## Test machine (development only)

Screenshots and browser gates run with a headless browser, so no windows open on the
desktop: `CHROME_BIN=$HOME/.local/bin/chrome-headless npm run verify:ui` (see README, "Validate").
