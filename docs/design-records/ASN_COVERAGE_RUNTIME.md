# Operational Iran ASN Coverage Snapshot

## Purpose

The project already has an operator-triggered full Iran ASN inventory and secondary ipverse enrichment. v1.7 adds a bounded local snapshot so that coverage and review-priority information can be inspected by the dashboard without making the dashboard itself download RIPE or ipverse inventory data.

The snapshot is **context only**. It does not add a censorship sensor, a censorship score, a national reachability verdict, or an ASN-by-ASN current-routing claim.

## Operator command

Run from the same source or production tree whose `server.mjs` is used:

```bash
node scripts/fetch-iran-asn-inventory.mjs --write
```

The command performs the existing three operator-triggered downloads:

1. RIPEstat Country Resource List for the RIR-associated `IR` ASN inventory;
2. RIPEstat Country ASNs `lod=0` for country-level registered/routed counts;
3. ipverse `as.json` for secondary enrichment of ASNs already selected by the RIPE/RIR inventory.

It then writes:

```text
var/asn-coverage/latest.json
```

`var/` is Git-ignored. The write is performed through a temporary file followed by rename so the server does not normally observe a partially written JSON file.

Without `--write`, the existing command behavior remains: the complete operator result is emitted to stdout.

## Snapshot boundary

The persisted dashboard snapshot intentionally contains only:

- schema version and generation time;
- IR country scope;
- RIR-associated inventory count and source provenance;
- RIPE country-level registered/routed counts and timestamps;
- curated-catalogue coverage counts;
- ipverse source/license/fetch time/SHA-256 provenance and coverage count;
- enrichment coverage/quality counts and review-class counts;
- at most 100 already-prioritized uncurated review candidates with bounded topology fields.

It does **not** contain the complete ipverse world dataset or the full 800+ ASN enrichment record set.

## Runtime API

`GET /api/asn-coverage` reads only the fixed local file. It performs no upstream network request.

States:

- `observed` — valid snapshot within the configured freshness window;
- `stale` — structurally valid snapshot older than the freshness window;
- `no_data` — no local snapshot exists;
- `error` — the local snapshot exists but is invalid/unreadable or its configured validation parameters are invalid.

Default freshness is 168 hours. Operators may set `ASN_COVERAGE_MAX_AGE_HOURS`; invalid values fail closed when a snapshot is evaluated.

A missing snapshot is **not** represented as zero Iran ASNs. An invalid snapshot is not partially accepted.

## Validation invariants

The parser validates, among other fields:

- `schemaVersion` is supported;
- country is exactly `IR`;
- `independentCensorshipVote` is false at snapshot and candidate level;
- evidence role remains `scope-topology-prioritization`;
- generated/fetch/query timestamps are valid;
- future-generated snapshots beyond a small clock-skew allowance are rejected;
- inventory/curated/secondary coverage counts are internally consistent;
- RIPE `registeredMinusRouted` equals the reported count difference;
- SHA-256 provenance is a 64-character hexadecimal digest;
- candidate queue contains no duplicate ASNs and never exceeds 100 rows;
- candidate review classes are from the explicit reviewed class set;
- topology counts are non-negative integers.

## Dashboard semantics

The dashboard shows a maximum of 20 review candidates from the already bounded snapshot queue. The panel explicitly labels priority as analyst review only.

RIR association, RIPE RIS routed counts, ipverse `lastAnnounced`, prefix counts, reach, customers and degree remain separate metadata. None is renamed or promoted to “currently reachable”, “blocked”, “censored”, or “important”.

## Actions budget

Routine GitHub Actions do not download the ipverse world dataset and do not refresh the country inventory. Deterministic snapshot/parser tests run on fixtures only. The existing production smoke test verifies that a clean checkout returns explicit `no_data` from `/api/asn-coverage`.

This keeps the expensive external-data operation operator-triggered while still testing the real API wiring and dashboard presentation in ordinary CI.
