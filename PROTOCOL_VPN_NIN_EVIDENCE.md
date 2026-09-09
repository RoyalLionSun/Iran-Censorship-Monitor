# Protocol / VPN / NIN Evidence Model

Status: v1.2 development policy. This document does not authorize an Iran pilot or activate any new measurement family.

## Purpose

Define the minimum evidence boundary before the project may publish statements about WireGuard, OpenVPN, V2Ray, Outline, or NIN-vs-global reachability. The model deliberately separates an observation from a censorship or availability verdict.

## VPN / circumvention protocols

A provider website being blocked is not evidence that the provider's transport protocol is blocked. OONI Web Connectivity measurements of circumvention-tool websites remain website/application evidence only.

For a protocol observation to become `analyst_review_ready`, all of the following must be present:

- the actual transport protocol was measured;
- the endpoint is project-controlled and pre-registered;
- a neutral control was measured from the same probe;
- protocol and neutral control are paired on the same probe;
- at least one repeated observation window exists;
- probe/network coverage is documented;
- the measurement design was reviewed;
- an analyst reviewed the result.

Country-level protocol evidence additionally requires observations from more than one network. This is a minimum anti-single-network guard, not a claim that two networks are nationally representative.

Even when the gate is complete:

- `automaticBlockedVerdictAllowed = false`;
- `automaticAvailabilityVerdictAllowed = false`;
- `independentCensorshipVote = false` for the owned fleet family;
- multiple owned probes remain one source family;
- province publication remains disabled.

## NIN vs global Internet

A NIN-vs-global statement requires a paired design rather than inference from traffic, BGP, DNS geography, or source IP.

Minimum review gate:

- domestic/NIN target classification reviewed separately;
- global target classification reviewed separately;
- at least two independently hosted global control targets;
- same-probe paired measurements;
- bounded temporal pairing;
- explicit coverage documentation;
- reviewed measurement design;
- analyst review.

The current Class-A production target policy does not yet define or authorize a domestic/NIN target class. Therefore this model currently describes the gate but does not make NIN comparison operational.

## Scope rules

`probe`, `network`, `asn`, and `country` are possible evidence scopes after their respective review gates. `province` remains disabled by current policy.

`no_data`, `partial`, transport failure, measurement error and observed protocol behavior remain separate states. Missing data never means available, blocked, offline, domestic-only, or globally reachable.

## Interpretation

The code in `lib/evidence-policy.mjs` is a fail-closed publication-readiness boundary. It cannot authorize deployment and cannot convert any measurement into an automatic censorship verdict.
