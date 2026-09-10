# Current State — v1.7 development

Date: **2026-09-10**  
Published release: **`v1.6.0`**  
Production branch: **`main`**  
Published release commit: **`8da70a85aa61fc064292330b4eaca83238abf3a3`**  
Development branch: **`develop/v1.7`**

## Published production state

- `v1.6.0` is published and tagged at `8da70a85aa61fc064292330b4eaca83238abf3a3`.
- Tag CI `34463483758` — success.
- Release-notes workflow `34463484183` — success.
- Final v1.6.0 deterministic suite: **277/277 tests passed**.
- v1.5.0 was never separately tagged/published; its ASN identity/inventory work is included in v1.6.0.
- Repository policy remains `deploymentAuthorized:false`.

## v1.7 active work — operational ASN coverage

Issue #23 turns the existing operator-only Iran ASN inventory/enrichment into a bounded local coverage snapshot that can be inspected in the dashboard without downloading the large ipverse world dataset during normal runtime or routine CI.

Planned/implemented contract on `develop/v1.7`:

- operator command can persist a schema-versioned snapshot under `var/asn-coverage/latest.json`;
- snapshot contains bounded coverage/provenance fields plus at most 100 uncurated review candidates, not the complete world dataset or full enrichment record set;
- local snapshot parser fails closed on schema/country/count/provenance/vote inconsistencies;
- freshness is explicit: `observed`, `stale`, `no_data`, and `error` remain distinct;
- `/api/asn-coverage` reads only the fixed local snapshot and performs no RIPE/ipverse network request;
- dashboard displays RIR-associated inventory count, curated coverage, RIPE registered/routed country-level counts, ipverse metadata coverage, snapshot age and a bounded review queue;
- review classes remain analyst-prioritization hints, never censorship scores;
- clean CI expects `/api/asn-coverage` to return `no_data`, proving that absence is not converted to zero Iran ASNs;
- the large ipverse download remains operator-triggered only.

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

Neither v1.6.0 nor v1.7 development authorizes an Iran pilot. Real isolated Linux/systemd sandbox and negative-egress validation, project-controlled endpoints/collection edge, out-of-band key lifecycle testing, rollback testing, voluntary operator consent/withdrawal and explicit deployment authorization remain external mandatory gates.
