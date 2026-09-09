# Tor bounded change context — v1.4

This layer answers one narrow question: do published Iran Tor country×transport estimate intervals support a direction of change around a contextual incident window?

It does **not** estimate an exact client-count delta and does not attribute cause.

## Classification

Given a bounded observation before an incident and a bounded observation inside its documented window:

- `increase_supported_by_nonoverlapping_bounds` only when `before.high < after.low`;
- `decrease_supported_by_nonoverlapping_bounds` only when `before.low > after.high`;
- `indeterminate_overlapping_bounds` when intervals overlap or touch;
- `no_data` when either side lacks a complete lower/upper pair.

No midpoint, percentage change or exact user count is invented.

## Incident baseline

For each STOP incident, the helper uses the nearest Tor bounded observation before the incident start within a configurable 1–14 day baseline window and the first bounded observation inside the incident window. An explicitly ongoing incident is bounded by the selected analysis end; an undated-ended incident is conservatively start-day only.

## Evidence boundary

- `evidenceRole: circumvention-bound-change-context`
- `independentCensorshipVote:false`
- `causalInferenceAllowed:false`
- `intentionalBlockingInference:false`
- `exactChangeAllowed:false`
- `nationalVerdict:null`
- global BridgeDB demand is excluded from Iran incident change analysis.

A supported increase/decrease direction means only that the two published Tor estimate intervals do not overlap. It is not proof that censorship, blocking, a shutdown or any particular event caused the change.
