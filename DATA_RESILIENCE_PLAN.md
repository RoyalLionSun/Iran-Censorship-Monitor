# Data resilience plan — no single point of failure for access evidence

Status: **plan, not implemented**. Accounts and credits (RIPE Atlas, Globalping) are settled
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
- Priority hosts: the six main services plus the news and circumvention groups.
- **Ethics gate (required before switching on):** probes belong to private hosts in Iran.
  Measurements run only when `ACTIVE_MEASUREMENTS_ENABLED=true` is set deliberately, only DNS and
  TLS (no page content), only towards public services, and the decision is recorded here.
- Without an API key or with the gate off, the paths report "not configured" and the page
  says so; nothing else changes.

## Steps

1. Store and schema, with tests (no network). **Done** — `lib/store.mjs`, `tests/store.test.mjs`.
2. OONI API collector path (list endpoint, paging, dedup), tests with recorded responses. **Done** — `lib/collector.mjs`; switched on with `MONITOR_COLLECTOR=1`, first live run pending until OONI lifts the block.
3. Store-backed payloads for the existing interpretation. **Done** — `lib/store-payloads.mjs`; the
   server reads the store for a period the collector covers completely and asks OONI otherwise;
   parity with the live aggregation is tested. A live side-by-side comparison follows the first run.
4. OONI S3 path: verify bucket layout and daily volume for Iran once the owner agrees to the
   first download; stream-parse, reduce, dedup.
5. Source health per path in the header badge and technical analysis.
6. RIPE Atlas and Globalping paths behind the ethics gate and keys.
7. History backfill from S3 for the last 120 days.

## Open for the owner

- RIPE Atlas account and credits (or hosting a probe to earn them).
- Globalping token (optional, raises limits).
- The ethics decision for active measurements from probes in Iran.
- Server operation: the collector runs inside the server process by default; a separate
  timer (systemd) is possible for production.
