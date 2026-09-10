# Current State — v1.7.0 release line

Date: **2026-09-10**  
Current release line: **`v1.7.0`**  
Production branch: **`main`**  
Previous published release: **`v1.6.0`** at `8da70a85aa61fc064292330b4eaca83238abf3a3`

## v1.7.0 release state

- Issue #23 is completed and feature PR #24 is merged.
- RIPEstat live-schema hotfix Issue #25 is completed and PR #26 is merged.
- Current pre-release `main` before release metadata: `2a5b48854296d33bded64cf9ba023d33adb94c49`.
- v1.7 feature PR CI `34465799214` — success.
- v1.7 post-feature `main` CI `34465863148` — success.
- hotfix PR CI `34469766079` — success.
- hotfix post-merge `main` CI `34469839475` — success.
- Current deterministic suite: **287/287 tests passed**.
- Repository policy remains `deploymentAuthorized:false`.

## v1.7.0 — operational ASN coverage

The existing operator-only Iran ASN inventory/enrichment is now available as a bounded local coverage snapshot that can be inspected through the API and dashboard without downloading the large ipverse world dataset during normal runtime or routine CI.

Implemented contract:

- `node scripts/fetch-iran-asn-inventory.mjs --write` persists `var/asn-coverage/latest.json`;
- snapshot contains bounded coverage/provenance fields plus at most 100 uncurated review candidates, not the complete world dataset or full enrichment record set;
- local snapshot parser fails closed on schema/country/count/provenance/vote inconsistencies;
- freshness remains explicit: `observed`, `stale`, `no_data`, and `error` are distinct states;
- `/api/asn-coverage` reads only the fixed local snapshot and performs no RIPE/ipverse network request;
- dashboard displays RIR-associated inventory count, curated coverage, RIPE registered/routed country-level counts, ipverse metadata coverage, snapshot age and a bounded review queue;
- review classes remain analyst-prioritization hints, never censorship scores;
- clean CI expects `/api/asn-coverage` to return `no_data`, proving that absence is not converted to zero Iran ASNs;
- the large ipverse download remains operator-triggered only;
- routine feature-branch push CI is disabled; PR, `main`, tag and manual CI remain available.

## Live runtime acceptance — 2026-09-10

The release path was exercised on a real Node.js runtime using the current repository code and public upstreams.

Observed snapshot:

- country: `IR`;
- RIR-associated inventory: **856 ASNs**;
- RIPE country-level registered/routed counts: **856 / 593**;
- registered minus routed: **263**;
- curated catalogue: **23/23 inside inventory**, 23/856 = **2.69%**;
- ipverse metadata matches: **856/856**;
- secondary metadata missing: **0**;
- secondary country mismatch: **0**;
- persisted review queue: **100** candidates, matching the configured bound;
- snapshot state through `/api/asn-coverage`: **`observed`**;
- root and candidate semantics retain `independentCensorshipVote:false`.

The acceptance values above are runtime observations, not hard-coded release constants. RIPE `routedCount` remains a country-level RIPE RIS control-plane count and is not an ASN-by-ASN reachability classification.

## RIPEstat live-schema compatibility

During live acceptance, RIPEstat `country-resource-list` returned `data.query_time` and `data.resources` without the documented `data.resource` echo. The request itself remained explicitly scoped with `resource=IR`.

The hotfix therefore:

- accepts an omitted `data.resource` echo;
- continues to reject every explicit non-IR `data.resource`;
- continues to require `data.resources.asn`;
- adds deterministic regression coverage for the observed live response shape;
- does not add a new upstream, vote, workflow or measurement interpretation.

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

v1.7.0 does not authorize an Iran pilot. Real isolated Linux/systemd sandbox and negative-egress validation, project-controlled endpoints/collection edge, out-of-band key lifecycle testing, rollback testing, voluntary operator consent/withdrawal and explicit deployment authorization remain external mandatory gates.
