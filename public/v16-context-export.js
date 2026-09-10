export function buildV16ShutdownContextExportRows(intelligence) {
  const rows = [];
  const pulse = intelligence?.pulse;
  if (pulse) {
    const status = pulse.ok === false ? 'error' : (pulse.status || 'unknown');
    const matched = pulse.status === 'token_required' ? 'not_inferred' : (pulse.totalMatched ?? 'unknown');
    rows.push([
      'Internet Society Pulse', 'IR', 'shutdown_context_status', '', status, 'status',
      `matched=${matched} · curated context only · independentTechnicalVote=false`,
    ]);
    if (pulse.ok === true && pulse.status !== 'token_required') {
      for (const event of pulse.events || []) {
        rows.push([
          'Internet Society Pulse', 'IR', 'shutdown_incident', event.startTime || event.startDate || '',
          [event.type, event.affectedRegions].filter(Boolean).join(' / '), 'context event',
          `end=${event.endTime || event.endDate || 'ongoing/open-ended'} · verification=${event.verificationLevel || 'unknown'} · cause=${event.cause || 'unknown'} · id=${event.id || 'unknown'} · independentTechnicalVote=false`,
        ]);
      }
    }
  }

  const context = intelligence?.shutdownContext;
  if (context) {
    rows.push([
      'Access Now STOP ↔ Internet Society Pulse', 'IR', 'correlation_status', '', context.status || 'unknown', 'status',
      `possibleSameIncidentCount=${context.possibleSameIncidentCount ?? 'unknown'} · automaticMergedCount=${context.automaticMergedCount ?? 'unknown'} · analyst context only · independentTechnicalVote=false`,
    ]);
    if (context.ok === true) {
      for (const correlation of context.correlations || []) {
        rows.push([
          'Access Now STOP ↔ Internet Society Pulse', 'IR', 'possible_same_incident', '',
          `${correlation.stopId || 'unknown'} ↔ ${correlation.pulseId || 'unknown'}`, 'analyst candidate',
          `scope=${correlation.scopeClass || 'unknown'} · relation=${correlation.relation || 'unknown'} · possibleSameIncident=${correlation.possibleSameIncident === true} · automaticMerge=${correlation.automaticMerge === true} · independentTechnicalVote=false`,
        ]);
      }
    }
  }

  return rows;
}
