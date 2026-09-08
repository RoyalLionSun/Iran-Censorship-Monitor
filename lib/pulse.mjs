import { asRecord, fetchJson } from './common.mjs';

const URL = 'https://pulse-api.internetsociety.org/shutdowns';

function tokenState() {
  return { ok: true, source: 'Internet Society Pulse', status: 'token_required', events: [], sourceUrl: URL, note: 'Set INTERNET_SOCIETY_PULSE_API_TOKEN to enable the curated Shutdown Tracker API.' };
}

export function parsePulseShutdowns(payload) {
  const data = Array.isArray(asRecord(payload)?.data) ? payload.data : [];
  return data.filter((raw) => String(asRecord(raw)?.country ?? '').toLowerCase().includes('iran')).map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      country: row.country ?? null,
      startDate: row.start_date ?? null,
      endDate: row.end_date ?? null,
      type: row.type ?? null,
      verificationLevel: row.verification_level ?? null,
      cause: row.cause ?? null,
      affectedRegions: row.affected_regions ?? null,
    };
  });
}

export async function getPulseShutdowns() {
  const token = process.env.INTERNET_SOCIETY_PULSE_API_TOKEN?.trim();
  if (!token) return tokenState();
  const payload = await fetchJson(URL, { headers: { authorization: `Bearer ${token}` }, cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 });
  const events = parsePulseShutdowns(payload);
  return {
    ok: true,
    source: 'Internet Society Pulse',
    status: events.length ? 'observed' : 'no_data',
    events,
    sourceUrl: URL,
    fetchedAt: new Date().toISOString(),
    note: 'Pulse shutdown records are curated contextual incidents with verification levels. They must not be counted as an independent raw technical sensor when their evidence derives from sources already present in this dashboard.',
  };
}
