# Shutdown Context Correlation — v1.6

Last reviewed: **2026-09-10**

## Purpose

This layer closes the temporal gap between the currently published Access Now #KeepItOn STOP corpus (records through 2025) and current Internet Society Pulse shutdown context without inventing a new censorship sensor or silently merging incident records.

## Sources and authority

- **Access Now STOP**: manually curated historical/contextual shutdown incidents. The adapter preserves source URLs and recognized evidence lineage. The published corpus currently covers records through 2025.
- **Internet Society Pulse**: token-gated curated Shutdowns API. The adapter preserves country, start/end timestamps, type, verification level, cause and affected-region context.

Neither source is a raw independent technical sensor. Both may derive or cite evidence from OONI, Cloudflare Radar, IODA, RIPE, media or civil-society reporting already represented elsewhere in the project.

## Window semantics

Both adapters are evaluated against the same validated ISO date window (maximum 120 days).

A Pulse event overlaps a selected window when:

1. its start date is not later than the selected end date; and
2. its end date is absent (ongoing/open-ended) or not earlier than the selected start date.

Malformed Iran timestamps, missing required Pulse start timestamps, inverted start/end intervals and missing Pulse `data` arrays fail closed.

## Correlation rule

STOP and Pulse records remain separate provenance objects. `lib/shutdown-context.mjs` emits a `possibleSameIncident` candidate only when:

1. the date intervals overlap; and
2. both records can be conservatively normalized to the same broad scope class (`national`, `regional`, or `service`).

The result is explicitly:

- `relation: temporal_scope_overlap`;
- `possibleSameIncident: true`;
- `automaticMerge: false`;
- `independentTechnicalVote: false`.

Temporal overlap alone is insufficient. Unknown scope is insufficient. Conflicting scope is insufficient. No automatic identity, causality, shutdown-mechanism or censorship-intent claim is produced.

## Failure and availability states

Pulse without `INTERNET_SOCIETY_PULSE_API_TOKEN` returns `token_required`; this is not converted to an empty successful observation. The combined context layer reports `partial_context` when only STOP or Pulse is usable and `complete_context` only when both curated sources are available.

## Evidence boundary

Correlation is an analyst-navigation aid. Before treating two curated records as corroborating one incident, root evidence and lineage must be reviewed for overlap. The correlation layer creates zero additional independent technical votes and does not change `deploymentAuthorized:false`.
