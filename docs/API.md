# Public data and interfaces

Everything the dashboard publishes can be used by news sites, researchers and mirrors under
**CC BY-NC-SA 4.0** (see [DATA_LICENSE.md](../DATA_LICENSE.md)). Credit "Iran Censorship Monitor"
and name OONI and the other sources the data rests on. All findings come from measurements taken
inside networks registered in Iran; nothing published identifies who ran a test.

Replace `https://example.org` with the dashboard's address.

## Open daily data (JSON)

| Address | Content |
|---|---|
| `/data/latest.json` | Today's findings for all of Iran, updated at most every six hours |
| `/data/YYYY-MM-DD.json` | The findings as published on that day |
| `/data/index.json` | Links to the latest file and every stored day, newest first |

Readable from any website (`Access-Control-Allow-Origin: *`). Schema `iran-censorship-monitor/daily/1`:

- `date`, `period` (`since`, `until`: the seven days the findings cover), `scope`, `generatedAt`;
- `headline`: the state (for example `services-blocked`) and the services it names;
- `services`: the six main services with `status`, website tests (`tests`, `confirmed`,
  `anomalous`, `ok`), app test and app servers where measured, and `blockedSince`
  (`month`, `fromStart` when blocked since the start of the record in January 2022);
- `changes`: services whose status changed against the seven days before (absent when no comparison
  was possible, for example during a nationwide shutdown);
- `moreServices`: further services by group (social, news, circumvention, ai, everyday), only
  those with tests;
- `waysAroundTheFilter`: OONI's tests of Tor, Snowflake, Psiphon, Riseup VPN, STUN and encrypted
  DNS, with usable tests, worked and failed;
- `usage`: Cloudflare WARP share, Psiphon Conduit connections and Tor users from Iran; usage, never
  proof that a service is reachable;
- `networks`: how many Iranian networks tested the main services, and how many had full, partial or
  no access;
- `dashboard`, `licence`.

Status values: `blocked`, `partial` (reachable in most tests, blocked in some), `restricted`
(problems without a confirmed block: a block or a deliberate slowdown), `reachable`, `unclear`,
`untested`, `unavailable` (the source did not answer). A timeout is never counted as a block.

```bash
curl https://example.org/data/latest.json
```

## Feeds, reports and embedding

| Address | Content |
|---|---|
| `/feed.xml`, `/feed.xml?lang=fa` | Daily "what changed" entries (Atom) in English or Farsi |
| `/updates` | The same entries as a readable page |
| `/reports` | Index of weekly (Saturday to Friday) and monthly reports |
| `/report?week=YYYY-MM-DD` | Weekly report; the date is the week's Saturday |
| `/report?month=YYYY-MM` | Monthly report; add `&lang=fa` for Farsi |
| `/widget.svg`, `/widget.svg?lang=fa` | Status image of the six main services for embedding |
| `/tools`, `/tools?lang=fa` | Ways around the filter measured from inside Iran: devices, current results, official downloads |
| `/sources`, `/sources?lang=fa` | Every source: where it measures from, what it is used for, how it answered for the default view |

## Dashboard API

The API the page itself uses. It is not versioned; field names can change between releases.

| Address | Content |
|---|---|
| `/api/overview` | The full answer for one network or all of Iran and one period |
| `/api/ooni/domains` | OONI website results per address |
| `/api/outages` | Nationwide and network outages dated by Cloudflare Radar since 2022 |
| `/api/history` | Monthly "blocked since" history of the main services |
| `/api/config` | Networks, sources and the default period |
| `/api/health` | The server's state for operators: `status` (`ok` or `degraded`), uptime, version, each collector path (switched on, last run, last success, newest measurement, last error), cache sizes and `issues`, e.g. a path that stopped delivering or OONI limiting requests; `ok` stays `true` while the server runs |

Parameters of `/api/overview` and `/api/ooni/domains`:

- `asn`: a network (`AS58224`) or `ALL` for all of Iran; default `AS58224`;
- `since`, `until`: `YYYY-MM-DD`, at most 120 days; default the last seven days;
- `testName`: an OONI test, default `web_connectivity`;
- `target`: optional absolute URL of one website.

A new, not yet cached answer for `/api/overview` asks about thirty sources and can take tens of
seconds. Each address may start a limited number of new answers per ten minutes
(`OVERVIEW_NEW_PER_10_MIN`, default 40); answers already computed are served without limit.
Lookups that can be made unique (single measurements, domain drill-downs, target searches,
providers, routing updates, intelligence) are limited per address too (`LOOKUPS_PER_10_MIN`,
default 120). Beyond a limit the answer is `429` with `retryAfterSeconds` and a `Retry-After`
header. For regular use prefer `/data/latest.json`.
