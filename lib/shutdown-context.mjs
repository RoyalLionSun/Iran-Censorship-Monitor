import { validateRange } from './common.mjs';

function normalizedScope(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('national') || text.includes('countrywide') || text.includes('nationwide')) return 'national';
  if (text.includes('regional') || text.includes('local') || text.includes('province') || text.includes('city')) return 'regional';
  if (text.includes('service') || text.includes('platform') || text.includes('blocking')) return 'service';
  return null;
}

function interval(record) {
  const start = record?.startDate ?? record?.startTime?.slice?.(0, 10) ?? null;
  const end = record?.endDate ?? record?.endTime?.slice?.(0, 10) ?? null;
  return { start, end };
}

function datesOverlap(left, right) {
  const a = interval(left);
  const b = interval(right);
  if (!a.start || !b.start) return false;
  const aEnd = a.end || '9999-12-31';
  const bEnd = b.end || '9999-12-31';
  return a.start <= bEnd && b.start <= aEnd;
}

function stopScope(incident) {
  return normalizedScope(incident?.shutdownExtent) || normalizedScope(incident?.geographicScope) || normalizedScope(incident?.shutdownType);
}

function pulseScope(event) {
  return normalizedScope(event?.type) || normalizedScope(event?.affectedRegions);
}

export function correlateShutdownContext({ accessNow, pulse, since, until }) {
  validateRange(since, until, 120);
  const stopIncidents = accessNow?.ok && Array.isArray(accessNow.incidents) ? accessNow.incidents : [];
  const pulseEvents = pulse?.ok && Array.isArray(pulse.events) ? pulse.events : [];
  const correlations = [];

  for (const stop of stopIncidents) {
    for (const pulseEvent of pulseEvents) {
      if (!datesOverlap(stop, pulseEvent)) continue;
      const stopScopeClass = stopScope(stop);
      const pulseScopeClass = pulseScope(pulseEvent);
      if (!stopScopeClass || !pulseScopeClass || stopScopeClass !== pulseScopeClass) continue;
      correlations.push({
        stopId: stop.id ?? null,
        pulseId: pulseEvent.id ?? null,
        relation: 'temporal_scope_overlap',
        scopeClass: stopScopeClass,
        possibleSameIncident: true,
        automaticMerge: false,
        independentTechnicalVote: false,
        note: 'Candidate correlation only. Temporal/scope overlap does not prove both curated sources describe the same shutdown.',
      });
    }
  }

  correlations.sort((a, b) => String(a.stopId).localeCompare(String(b.stopId)) || String(a.pulseId).localeCompare(String(b.pulseId)));
  const pulseAvailable = pulse?.ok === true && pulse?.status !== 'token_required';
  const stopAvailable = accessNow?.ok === true;
  return {
    ok: true,
    status: stopAvailable && pulseAvailable ? 'complete_context' : (stopAvailable || pulseAvailable ? 'partial_context' : 'no_context'),
    since,
    until,
    stop: { available: stopAvailable, count: stopIncidents.length, datasetThroughYear: accessNow?.datasetThroughYear ?? null },
    pulse: { available: pulseAvailable, configured: pulseAvailable, count: pulseEvents.length },
    correlations,
    possibleSameIncidentCount: correlations.length,
    automaticMergedCount: 0,
    evidenceRole: 'curated-context-correlation',
    independentTechnicalVote: false,
    note: 'STOP and Pulse remain separate provenance records. Correlation is analyst context only; no record is auto-merged and no additional technical vote is created.',
  };
}
