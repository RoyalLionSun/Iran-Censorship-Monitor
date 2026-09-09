export const CIRCUMVENTION_CONTEXT_POLICY = Object.freeze({
  evidenceRole: 'circumvention-context-correlation',
  independentCensorshipVote: false,
  causalInferenceAllowed: false,
  automatedCensorshipVerdict: null,
  nationalVerdict: null,
  technicalSourceFamiliesAdded: 0,
  bridgeDbGlobalIranCorrelationAllowed: false,
});

const MAX_LINKS = 500;

function isoDate(value, name) {
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${name} must be YYYY-MM-DD.`);
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error(`${name} must be a valid date.`);
  return text;
}

function validateRange(since, until) {
  const start = isoDate(since, 'since');
  const end = isoDate(until, 'until');
  if (start > end) throw new Error('since must not be after until.');
  return { since: start, until: end };
}

function incidentWindow(incident, until) {
  const start = incident?.startDate ? isoDate(incident.startDate, 'incident.startDate') : null;
  if (!start) return null;
  if (incident.endDate) return { start, end: isoDate(incident.endDate, 'incident.endDate') };
  if (String(incident.status || '').trim().toLowerCase() === 'ongoing') return { start, end: until };
  return { start, end: start };
}

function dateWithin(date, window) {
  return date >= window.start && date <= window.end;
}

function assertSourceSemantics(tor, accessNow) {
  if (tor?.ok === true) {
    if (tor.sourceFamily !== 'tor') throw new Error('Tor context must declare sourceFamily=tor.');
    if (tor.independentCensorshipVote !== false) throw new Error('Tor context must not be an independent censorship vote.');
    if (!['circumvention-context', undefined].includes(tor.evidenceRole)) throw new Error('Tor evidence role is incompatible with circumvention context.');
  }
  if (accessNow?.ok === true) {
    for (const incident of accessNow.incidents || []) {
      if (incident.independentTechnicalVote !== false) throw new Error('Access Now incidents must not be independent technical votes.');
    }
  }
}

function transportRows(tor, since, until) {
  const rows = [];
  for (const series of tor?.transports || []) {
    const transport = String(series?.transport || '').trim();
    if (!transport) continue;
    for (const row of series.rows || []) {
      if (!row?.date) continue;
      const date = isoDate(row.date, 'transport row date');
      if (date < since || date > until) continue;
      const low = Number.isFinite(row.low) ? row.low : null;
      const high = Number.isFinite(row.high) ? row.high : null;
      if (low === null && high === null) continue;
      rows.push({
        transport,
        date,
        low,
        high,
        fraction: Number.isFinite(row.frac) ? row.frac : null,
        estimateKind: 'derived_lower_upper_bounds',
        exactUsers: null,
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.transport.localeCompare(b.transport));
}

function deriveStatus(tor, accessNow, observedRows) {
  if (tor?.ok !== true) return 'no_data';
  if (!observedRows.length) return tor.status === 'partial' ? 'partial' : 'no_data';
  if (tor.status === 'partial') return 'partial';
  if (accessNow?.ok !== true || accessNow?.coverageWarning) return 'partial';
  return 'observed';
}

export function buildCircumventionIncidentContext({ tor, accessNow, since, until }) {
  const range = validateRange(since, until);
  assertSourceSemantics(tor, accessNow);

  const observations = transportRows(tor, range.since, range.until);
  const incidents = accessNow?.ok === true && Array.isArray(accessNow.incidents) ? accessNow.incidents : [];
  const links = [];
  let candidateLinks = 0;

  for (const incident of incidents) {
    const window = incidentWindow(incident, range.until);
    if (!window || window.end < range.since || window.start > range.until) continue;
    for (const observation of observations) {
      if (!dateWithin(observation.date, window)) continue;
      candidateLinks += 1;
      if (links.length >= MAX_LINKS) continue;
      links.push({
        incidentId: incident.id || null,
        incidentStartDate: window.start,
        incidentEndDate: window.end,
        incidentStatus: incident.status || null,
        shutdownType: incident.shutdownType || null,
        shutdownExtent: incident.shutdownExtent || null,
        transport: observation.transport,
        observationDate: observation.date,
        low: observation.low,
        high: observation.high,
        fraction: observation.fraction,
        estimateKind: observation.estimateKind,
        exactUsers: null,
        relationship: 'temporal_overlap_only',
        causalInference: false,
        censorshipVerdict: null,
      });
    }
  }

  const linkedIncidentIds = new Set(links.map((link) => link.incidentId).filter(Boolean));
  return {
    ok: true,
    ...CIRCUMVENTION_CONTEXT_POLICY,
    status: deriveStatus(tor, accessNow, observations),
    country: 'IR',
    since: range.since,
    until: range.until,
    sourceFamilies: ['tor', 'access-now-stop'],
    sourceStates: {
      tor: tor?.ok === true ? (tor.status || 'observed') : 'no_data',
      accessNowStop: accessNow?.ok === true ? (accessNow.status || 'observed') : 'no_data',
    },
    transportObservationCount: observations.length,
    incidentCount: incidents.length,
    linkedIncidentCount: linkedIncidentIds.size,
    temporalOverlapCount: candidateLinks,
    links,
    coverage: {
      maxLinks: MAX_LINKS,
      truncated: candidateLinks > links.length,
      returnedLinks: links.length,
    },
    excludedContext: {
      bridgeDbGlobal: {
        excluded: true,
        reason: 'BridgeDB requested-transport metrics are global aggregates without an Iran country dimension.',
      },
    },
    note: 'Temporal overlap between Iran Tor transport estimates and contextual incident windows is analyst context only. It does not establish that an incident caused a transport change, does not create a censorship verdict, and does not add an independent technical source vote.',
  };
}
