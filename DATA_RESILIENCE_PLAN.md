# Data resilience plan — no single point of failure for access evidence

Status: **all seven steps built; default operation stays live and lightweight.**

**Owner decision, 24 September 2026:** the project is public on GitHub and hosted by others, so
no host may be made to download OONI's raw files (about 400 MB per day for Iran) or keep an
archive. The raw-file path and the backfill are therefore **opt-in only** (`OONI_S3_ENABLED=1`,
`scripts/backfill-ooni-s3.mjs`) and never part of default operation; the 8-day test backfill was
deleted. Default: live OONI API with caches and the dated last-good state; the collector and the
independent RIPE Atlas / Globalping paths stay off until switched on. Accounts and credits (RIPE Atlas, Globalping) are settled
at the end; everything is built so that it runs without them and switches on when they exist.

## Problem

Every statement about blocked services (service tiles, "Who has access", more services, app
tests, "What changed") rests on the live OONI API. The API meters query time per address; on
24 September 2026 the quota was spent and every panel showed no data. The last-good store
added since then only bridges a gap with old answers — it is not a second source.

## Principles

1. **All paths run in parallel**, not one after another. Each path writes into the same local
   store; when one fails, the others keep the store current. Nothing waits for a failure to
   start a backup.
2. **The dashboard reads only the local store**, never the upstream APIs directly for access
   evidence. A page view costs no upstream quota.
3. **Same data, different routes, are merged without double counting** (OONI API and OONI raw
   files carry the same measurements; they are deduplicated by measurement id).
4. **Independent sources stay separate families.** RIPE Atlas or Globalping results are never
   added to OONI counts; they corroborate or stand in, and the page says which source answers.
5. **Inside-out only** (standing rule): only measurements taken from networks registered in
   Iran count for access claims.
6. **Every answer is dated.** The page states the newest data time per source and which
   sources answered.

## Architecture

```
            ┌─ OONI API (hourly, small windows) ─┐
 collector ─┼─ OONI raw files (S3, no quota) ────┼─→ local store (SQLite, var/) ─→ server ─→ page
 (hourly)   ├─ RIPE Atlas DNS/TLS from Iran ─────┤        │
            └─ Globalping DNS/HTTP from Iran ────┘        └─ source health: newest time per path
```

### Local store (`var/store/monitor.db`, Node's built-in SQLite)

- `ooni_measurement` — one row per OONI measurement: uid, day, hour, probe ASN, test name,
  input host, outcome (ok / anomaly / confirmed / failure), blocking type, route (api / s3).
  Deduplicated by uid. Only fields the dashboard needs; no raw bodies.
- `active_measurement` — one row per RIPE Atlas / Globalping result: source, probe id, ASN,
  host, kind (dns / tls / http), outcome, detail (e.g. DNS answer 10.10.34.x), time.
- `collector_run` — per path and run: started, finished, rows, error. Feeds source health.
- Aggregates the page needs (domain × network × day, test × network × day) are computed from
  the store in SQL; the existing interpretation receives the same payload shapes it gets today,
  so the evidence rules stay unchanged.
- Retention: measurements for 400 days (the longest comparison + a year of history).

### Collector (`scripts/collect.mjs`, started by the server every hour; can also run alone)

Runs all paths in parallel, each with its own timeout and error record:

| Path | What | How often | Quota risk |
|---|---|---|---|
| OONI API | Iranian measurements of the last 3 hours via the list endpoint (paged, indexed, cheap); one request per page | hourly | low; pauses 15 min on "quota exceeded" |
| OONI raw files (S3) | the same measurements from OONI's public bucket, for Iran only, streamed and reduced to the fields above | hourly for the last hours, once for history | none (public files); bandwidth to be measured first |
| RIPE Atlas | DNS lookups and TLS handshakes to the priority hosts from probes in Iranian networks | every 6 h | uses Atlas credits; off without an API key |
| Globalping | DNS and HTTP from Iranian probes when any exist | every 6 h | free tier limits; off unless enabled |

A path that fails leaves the others untouched; the next run retries it.

### How the page answers when paths fail

| Situation | Answer |
|---|---|
| All paths fine | OONI (API and S3 merged) as today, Atlas/Globalping as corroboration |
| OONI API blocked | S3 keeps OONI data current; page unchanged, health shows "via raw files" |
| OONI API and S3 both down | Last store contents, dated; Atlas/Globalping answer DNS/TLS questions for their networks, labelled as a different, narrower method |
| Everything down | Last store contents with their date; never "no data" while stored data exist |

### Independent measurements (RIPE Atlas, Globalping)

- Measure what OONI measures at the network level: does the DNS answer point to Iran's known
  block addresses (10.10.34.x) or a wrong address; does a TLS handshake to the service complete.
- **Ethics decision (owner, 24 September 2026):** probes belong to private hosts in Iran who
  never agreed to test blocked sites. Active checks therefore target **only the six mass
  services** millions in Iran contact daily (Instagram, WhatsApp, Telegram, YouTube, X,
  Facebook). News outlets and circumvention tools are **not** measured from these probes; OONI,
  whose volunteers consented, covers them. Only DNS and TLS/HTTPS HEAD, never page content,
  every 6 hours at most. `ACTIVE_MEASUREMENTS_ENABLED=true` records the decision on a host; the
  target list is fixed in `lib/active-collector.mjs` and the round script refuses other hosts.
- Without an API key or with the gate off, the paths report "not configured" and the page
  says so; nothing else changes.

## Steps

1. Store and schema, with tests (no network). **Done** — `lib/store.mjs`, `tests/store.test.mjs`.
2. OONI API collector path (list endpoint, paging, dedup), tests with recorded responses. **Done** — `lib/collector.mjs`; switched on with `MONITOR_COLLECTOR=1`, first live run pending until OONI lifts the block.
3. Store-backed payloads for the existing interpretation. **Done** — `lib/store-payloads.mjs`; the
   server reads the store for a period the collector covers completely and asks OONI otherwise;
   parity with the live aggregation is tested. A live side-by-side comparison follows the first run.
4. OONI S3 path. **Done** — `lib/ooni-raw.mjs`. Checked on 24 September 2026 with the owner's
   agreement: `raw/YYYYMMDD/HH/IR/<test>/*.jsonl.gz` in the public bucket `ooni-data-eu-fra`,
   about 400 MB compressed per day for Iran (99% Web Connectivity, ~17 MB per hour), one hour
   reads in about 5 s with ~120 MB of memory.
   **The raw files carry no verdicts and no measurement id** — OONI computes anomaly/confirmed/
   failure afterwards. This path therefore derives the verdict itself: Web Connectivity from the
   probe's `blocking` field, "confirmed" from Iran's block-page fingerprints (DNS answer
   10.10.34.34-36, or a body framing http://10.10.34.34); app tests from their status fields
   (`registration_server_status`, `telegram_*_blocking`, `signal_backend_status`,
   `facebook_*_blocking`, Psiphon tunnel failure, Tor directory authorities unreachable).
   Measurements are matched across routes by report id + input + start time; **when the API
   delivers the same measurement, OONI's own verdict replaces the derived one**, never the other
   way round. Open: a side-by-side comparison of derived and OONI verdicts once the API answers.
5. Source health per path in the header badge. **Done** — the overview carries `dataPaths`
   (which route answered, and per path: switched on or what is missing, last run, last error,
   newest measurement); the header badge's tooltip lists it in EN and FA.
6. RIPE Atlas and Globalping paths behind the ethics gate and keys. **Done** —
   `lib/active-collector.mjs`: `collectorPlan()` names what each path still needs; Atlas picks
   connected probes on Iranian-registered networks only (spread over networks) and runs one-off
   DNS (probe resolver) and TLS (with SNI) measurements; Globalping runs DNS and HTTPS HEAD from
   Iran and drops probes on foreign networks. Results: `blocked` only for the block address
   (10.10.34.x) or another private answer, `failure` for errors and resets, `ok` otherwise.
   Pending measurement ids are kept in the store, so a restart loses nothing; a new round every
   6 hours.
6b. Independent results on the page. **Done** — per service, a separate tile line
   "Independent check (RIPE Atlas): N devices in M networks; DNS points to Iran's block address
   (AS…)". It never changes OONI's counts or an OONI verdict. Only where OONI has no answer for a
   service (untested, unclear, unavailable) does the tile take the independent status, dashed and
   labelled "(independent check)", and the headline can then read "… is blocked, according to an
   independent check". A failed TLS/HTTPS connection alone shows as "connection fails", not
   "blocked".
7. History backfill from S3. **Done** — `node scripts/backfill-ooni-s3.mjs --days N` reads newest
   hour first and extends the covered period back only without a gap; it can be stopped and run
   again. Opt-in only: 120 days would be about 47 GB of downloads.

Operation: `MONITOR_COLLECTOR=1` runs every enabled path hourly; `MONITOR_COLLECTOR_PAUSE=ooni-api`
pauses single paths while the others continue. The raw-file path additionally needs
`OONI_S3_ENABLED=1` and is not recommended for ordinary hosts.

## Open for the owner

- RIPE Atlas account and credits (or hosting a probe to earn them).
- Globalping token (optional, raises limits).
- The ethics decision for active measurements from probes in Iran.
- Server operation: the collector runs inside the server process by default; a separate
  timer (systemd) is possible for production.
