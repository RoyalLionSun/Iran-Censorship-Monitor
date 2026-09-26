# Circumvention / incident context — v1.4

## Purpose

This layer aligns **Iran-scoped Tor transport estimate dates** with contextual **Access Now STOP incident windows** so an analyst can see temporal overlap without converting coincidence into a censorship verdict.

It is deliberately not a causality engine.

## Evidence contract

- `evidenceRole: circumvention-context-correlation`
- `independentCensorshipVote: false`
- `technicalSourceFamiliesAdded: 0`
- `causalInferenceAllowed: false`
- `automatedCensorshipVerdict: null`
- `nationalVerdict: null`

Tor stays a circumvention-context source family. Access Now STOP stays curated contextual incident evidence and never becomes a second technical sensor vote.

## Temporal overlap semantics

For each selected-window Tor country × transport estimate:

- published `low` / `high` bounds remain bounds;
- no exact client count is invented;
- a dated observation can be linked to a STOP incident only when its date lies inside the documented incident window;
- an incident without an end date extends to the selected analysis end only when STOP explicitly marks it `ongoing`;
- otherwise an incident without an end date is conservatively treated as a start-date-only event for correlation.

Every resulting link is labelled `temporal_overlap_only`, with `causalInference:false` and `censorshipVerdict:null`.

## BridgeDB boundary

BridgeDB requested-transport metrics have no Iran country dimension in the admitted feed. They are therefore **explicitly excluded** from Iran incident correlation. Global BridgeDB demand may remain visible as separate global circumvention context, but it cannot be attached to an Iran incident as Iran-specific evidence.

## Coverage and truncation

The result exposes Tor and STOP source states, preserves `partial` / `no_data`, and caps returned temporal links at 500 with an explicit `truncated` flag. No silent truncation is allowed.

## Interpretation

Temporal overlap can support analyst review of a timeline. It does not show that a shutdown caused a Tor transport change, that a transport was blocked, or that a national censorship event occurred. Any such conclusion requires separate technical evidence and the existing corroboration rules.
