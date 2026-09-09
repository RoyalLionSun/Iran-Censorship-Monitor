# Province / SIM Segmentation Feasibility

Status: v1.2 development review. Current decision is fail-closed.

## Province-level measurement

Current status: **DEFERRED / NO-GO for publication**.

The project must not derive province from source IP, ASN, reverse DNS, network name, latency, or any other synthetic geography. Such inference is both methodologically weak and potentially privacy-sensitive.

A future province design may be reviewed only if all of the following are solved outside the current fleet telemetry model:

- explicit voluntary operator participation;
- coarse location supplied locally by the operator rather than inferred from network metadata;
- no exact coordinates or address collection;
- privacy review of cohort size and disclosure risk;
- publication thresholds preventing single-participant attribution;
- coverage documentation showing which provinces/networks are actually represented;
- no automatic province availability or censorship badge.

Even coarse self-declared province metadata is only a future review candidate. It is not authorized by the current Stage-1 fleet design.

## White-SIM vs ordinary-SIM

Current status: **NO-GO**.

The existing fleet intentionally rejects subscriber/device identifiers and sensitive SIM metadata. Reliably determining a privileged/white-SIM entitlement class would require operator or subscriber information that the current design neither needs nor permits.

The project therefore must not infer SIM class from:

- source IP or address range;
- ASN/operator name;
- throughput or reachability differences;
- DNS behavior;
- device model or modem identifiers;
- IMSI, ICCID, MSISDN, IMEI, SIM serial, billing/product metadata, or entitlement records.

Without a separately approved ethical methodology that can establish SIM class without exposing participants, the comparison is not technically or ethically defensible.

## Publication rule

No province or SIM-segmented panel, badge, CSV field, API field, automated verdict or source counter may be added under the current policy. Missing segmentation remains `no_data`/unsupported rather than being estimated.

`lib/evidence-policy.mjs` encodes these current fail-closed decisions so later UI or analytics code cannot silently promote synthetic geography or SIM inference.
