# Ookla Open Data feasibility — v1.4

## Status

Repository contract only. No Ookla Iran values are ingested or published by the dashboard yet.

Official source: `https://github.com/teamookla/ookla-open-data`

The official dataset publishes global fixed and mobile Speedtest performance map tiles quarterly in Apache Parquet and Shapefile form from the public `s3://ookla-open-data` bucket. Tiles contain aggregated performance fields such as download, upload and latency; the upstream documentation states that measurements are filtered to results with GPS-quality location accuracy.

License documented upstream: CC BY-NC-SA 4.0. Any later publication must preserve the required attribution/license review.

## v1.4 admission boundary

Ookla is admitted only as a candidate `performance-context` source:

- `independentCensorshipVote:false`
- `intentionalThrottlingInference:false`
- no raw-tile publication
- no individual-location publication
- no province claim
- no direct browser/dashboard download of global datasets
- no incomplete-quarter publication
- Iran country aggregation must be deterministic, bounded and aggregate-only before any value is exposed

The repository currently sets `ingestionImplemented:false` and `dashboardPublicationAllowed:false` even when the static aggregation contract is otherwise satisfied.

## Why no live metric yet

The upstream objects are global geospatial datasets, not pre-aggregated Iran time series. A defensible Iran metric therefore needs an offline pipeline that:

1. selects a completed quarter and fixed/mobile layer using the official object-key contract;
2. processes the dataset within explicit resource bounds;
3. applies a reviewed deterministic Iran geographic filter;
4. emits aggregate-only country results with sample/coverage metadata;
5. validates that no raw tile coordinates or individual-level inference reach the dashboard;
6. compares quarters only with methodology/coverage caveats preserved.

Until that pipeline exists and is tested, the correct dashboard state is **no Ookla value**, not zero and not an inferred performance trend.
