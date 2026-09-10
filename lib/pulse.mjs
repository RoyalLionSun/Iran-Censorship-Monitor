import { asRecord, fetchJson, validateRange } from './common.mjs';

export const INTERNET_SOCIETY_PULSE_SHUTDOWNS_URL = 'https://pulse-api.internetsociety.org/shutdowns';
export const INTERNET_SOCIETY_PULSE_METHODOLOGY_URL = 'https://pulse.internetsociety.org/en/shutdowns/';

function tokenState({ since, until }) {
  return {
    ok: true,
    source: 'Internet Society Pulse',
    status: 'token_required',
    country: 'IR',
    since,
    until,
    totalMatched: 0,
    events: [],
    sourceUrl: INTERNET_SOCIETY_PULSE_SHUTDOWNS_URL,
    methodologyUrl: INTERNET_SOCIETY_PULSE_METHODOLOGY_URL,
    evidenceRole: 'curated-contextual-incident',
    independentTechnicalVote: false,
    note: 'Set INTERNET_SOCIETY_PULSE_API_TOKEN to enable the curated Shutdowns API. Pulse remains contextual intelligence and contributes zero independent technical votes.',
  };
}

function isIranCountry(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return text === 'ir' || text === 'iran' || text === 'iran (islamic republic of)';
}

function parsePulseTimestamp(value, field, { required = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) throw new Error(`Internet Society Pulse Iran record is missing ${field}.`);
    return null;
  }
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) throw new Error(`Internet Society Pulse Iran record has invalid ${field}.`);
  return new Date(timestamp).toISOString();
}

function overlapsWindow(event, since, until) {
  if (event.startDate > until) return false;
  if (!event.endDate) return true;
  return event.endDate >= since;
}

function stableId(event) {
  const input = [event.startTime, event.endTime, event.country, event.type, event.cause, event.affectedRegions].join('|');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `pulse-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function parsePulseShutdowns(payload, { since, until }) {
  validateRange(since, until, 120);
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.data)) throw new Error('Internet Society Pulse schema missing data array.');

  const byId = new Map();
  for (const raw of root.data) {
    const row = asRecord(raw);
    if (!row || !isIranCountry(row.country)) continue;
    const startTime = parsePulseTimestamp(row.start_date, 'start_date', { required: true });
    const endTime = parsePulseTimestamp(row.end_date, 'end_date');
    if (endTime && endTime < startTime) throw new Error('Internet Society Pulse Iran record ends before it starts.');
    const event = {
      id: null,
      country: String(row.country).trim(),
      startTime,
      endTime,
      startDate: startTime.slice(0, 10),
      endDate: endTime?.slice(0, 10) ?? null,
      type: row.type == null ? null : String(row.type).trim() || null,
      verificationLevel: row.verification_level == null ? null : String(row.verification_level).trim() || null,
      cause: row.cause == null ? null : String(row.cause).trim() || null,
      affectedRegions: row.affected_regions == null ? null : String(row.affected_regions).trim() || null,
      evidenceRole: 'curated-contextual-incident',
      independentTechnicalVote: false,
    };
    event.id = stableId(event);
    if (overlapsWindow(event, since, until)) byId.set(event.id, event);
  }

  return [...byId.values()].sort((a, b) => b.startTime.localeCompare(a.startTime) || a.id.localeCompare(b.id));
}

export async function getPulseShutdowns({ since, until }) {
  validateRange(since, until, 120);
  const token = process.env.INTERNET_SOCIETY_PULSE_API_TOKEN?.trim();
  if (!token) return tokenState({ since, until });
  const payload = await fetchJson(INTERNET_SOCIETY_PULSE_SHUTDOWNS_URL, {
    headers: { authorization: `Bearer ${token}` },
    cacheTtlMs: 6 * 60 * 60 * 1000,
    timeoutMs: 20_000,
  });
  const events = parsePulseShutdowns(payload, { since, until });
  return {
    ok: true,
    source: 'Internet Society Pulse',
    status: events.length ? 'observed' : 'no_data',
    country: 'IR',
    since,
    until,
    totalMatched: events.length,
    events,
    sourceUrl: INTERNET_SOCIETY_PULSE_SHUTDOWNS_URL,
    methodologyUrl: INTERNET_SOCIETY_PULSE_METHODOLOGY_URL,
    fetchedAt: new Date().toISOString(),
    evidenceRole: 'curated-contextual-incident',
    independentTechnicalVote: false,
    note: 'Pulse shutdown records are curated contextual incidents with verification levels. They are not an independent raw technical sensor and must not double-count underlying OONI, Radar, IODA or other root evidence.',
  };
}
