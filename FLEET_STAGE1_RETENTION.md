# Stage 1 fleet privacy, source-IP and retention policy — v1.2

Status: **laboratory/pilot prerequisite only — NOT deployment authorization**.

This policy defines the minimum data-handling boundary for a future Stage 1 fleet service. It is deliberately conservative because a probe's network source address and stable pseudonymous identifier can expose or help infer an operator's location/provider even when the measurement payload itself contains no personal identity.

## Core rule

The fleet application must not intentionally persist a probe's raw source IP address.

The raw source IP will necessarily be visible transiently to the network stack and may be visible to the hosting/network provider. That unavoidable transport visibility must not be converted into an application field, analytics identifier or durable routine log record.

If the selected hosting/CDN/WAF provider cannot document a retention/configuration model compatible with this policy, the external Stage 1 pilot remains blocked.

## Data categories

### A. Transport metadata — highest sensitivity

Includes:

- source IPv4/IPv6 address;
- source port;
- connection timing that can be directly linked to a source address;
- TLS/session metadata when tied to a source address;
- network-provider logs containing those values.

Policy:

- do not copy raw source IP/port into the fleet application database;
- do not include them in measurement result objects;
- do not include them in ordinary application error logs;
- do not use them as a durable probe identifier;
- do not enrich them with geolocation, ASN, subscriber or identity data in Stage 1;
- do not expose them to dashboard/analysis code.

### B. Probe identity/authentication data

Includes:

- pseudonymous `probeId`;
- probe enabled/revoked status;
- policy version;
- per-probe HMAC secret.

Policy:

- `probeId` may exist in authenticated fleet records because protocol binding requires it;
- HMAC secrets are stored only in the separate secret-store/resolver boundary, never in result tables or logs;
- disabled/revoked probes must stop being accepted without retaining unnecessary authentication history;
- no mapping from `probeId` to real person/operator identity may be stored in the measurement datastore.

Any consent/contact record needed operationally must be held separately from measurement data with separate access control and must not be joined automatically to telemetry.

### C. Measurement result data

The accepted Stage 1 schema is limited to the normalized fields already enforced by `lib/fleet.mjs`, such as:

- pseudonymous `probeId`;
- manifest nonce/test/target identifiers;
- Class A family and address family;
- measurement timestamp;
- bounded stage outcomes/timings;
- typed error code.

The schema explicitly rejects source IP, phone/subscriber identifiers, Wi-Fi identifiers, GPS, arbitrary hostname/URL/port/command fields and free-form sensitive metadata.

### D. Operational counters

Permitted operational metrics should be aggregate counters only, for example:

- accepted/rejected/duplicate envelope counts;
- transport status class counts;
- queue depth;
- request duration histogram;
- application error-code counts.

They must not use source IP, request bodies or full probe credentials as labels.

## Stage 1 pilot retention limits

The initial Stage 1 pilot uses intentionally short retention while the privacy model is being validated.

| Data | Maximum Stage 1 pilot retention | Notes |
| --- | ---: | --- |
| Raw source IP in application datastore | **0 / prohibited** | Never intentionally persisted |
| Routine fleet access log containing raw source IP | **0 / disabled or redacted** | See edge requirements below |
| Request/response body in logs | **0 / prohibited** | Bodies contain authenticated measurement data |
| HMAC secret in logs/results | **0 / prohibited** | Secret-store only |
| Accepted per-probe normalized result | **30 days** | Pilot/review window only |
| Duplicate/rejected normalized security event without source IP/body | **30 days** | Typed reason + pseudonymous probeId only when required |
| Aggregate operational counters without source IP | **30 days** | No high-cardinality personal/network labels |
| Long-term/public fleet aggregate | **not authorized in Stage 1** | Requires separate methodology/privacy review |

Deletion after the retention window must be actual deletion from the active datastore, not merely hiding records from the dashboard.

## Reverse proxy / edge requirements

Before an external pilot, the reverse proxy or edge must be configured and tested so fleet routes do not create ordinary access logs containing raw client IP addresses.

Preferred Stage 1 behavior:

- disable access logging entirely for `/fleet/v1/manifest` and `/fleet/v1/result`; or
- use an explicitly reviewed log format that omits/redacts raw client address, request body, authentication values and `X-Fleet-Probe-Id`.

Requirements:

- no `X-Forwarded-For`, `Forwarded`, CDN client-IP header or equivalent may be persisted by the application merely because the edge supplies it;
- application code must not trust or store client-IP forwarding headers for measurement semantics;
- no third-party web analytics, session replay or tracking on fleet endpoints;
- no debug request dumps in production/pilot mode;
- body-size and rate-limit enforcement must not require durable raw-IP logging;
- error pages/bodies must not echo credentials or result envelopes.

## Hosting / CDN / WAF provider review

Infrastructure outside the application may independently retain connection metadata. Before deployment, record for every provider in the request path:

- whether raw source IP is logged;
- default and configurable retention period;
- whether logs can be disabled or shortened;
- who can access them;
- backup/replication behavior;
- geographic/log processing locations where relevant;
- whether security/WAF features create additional source-IP event stores.

A provider's undocumented or non-configurable long-lived source-IP retention is a Stage 1 blocker, not something the application should silently accept.

## Application logging rules

Permitted log examples are low-detail event records such as:

- `fleet_manifest_204`
- `fleet_result_accepted`
- `fleet_result_duplicate`
- `fleet_result_auth_failed`
- `fleet_body_too_large`
- `fleet_rate_limited`

Do not log:

- raw request body;
- response body containing server internals;
- HMAC/mac secret material;
- manifest private signing material;
- TLS private key material;
- raw source IP/port;
- full HTTP headers;
- `Authorization` values if a future request-auth scheme is introduced;
- subscriber/device/Wi-Fi/GPS data;
- arbitrary remote URLs/hosts.

If a pseudonymous `probeId` is necessary for diagnosing an authenticated application event, restrict access and honor the same 30-day pilot retention.

## Data storage and backup

For Stage 1 pilot data:

- use a dedicated datastore or logically isolated dataset;
- do not copy raw fleet request logs into the ordinary dashboard/application log archive;
- do not include fleet result data in backups whose retention exceeds the 30-day pilot window unless deletion/expiry is demonstrably enforced there as well;
- prefer no backup for disposable pilot raw results when durability is not required for the stated acceptance test;
- secrets remain in the secret store and are excluded from measurement backups;
- deletion tests are part of deployment acceptance.

A backup that preserves expired pilot records indefinitely violates this policy.

## Network and security incident handling

Security incidents do not create an automatic exception allowing indefinite source-IP collection.

If investigation of a concrete attack would require temporarily collecting additional network metadata:

1. suspend or limit the Stage 1 pilot where practical;
2. document the specific purpose, fields and duration before collection when possible;
3. use the minimum data necessary;
4. set a short explicit deletion deadline;
5. restrict access;
6. do not repurpose the data for censorship analysis;
7. record the exception in the security review.

Routine speculative retention "just in case" is not permitted.

## No inference from transport silence

Privacy minimization also constrains scientific interpretation.

Without a separately reviewed heartbeat:

- absence of a result does not prove the probe is offline;
- inability to reach the fleet service does not prove Internet censorship;
- missing uploads remain coverage/no-data state;
- raw source-IP connection history must not be mined as an implicit heartbeat;
- `offlineInferenceAllowed` remains false.

## Public/dashboard publication

Stage 1 does not authorize public or national/province claims from owned probes.

In particular:

- no raw `probeId` should be exposed publicly;
- no raw source IP is available to publish under this policy;
- one-probe data cannot be presented as national or provincial status;
- owned-probe measurements remain `independentCensorshipVote:false` until a future explicitly reviewed methodology says otherwise;
- long-term or public aggregate retention requires a separate privacy and re-identification review.

## Consent and withdrawal interaction

Before an Iran pilot is even proposed, the operator-consent procedure must define:

- what the probe measures;
- what destination the probe contacts;
- what the server can inherently observe;
- the 30-day result retention limit;
- how to disable/remove the probe;
- how future retained pilot records are deleted when withdrawal policy requires it.

Consent records must not be automatically joined to measurement telemetry.

## Deployment acceptance checks

An external Stage 1 service is not ready until tests/documentation demonstrate:

- application persistence schema has no source-IP field;
- fleet endpoint access logging is disabled/redacted as required;
- request bodies and sensitive headers are absent from logs;
- provider source-IP retention is documented and acceptable;
- datastore expiry/deletion at 30 days works;
- backup policy does not defeat deletion;
- secret-store separation remains intact;
- no analytics/tracking middleware handles fleet endpoints;
- no application code treats source IP or silence as censorship evidence;
- operator consent/withdrawal procedure has been reviewed.

**External/Iran Stage 1 deployment remains NOT AUTHORIZED.**
