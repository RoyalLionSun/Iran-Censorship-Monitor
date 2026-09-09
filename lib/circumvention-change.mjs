export const TOR_BOUND_CHANGE_POLICY = Object.freeze({
  evidenceRole: 'circumvention-bound-change-context',
  independentCensorshipVote: false,
  causalInferenceAllowed: false,
  intentionalBlockingInference: false,
  exactChangeAllowed: false,
  nationalVerdict: null,
});

const MAX_COMPARISONS = 100;

function validBound(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function bounds(low, high) {
  const lo = validBound(low);
  const hi = validBound(high);
  if (lo === null || hi === null) return null;
  if (lo > hi) throw new Error('lower bound must not exceed upper bound.');
  return { low: lo, high: hi };
}

export function classifyTorBoundChange({ beforeLow, beforeHigh, afterLow, afterHigh }) {
  const before = bounds(beforeLow, beforeHigh);
  const after = bounds(afterLow, afterHigh);
  let state = 'no_data';
  if (before && after) {
    if (before.high < after.low) state = 'increase_supported_by_nonoverlapping_bounds';
    else if (before.low > after.high) state = 'decrease_supported_by_nonoverlapping_bounds';
    else state = 'indeterminate_overlapping_bounds';
  }
  return {
    state,
    before,
    after,
    exactChange: null,
    causalInference: false,
    censorshipVerdict: null,
  };
}

function iso(value, name) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD.`);
  const parsed = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error(`${name} must be a valid date.`);
  return text;
}

function addDays(date, days) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function incidentWindow(incident, until) {
  if (!incident?.startDate) return null;
  const start = iso(incident.startDate, 'incident.startDate');
  if (incident.endDate) return { start, end: iso(incident.endDate, 'incident.endDate') };
  if (String(incident.status || '').trim().toLowerCase() === 'ongoing') return { start, end: until };
  return { start, end: start };
}

function assertSemantics(tor, accessNow) {
  if (tor?.ok !== true) return;
  if (tor.sourceFamily !== 'tor' || tor.independentCensorshipVote !== false) throw new Error('Tor input has incompatible evidence semantics.');
  if (accessNow?.ok === true) {
    for (const incident of accessNow.incidents || []) {
      if (incident.independentTechnicalVote !== false) throw new Error('STOP incident has incompatible technical-vote semantics.');
    }
  }
}

function flatten(tor) {
  const map = new Map();
  for (const series of tor?.transports || []) {
    const transport = String(series?.transport || '').trim();
    if (!transport) continue;
    const rows = [];
    for (const row of series.rows || []) {
      if (!row?.date) continue;
      const date = iso(row.date, 'transport row date');
      const pair = bounds(row.low, row.high);
      if (!pair) continue;
      rows.push({ date, low: pair.low, high: pair.high, fraction: Number.isFinite(row.frac) ? row.frac : null });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    if (rows.length) map.set(transport, rows);
  }
  return map;
}

function status(tor, accessNow, comparisons) {
  if (tor?.ok !== true) return 'no_data';
  if (tor.status === 'partial' || accessNow?.ok !== true || accessNow?.coverageWarning) return comparisons.length ? 'partial' : 'no_data';
  return comparisons.length ? 'observed' : 'no_data';
}

export function buildTorIncidentBoundChanges({ tor, accessNow, since, until, baselineDays = 7 }) {
  const start = iso(since, 'since');
  const end = iso(until, 'until');
  if (start > end) throw new Error('since must not be after until.');
  if (!Number.isInteger(baselineDays) || baselineDays < 1 || baselineDays > 14) throw new Error('baselineDays must be an integer from 1 to 14.');
  assertSemantics(tor, accessNow);

  const byTransport = flatten(tor);
  const incidents = accessNow?.ok === true && Array.isArray(accessNow.incidents) ? accessNow.incidents : [];
  const comparisons = [];
  let candidateComparisons = 0;

  for (const incident of incidents) {
    const window = incidentWindow(incident, end);
    if (!window || window.end < start || window.start > end) continue;
    const baselineStart = addDays(window.start, -baselineDays);

    for (const [transport, rows] of byTransport) {
      const before = [...rows].reverse().find((row) => row.date >= baselineStart && row.date < window.start) || null;
      const during = rows.find((row) => row.date >= window.start && row.date <= window.end) || null;
      if (!before && !during) continue;
      candidateComparisons += 1;
      if (comparisons.length >= MAX_COMPARISONS) continue;
      const change = classifyTorBoundChange({
        beforeLow: before?.low ?? null,
        beforeHigh: before?.high ?? null,
        afterLow: during?.low ?? null,
        afterHigh: during?.high ?? null,
      });
      comparisons.push({
        incidentId: incident.id || null,
        incidentStartDate: window.start,
        incidentEndDate: window.end,
        transport,
        baselineWindowStart: baselineStart,
        beforeDate: before?.date ?? null,
        beforeLow: before?.low ?? null,
        beforeHigh: before?.high ?? null,
        duringDate: during?.date ?? null,
        duringLow: during?.low ?? null,
        duringHigh: during?.high ?? null,
        estimateKind: 'derived_lower_upper_bounds',
        changeState: change.state,
        exactChange: null,
        relationship: 'bounded_change_near_incident_window',
        causalInference: false,
        censorshipVerdict: null,
      });
    }
  }

  return {
    ok: true,
    ...TOR_BOUND_CHANGE_POLICY,
    status: status(tor, accessNow, comparisons),
    country: 'IR',
    since: start,
    until: end,
    baselineDays,
    comparisons,
    coverage: {
      maxComparisons: MAX_COMPARISONS,
      candidateComparisons,
      returnedComparisons: comparisons.length,
      truncated: candidateComparisons > comparisons.length,
    },
    excludedContext: {
      bridgeDbGlobal: true,
    },
    note: 'A direction is reported only when Tor lower/upper estimate intervals do not overlap. Overlapping intervals remain indeterminate. These comparisons are temporal analyst context only and never establish censorship, blocking, causality, or an exact client-count change.',
  };
}
