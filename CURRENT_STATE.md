# Current State — v1.8.0 release line

Date: **2026-09-10**  
Current release line: **`v1.8.0`**  
Production branch: **`main`**  
Previous published release: **`v1.7.0`** at `2af215401c963542e7bfc1d9e23c90c0ad2f01aa`

## v1.8.0 release state

- Issue #28, `v1.8 — plain-language current situation and English/Farsi UX foundation`, is completed.
- The v1.8 feature work is merged to `main`; current pre-release `main` before release metadata is `a8c7ba4e522b9b05404658408a714c3a87c12a4c`.
- Feature PR #29 CI `34521384028` passed before merge.
- A recurring legacy Headless Chrome fixture-readiness timing flake was stabilized by PR #30; PR CI `34521917702` and post-merge `main` CI `34522031963` passed.
- The post-merge completeness audit found remaining controlled runtime English text under Farsi mode; Issue #28 was deliberately reopened until that gap was closed.
- Completion PR #31 added versioned runtime/context locale layers and deterministic coverage. Its first CI correctly caught one untranslated Farsi topology template; the corrected PR CI `34523935503` passed.
- Final v1.8 feature `main` CI `34524065320` passed the full gate.
- Current deterministic suite: **301/301 tests passed**.
- Repository policy remains `deploymentAuthorized:false`.

## Plain-language current situation

v1.8 adds a prominent public-facing summary derived only from the existing reviewed assessment object. It does not introduce another score or independent evidence path.

The summary distinguishes:

- insufficient data;
- no corroborated major disruption;
- an elevated signal in one source;
- corroborated disruption signals;
- strong multi-source disruption signals.

The presentation preserves the evidence boundary explicitly:

- BGP control-plane visibility is not proof of working end-user Internet;
- absence of a detected major disruption is not proof that Internet access is fully normal;
- source anomalies or performance degradation do not establish censorship mechanism, political intent or attribution by themselves;
- the current assessment does not automatically assert a complete nationwide shutdown;
- translated presentation text cannot create or increase an evidence vote.

High-value panels also expose concise `What this means` explanations while keeping source-specific measurements, provenance and technical drill-down visible.

## English/Farsi and RTL

The dashboard now has a central versioned English/Farsi translation architecture with a persistent `EN | فارسی` switch.

Implemented contract:

- English applies `lang=en` and `dir=ltr`; Farsi applies `lang=fa` and `dir=rtl`;
- static UI, controlled status text, explanatory text, historical v11-v17 context panels and whitelisted dynamic runtime sentence frames have paired EN/FA locale entries;
- arbitrary external-source titles and narrative content remain verbatim unless an explicit translated companion exists;
- no runtime Google, DeepL, AI or other machine-translation dependency is used;
- ASN identifiers, IP/prefix values, BGP paths, URLs, timestamps and other technical values remain direction-safe/LTR where appropriate;
- dynamic templates translate only the controlled framing and preserve their technical values;
- browser-local language persistence is verified in a real Chrome/Chromium gate.

## Verification

The final v1.8 feature state has passed:

- **301/301 deterministic tests**;
- syntax checks for application, assessment, i18n, locale, verification and collector modules;
- canonical release-note gate on the then-current stable line;
- production build;
- legacy presentation Headless Chrome gate;
- EN → FA/RTL → EN Headless Chrome gate, including persistence, Farsi runtime text, LTR technical fields and external-content preservation;
- committed-secret/private-key rejection;
- production runtime smoke test.

No v1.8 live-source acceptance was added because v1.8 changes presentation/i18n behavior only. It does not change upstream collection, source parsing, source semantics, censorship voting, ASN inventory generation or public-source acceptance contracts.

## Inherited v1.7 operational ASN acceptance

The v1.7 release path was exercised on a real Node.js runtime using public upstreams. That acceptance remains the applicable runtime baseline because v1.8 does not modify the ASN collection path.

Observed snapshot on 2026-09-10:

- country: `IR`;
- RIR-associated inventory: **856 ASNs**;
- RIPE country-level registered/routed counts: **856 / 593**;
- registered minus routed: **263**;
- curated catalogue: **23/23 inside inventory**, 23/856 = **2.69%**;
- ipverse metadata matches: **856/856**;
- secondary metadata missing: **0**;
- secondary country mismatch: **0**;
- persisted review queue: **100** candidates;
- snapshot state through `/api/asn-coverage`: **`observed`**;
- root and candidate semantics retain `independentCensorshipVote:false`.

These are acceptance observations, not hard-coded release constants. RIPE `routedCount` remains a country-level RIPE RIS control-plane count and is not an ASN-by-ASN reachability classification.

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

v1.8.0 does not authorize an Iran pilot. Real isolated Linux/systemd sandbox and negative-egress validation, project-controlled endpoints/collection edge, out-of-band key lifecycle testing, rollback testing, voluntary operator consent/withdrawal and explicit deployment authorization remain external mandatory gates.
