# Iran Censorship Monitor

A dashboard in English and Farsi that answers, in plain language, what people in Iran can reach on
the internet right now: whether the internet works, which services are blocked on which network,
which ways around the filter get through, and what changed since the period before. Every finding
is dated and names its source.

> **فارسی:** داشبوردی به فارسی و انگلیسی که به زبان ساده نشان می‌دهد مردم ایران اکنون به چه
> چیزی در اینترنت دسترسی دارند: آیا اینترنت کار می‌کند، کدام سرویس‌ها در کدام شبکه مسدودند، کدام
> راه‌های دورزدن فیلتر کار می‌کنند و نسبت به بازهٔ پیشین چه تغییر کرده است. هر یافته تاریخ و منبع
> دارد.

## What the dashboard shows

- **Overview** (for everyone): the current situation, what changed, who has access on which
  network, privileged access and who decides what is blocked (dated primary sources only), ways
  around the filter, the six main services, further services (social media, Persian-language news,
  VPN tools, AI services, everyday services), what this means for you, what we do not know, the
  connection itself, and the sources.
- **Technical analysis**: the measurements behind every statement, per address and per network,
  with routing, traffic and quality charts.
- **Reports**: daily updates (`/updates`, also as RSS at `/feed.xml` and optionally on Telegram),
  weekly reports (Saturday to Friday) and monthly reports (`/reports`), printable as PDF; an
  embeddable status image (`/widget.svg`); CSV, PDF and Word exports.
- **Tools page** (`/tools`): the ways around the filter that are measured from inside Iran, with
  devices, current test results and the official download pages and email/Telegram channels.
- **Sources page** (`/sources`): where every source measures from, what it is used for and how it
  answered for the current default view.
- **Open data**: `/data/latest.json`, the day's findings for all of Iran as small JSON, with an
  archive per day; interfaces and fields in [docs/API.md](docs/API.md).

## How findings are made

**Only measurements taken inside Iranian networks count.** A test run from abroad cannot tell what
people in Iran can reach.

| Source | Where it measures | Used for |
|---|---|---|
| OONI | volunteers' phones and computers in Iranian networks | website and app blocking (main source) |
| RIPE Atlas, Globalping | probes in Iranian networks (active checks off by default) | independent DNS/TLS checks |
| Cloudflare Radar | traffic from Iranian networks | outages, traffic, connection quality |
| Tor Metrics, Psiphon statistics, APNIC Labs | users in Iran | use of ways around the filter |
| IODA, RIPEstat / RIPE RIS, M-Lab | from outside or from routing | context: is Iran connected, are routes announced |
| Censored Planet | from outside into Iran | context only, never evidence of access |
| Pulse, Access Now STOP, official documents | curated reports | dated context, never a measurement |

- Measurements OONI files under Iran but that come from foreign VPN or hosting networks are left
  out: a network counts only if it is registered in Iran (RIPEstat country resource list).
- Nothing is invented. Missing, partial, stale or rate-limited data is shown as such, with the date
  of the last good answer; where one network has no tests, the page says so and shows the
  Iran-wide answer, labelled.
- Severity, confidence and coverage are judged per claim; routing visibility is never taken as proof
  that people can reach services.

## Protecting people in Iran

- Networks registered to private persons are shown by their number only.
- The dashboard never tries to identify who ran a test.
- Probes in Iran belong to private hosts. They check only services whose **use** is not
  punishable (the six mass services and AI services), never news, opposition or circumvention
  sites; those stay with OONI, whose volunteers consented. Only DNS lookups and TLS/HTTPS
  handshakes (HEAD requests), never page content. See [DATA_RESILIENCE_PLAN.md](docs/DATA_RESILIENCE_PLAN.md).

## Run it yourself

Requirements: Node.js 22.13 or newer (the local store uses `node:sqlite`), outbound HTTPS. No third-party npm runtime dependencies,
no database server, no heavy downloads in default operation.

```bash
cp .env.example .env    # every setting is explained there; all keys are optional
npm start               # http://127.0.0.1:4173
```

Optional keys: a Cloudflare Radar read token (traffic and outages) and an Internet Society Pulse
token. The collector, RIPE Atlas / Globalping checks and Telegram posts are off until switched on
in `.env`.

**Going online:** work through [GO_LIVE.md](GO_LIVE.md): the public address (`PUBLIC_URL`), a
server that is not your home connection, `TRUST_PROXY`, backups of `var/`, and privacy before
pushing.

### Daily Telegram posts (optional)

1. In Telegram, open **@BotFather**, send `/newbot` and copy the token.
2. Create a channel per language and add the bot as an administrator that may post.
3. In `.env` set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_EN=@…` and/or `TELEGRAM_CHANNEL_FA=@…`,
   then restart. Nothing is posted without these settings or without `PUBLIC_URL`.

## Validate

```bash
npm ci
npm run check                 # syntax checks and all deterministic tests
npm run verify:release-notes
npm run build
npm run verify:public
npm run verify:ui             # needs a headless Chromium, see below
```

Without a local Chromium: `npx @puppeteer/browsers install
chrome-headless-shell@stable --path ~/.cache/chrome-headless`, then `CHROME_BIN=<printed path> npm
run verify:ui`. It opens no windows. Readable Farsi screenshots need a Persian font such as
Vazirmatn.

## How to help

- **Add sites to the test list:** OONI tests in Iran what is on Citizen Lab's Iran list. Sites the
  dashboard shows as "not tested" (for example several AI tools) can be proposed at
  <https://test-lists.ooni.org/>; see [OUTREACH_VPN_DATA.md](docs/OUTREACH_VPN_DATA.md).
- **Host a RIPE Atlas probe** outside Iran to earn measurement credits for the project.
- Issues and pull requests: see [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## Status and documentation

Current release: **1.9.0** (27 September 2026), the plain-language redesign. History: [CHANGELOG.md](CHANGELOG.md). Current state and decisions:
[CURRENT_STATE.md](CURRENT_STATE.md). Method: [INTERPRETATION.md](docs/INTERPRETATION.md),
[DATA_SOURCES.md](docs/DATA_SOURCES.md), [ARCHITECTURE.md](docs/ARCHITECTURE.md),
[VERIFICATION.md](docs/VERIFICATION.md), [PRODUCTION.md](docs/PRODUCTION.md). Dated design and review
records (network inventory, circumvention, measurement fleet, shutdown context, audits) are in
[docs/design-records/](docs/design-records/README.md).

## Support the project

The dashboard runs on donations. Support from outside Iran is possible through
[GitHub Sponsors](https://github.com/sponsors/RoyalLionSun), monthly or once, and privately if you
prefer; it pays for the server, the domain, measurement services and further development. Please do
not try to pay from inside Iran.

## Licence

Code: MIT ([LICENSE](LICENSE)). Published results (dashboard findings, feed, widget, reports,
exports): CC BY-NC-SA 4.0, following OONI's data licence ([DATA_LICENSE.md](DATA_LICENSE.md)). Logo
and preview image are not licensed for reuse.
