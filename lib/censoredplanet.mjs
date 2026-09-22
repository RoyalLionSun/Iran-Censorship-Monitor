import { asRecord, parseNumber, validateRange } from './common.mjs';

const ENDPOINT = 'https://data.censoredplanet.org/query';

export function buildCensoredPlanetRequest({ since, until }) {
  validateRange(since, until, 120);
  const query = `query IranCensorship($range: DateRange!, $country: String!) {
    interferenceRateByCountry(range: $range) { country unexpectedRate }
    cenalertTimeseries(range: $range, country: $country) { value date country }
    cenalertEvents(range: $range, country: $country) { country startDate endDate peak impact cause reportedBy }
  }`;
  // The API rejects country names: "country must be a 2-character ISO country code".
  return { query, variables: { range: { startDate: since, endDate: until }, country: 'IR' } };
}

export function parseCensoredPlanet(payload) {
  const root = asRecord(payload) ?? {};
  const data = asRecord(root.data) ?? {};
  const errors = Array.isArray(root.errors) ? root.errors.map((err) => asRecord(err)?.message ?? String(err)).slice(0, 5) : [];
  const rates = Array.isArray(data.interferenceRateByCountry) ? data.interferenceRateByCountry : [];
  const iranRateRaw = rates.find((row) => {
    const country = String(asRecord(row)?.country ?? '').toLowerCase();
    return country === 'iran' || country.includes('iran, islamic') || country.includes('islamic republic of iran');
  });
  const iranRate = iranRateRaw ? parseNumber(asRecord(iranRateRaw)?.unexpectedRate) : null;
  const timeseries = (Array.isArray(data.cenalertTimeseries) ? data.cenalertTimeseries : []).map((raw) => {
    const row = asRecord(raw) ?? {};
    return { date: row.date ?? null, country: row.country ?? null, value: parseNumber(row.value) };
  }).filter((row) => row.date && row.value !== null);
  const events = (Array.isArray(data.cenalertEvents) ? data.cenalertEvents : []).map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      country: row.country ?? null,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      peak: row.peak ?? null,
      impact: parseNumber(row.impact),
      cause: row.cause ?? null,
      reportedBy: row.reportedBy ?? null,
    };
  });
  return { iranUnexpectedRate: iranRate, timeseries, events, partialErrors: errors };
}

async function postGraphql(body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Iran-Censorship-Monitor/1.1' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return payload;
  } finally { clearTimeout(timer); }
}

export async function getCensoredPlanetSignals({ since, until }) {
  const body = buildCensoredPlanetRequest({ since, until });
  const payload = await postGraphql(body);
  const parsed = parseCensoredPlanet(payload);
  return {
    ok: true,
    source: 'Censored Planet',
    status: parsed.iranUnexpectedRate !== null || parsed.timeseries.length || parsed.events.length ? 'observed' : (parsed.partialErrors.length ? 'partial' : 'no_data'),
    country: 'IR',
    since,
    until,
    fetchedAt: new Date().toISOString(),
    ...parsed,
    sourceUrl: ENDPOINT,
    note: 'Censored Planet uses remote measurement methods that complement OONI. Unexpected responses and CenAlert anomalies are evidence for investigation, not standalone proof of censorship; control failures must not be treated as blocking.',
  };
}
