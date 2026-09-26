# Interpretation Contract

Status: **current contract (v1.9)**

Implementation: `lib/interpretation.mjs`

Public payload: `assessment.interpretation`

## Purpose

The dashboard reports bounded claims that the available measurements can support. It does not calculate one Internet-health score and does not treat unlike measurements as interchangeable votes.

Every public statement belongs to one dimension:

| Dimension | User question | Primary evidence | Explicit boundary |
|---|---|---|---|
| `connectivity` | Are broad connectivity/outage signals present? | IODA; eligible Cloudflare Radar outage/anomaly channels | Does not establish filtering, censorship, cause or intent |
| `interference` | Do tested websites/services show access or blocking signals? | OONI probes on networks registered in Iran | Does not describe the whole Internet or identify an actor |
| `routing` | Are selected-ASN routes visible to RIPE RIS peers? | time-aligned RIPEstat/RIPE RIS routing status | Does not prove end-user or website reachability |
| `quality` | Are usable path/performance observations available? | RIPE Atlas; Cloudflare Radar quality for the selected window; M-Lab NDT as bounded context | Does not represent national quality without adequate coverage |
| `shutdown` | Is a nationwide intentional shutdown established? | source-native nationwide technical impact from two independent connectivity roots, matched in time by a confirmed or acknowledged national Internet Society Pulse record | Establishes the incident, never the responsible actor or intent |

Tor, BridgeDB, topology, ASN inventory, RPKI, APNIC, STOP, Pulse, GDELT and specialist reporting retain their documented context roles. They do not become additional censorship votes.

## Where each source measures from

Only a measurement that starts inside an Iranian network and goes outward can show what people in Iran can reach. A vantage point abroad cannot check that. Access claims (websites, services, apps) therefore rest only on inside-out measurements; outside-in sources describe whether Iranian networks are reachable or connected, never what users inside can reach.

| Source | Where it measures from | Direction | May support |
|---|---|---|---|
| OONI Probe | volunteers' devices in networks registered in Iran | inside → out | access claims (service, website, app) |
| Cloudflare Radar traffic, quality, outage annotations | traffic from Iranian networks reaching Cloudflare | inside → out | connectivity, depth, quality |
| RIPE Atlas, Globalping | probes in Iranian networks | inside → out | path quality; optional DNS/TLS checks answer for a service only where OONI has no test, labelled "independent check" and never added to OONI's counts |
| IODA | active probing, BGP and telescope from outside | outside → in / control plane | connectivity only |
| RIPEstat / RIPE RIS | global route collectors | control plane | routing only |
| Censored Planet | servers abroad querying servers in Iran | outside → in | nothing; context only |
| APNIC | client geolocation, with a per-network table | inside → out | context only; for all of Iran the share of networks registered abroad and the Iranian-only IPv6 value are shown |
| Tor Metrics | client geolocation, country totals only | inside → out | context only; cannot be filtered by network, so VPN exits geolocated to Iran may be counted |
| M-Lab NDT | client geolocation, country and network aggregates | inside → out | context only; the country aggregate cannot be filtered by network |
| Psiphon Conduit statistics | Psiphon's count of connections from clients in Iran | inside → out | usage context only |

**Geolocation is not network.** OONI files a measurement under Iran by the probe's geolocation. In the 2026 blackouts most "Iranian" Web Connectivity tests came from networks registered abroad (1–20 March 2026: 66% from AS142578, Hong Kong; 10–20 January 2026: all from AS9009, a hosting/VPN provider). They show what works outside Iran. Country-wide OONI figures therefore count only probes on networks in the RIPEstat country resource list for Iran; excluded tests are subtracted day by day, reported to the reader, and individual records from such networks are marked in the URL drilldown. Without the registry the exclusion is reported as not applied.

## Independent axes

### Severity — observed impact

| Value | Meaning |
|---|---|
| `unknown` | Impact cannot be determined from the available scope/metadata |
| `none` | Adequate relevant coverage returned no event/signal for this exact claim |
| `minor` | Limited or localized impact established by suitable source-native evidence |
| `moderate` | Clear but bounded impact established by suitable source-native evidence |
| `severe` | Substantial regional or otherwise broad impact established |
| `widespread` | National or comparably wide impact established |

Source count never raises severity. Raw event counts never define severity. If a source does not provide trustworthy impact/scope semantics, a positive signal retains `severity: unknown`.

### Confidence — strength of the evidence base

| Value | Rule |
|---|---|
| `none` | No suitable usable evidence for the claim |
| `low` | One technical root, limited coverage or time/scope limitations |
| `medium` | Two independent technical roots support the same aligned claim, or one strong source-native confirmation supports a narrow claim |
| `high` | Multiple aligned independent paths, adequate/broad coverage, at least one strong source-native confirmation and no material contradiction |

Availability alone does not increase confidence. A quiet source does not corroborate a positive finding. Curated context does not count as an independent technical root.

The current implementation does **not** yet verify that every contributing observation matches in time, geographic scope or root provenance. It therefore does not raise confidence or verification from source-family count alone. `medium` is possible for narrow source-native OONI confirmation; `adequate` coverage still only counts eligible families within a dimension and is **not** proof of national sampling or matching incidents. Before promoting a multi-source incident claim, implement and test explicit alignment checks.

### Verification — status of the concrete phenomenon

| Value | Meaning |
|---|---|
| `not-established` | The phenomenon is not established |
| `signal` | A suitable technical observation exists |
| `supported` | Independent aligned observations support the same phenomenon |
| `confirmed` | A suitable source-native or reviewed method confirms the narrow phenomenon |
| `acknowledged` | A competent provider/authority or accepted incident source acknowledges it |

OONI source-native confirmation applies to the measured target/test/network scope. It does not confirm national censorship policy, political intent or actor attribution.

### Coverage — where a claim can speak

| Value | Meaning |
|---|---|
| `none` | No usable measurement coverage |
| `limited` | One source or a narrow target/path/network scope |
| `adequate` | Enough relevant independent coverage for the bounded claim |
| `broad` | Source-native scope establishes broad/national reach and supporting coverage is suitable |

Negative findings require stronger coverage than positive signals. For example, one OONI source with zero anomalies is insufficient for `none`; it remains `unknown` with limited coverage.

### Attribution — cause, intent or actor

Attribution is separate from verification:

- `unknown`: no suitable cause/intent evidence;
- `reported`: an established incident has a source-reported cause;
- `supported`: multiple suitable contextual records support the cause;
- `confirmed`: cause/actor is authoritatively established.

Technical measurements never infer political intent by themselves. The current implementation emits only `unknown` or a narrowly scoped `reported` state.

## Last known state

When a source fails or rate-limits the dashboard, its last successful answer for the same scope is returned with `status: 'stale'` and the time it was fetched. Stale data is history: it never supports a current claim, never counts toward coverage, and its numbers are not shown as current evidence. The service tiles keep showing the last known state, the Overview headline is introduced as `LAST KNOWN SITUATION`, and the scope line names the source outage together with the time of the last successful data. Nothing is presented as fresh that is not.

## Missing-data contract

| Source state | Interpretation behavior |
|---|---|
| `error` | Source failed; no claim about real-world conditions |
| `token_required` | Not measured; never treated as zero events |
| `scope_required` | Dimension not evaluated for the current selection |
| `no_data` | Valid response with no observations for that source/scope; not automatically normal |
| `partial` | May remain visible, but cannot automatically raise support/confidence unless specifically admitted |
| `stale` | May remain visible as history, but cannot support a current claim |
| `observed` | Parsed observations are available; claim rules still determine relevance |

Concrete invariants:

- RIPE probes with zero usable samples produce unknown quality.
- Zero OONI measurements produce unknown interference.
- Valid IODA and eligible Radar no-event responses can establish only that no event was detected in those connectivity channels.
- BGP visibility with missing user/data-plane observations supports only a routing claim.
- An unavailable source can never turn a card green or create a no-disruption finding.

## Shutdown rule

A nationwide shutdown is established only when all of the following hold for the **same incident**:

1. source-native nationwide technical impact (`connectivity.severity: widespread`, from an eligible Radar outage annotation whose own scope says nationwide);
2. at least two independent technical connectivity roots supporting the claim (IODA and Cloudflare Radar);
3. a confirmed or acknowledged **national** Internet Society Pulse record whose time range overlaps both a nationwide Radar annotation and an IODA event, so the records describe one incident rather than three unrelated ones;
4. Pulse remains curated context: it is never listed as a supporting technical source and never becomes an extra technical vote.

Confidence stops at `medium` even when the rule is met, because root lineage between the sources is still unverified. An established shutdown reports its period, not a present-tense claim, and attribution stays separate: a Pulse cause is reported as a source-reported cause, never as proven intent.

A national Pulse record that does not meet the rule — for example one that Pulse itself marks `unconfirmed` — is shown as context with its verification level and period, so a reader learns that the record exists without it being treated as established. Without a Pulse token the dimension says plainly that the question cannot be answered by this deployment.

## Outage periods and depth

Cloudflare Radar files a nationwide outage under the country and lists no ASNs, so an ASN-scoped annotation query never returns it. For a selected network the country query is therefore made as well, and only its **nationwide** annotations are applied to the network (marked `appliesVia: 'country'`); a regional country annotation does not speak for one network. A selected network stays Radar-ineligible when that country check fails, because a quiet answer without it cannot mean that no outage was reported.

`connectivity.outagePeriods` lists the nationwide, regional and network outages with the start and end Radar itself gives them, and whether each started before or ended inside the selected period. The dates are source-native; the dashboard never shortens, joins or splits them.

For the latest nationwide period, `connectivity.outageTraffic` compares Cloudflare-observed HTTP traffic from Iran per day with the median day of the week before the outage. Start and end days mix both states and are excluded; a baseline that cannot be measured yields no value rather than an assumed one. Radar scales each response to its own maximum and refuses daily data for more than 90 days, so a longer window is fetched as two overlapping requests joined through their largest shared day. The depth is context for the reader: it never changes state, severity, confidence, verification or coverage.

When a network is selected, its own traffic is fetched the same way and shown as a second line against its own week before (`outageTraffic.network`), only for that network and only next to the country line. Networks recover differently: after 26 May 2026 MCI (AS197207) returned more slowly than TCI or Irancell, so a mobile/fixed label alone would say too little.

A remainder of traffic during an outage is reported as a remainder. It does not show who could still connect or why, and the dashboard does not infer allow-listed users, SIM classes or other access tiers from it.

When every nationwide outage in the period ended inside it, the headline reports the end and names the services that stayed blocked (`outage-ended`), because a restored connection is not open access.

A national Pulse record is set against these periods in `shutdown.contextComparison`: `radar-dates-match`, `radar-dates-differ` (for example one Pulse record spanning two Radar outages), or `radar-no-nationwide-outage` for a period in which Radar reports none. Without a usable Radar answer there is no comparison.

## Slow routing lookups

An uncached RIPEstat `routing-status` lookup can take far longer than the 12 s request timeout. The response stays fast: routing then reports `insufficient-data` with `pending: true`, the Overview states that the lookup is still being fetched, and a background revalidation stores the result for the next request. A pending lookup never becomes a routing claim.

## Routing time alignment

Historical `/api/overview` selections pass the selected `until` time to RIPEstat `routing-status`. RIPEstat may align the request to one of its collection snapshots; returned query time within the accepted collection interval is marked `aligned`. Current-window selections request RIPEstat's latest snapshot without a timestamp; a query time within the same interval of now is marked `latest`. RIPEstat reports `query_time` without a zone designator and it is read as UTC. Unknown alignment lowers routing confidence and suppresses the control-/data-plane divergence comparison.

## Censored Planet

Censored Planet measures from servers abroad towards servers inside Iran. It remains visible as context (`state: outside-in`) but never counts toward coverage or support of any access claim, at country level or for a selected network, target or test.

## Public payload invariants

`assessment.interpretation` contains:

```text
schemaVersion
scope / selection
summary { state, evidenceMode, shutdownState, routingState, headline, latestObservation }
dimensions { connectivity, interference, routing, quality, shutdown }
services (null when no service data was queried)
attribution
findings[]
unknowns[]
invariants
```

The summary deliberately has no `score` and no global `severity`. Each dimension provides its own state, severity, confidence, verification, coverage, evidence and limitations.

The following invariants are executable regression assertions:

- `globalScore: false`
- `severityRaisesFromSourceCount: false`
- `missingDataMeansNormal: false`
- `connectivityProvesCensorship: false`
- `bgpVisibilityProvesReachability: false`

## Priority services and plain-language headline

`services` summarizes OONI results for six popular services (Instagram, WhatsApp, Telegram, YouTube, X/Twitter, Facebook) in the selected scope. It is built from the OONI Web Connectivity domain aggregation and, for WhatsApp and Telegram, the separate OONI app tests.

- A brand shows its strongest single domain result. Domain groups are never summed; X and legacy Twitter remain separate counts.
- Website and app results are separate channels. A website result never stands in for app availability, and the reverse.
- Brand status: `blocked` when a channel has OONI-confirmed blocking; `restricted` when a channel only has anomalies (blocking not confirmed); `reachable` when tested without anomalies; `unclear` when tests only failed; otherwise `untested`, `unavailable` or `out-of-scope`. Missing or failed data never becomes `reachable`.

### Connection quality sources

Cloudflare Radar contributes latency, bandwidth and DNS response time estimated from real user traffic in the selected network, each with its quartile spread, because a median alone hides how widely the experience varies. A day whose quartiles are all zero had no sampled traffic, as happens during a shutdown; it is dropped rather than read as zero latency, and the number of measured days is reported with the value. Only the daily time series is used, because the ASN-level summary endpoint silently answers with a 90-day window regardless of the requested period. Every response is checked against the requested window and counts as coverage only while it stays inside it; otherwise it remains visible without speaking for the selected period. The values are rolling averages of measured traffic, not a controlled speed test.

### Network scope of a service claim

The same finding in many networks is a country-wide pattern; in one network it is a provider decision. One aggregation per headline service, grouped by `probe_asn` and unrestricted by network, reports in how many measured Iranian networks the service was confirmed blocked, showed problems, or stayed reachable. Networks where every measurement failed remain `inconclusive`. This is scope evidence for the reader: it never raises severity, and it never turns OONI into a second source.

### Coverage of a service claim

OONI deliberately publishes no stable probe identity, so a claim's coverage is expressed in units that can be counted honestly: the **measured days** a domain group was tested on (from the daily aggregation, complete for the window) and, for an explicit service selection, the **independent measurement runs** behind the finding (distinct `report_id` in a bounded sample of the most recent records). A full sample is reported as a floor ("at least N"), never as a total, and neither number is presented as a count of people, devices or probes.

### Blocking mechanism

The mechanism is source-native and never inferred by this project. For each affected measurement in the sample, OONI reports an analysed `blocking_type` and, for confirmed cases, where the block fingerprint was found. A confirmed DNS fingerprint outranks the analysed type; otherwise `dns`, `tcp_ip`, `http-diff` and `http-failure` map to name-lookup blocking, blocked connections, a block page and an interrupted encrypted connection. Measurements without a finding contribute no mechanism, and an unspecified mechanism is never presented as one. The dominant mechanism is reported with its count out of the affected tests in the sample, for the named service only.

`summary.headline` selects the first-screen statement in this order: established nationwide shutdown; a nationwide outage that ended inside the period (with the services that stayed blocked); source-native `widespread`/`severe` connectivity impact; confirmed blocked services (named); unconfirmed service problems (named); generic connectivity events; `no-problems-detected` only when every tested service is reachable and connectivity has adequate no-event coverage; otherwise `limited-evidence`. When services were tested, the open unknown becomes `other-services` instead of `affected-services`.

## Presentation order

The default Overview follows this order:

The **Overview** is written for readers without technical background and holds three blocks:

1. the situation board: a plain-language headline, the service tiles for the current selection, and a status row for internet connection, test connections and complete shutdown;
2. what this means for you: what the tests could and could not reach, the state of the connection itself, and what the results are based on;
3. what we do not know, limited to what the current selection leaves open.

**Technical analysis** holds everything an analyst needs and nothing the Overview repeats: the per-claim assessment cards (severity, confidence, verification, coverage), the per-website test details with URL drilldown, the findings list with labelled metrics, the evidence/coverage matrix, and the former source cards, charts and raw drill-down. A link in the Overview leads there.

A selection names a service, not a hostname: selecting Facebook covers facebook.com and www.facebook.com, and selecting WhatsApp or Telegram includes their OONI app test. An unrelated website target never pulls app findings into the answer.

Service tiles use their own status colors, always paired with a text label. Source-health colors keep describing data availability only, and a single unavailable side source is not shown as an alarm.

Technical analysis preserves the former source cards, charts, source-health legend and raw drill-down. Its observations do not override the interpretation contract.
