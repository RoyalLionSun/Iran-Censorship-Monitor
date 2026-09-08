import { asRecord, fetchJson, normalizeAsn, parseNumber, validateRange } from './common.mjs';

const BASE = 'https://www.ihr.live/ihr/api/hegemony/';

function dateMinus(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export function buildIhrHegemonyUrl({ asn, since, until }) {
  validateRange(since, until, 120);
  const normalized = normalizeAsn(asn);
  if (!normalized) throw new Error('IHR dependency analysis requires a selected ASN.');
  const number = normalized.slice(2);
  const rangeStart = since > dateMinus(until, 6) ? since : dateMinus(until, 6);
  const params = new URLSearchParams({
    originasn: number,
    af: '4',
    timebin__gte: `${rangeStart}T00:00:00Z`,
    timebin__lte: `${until}T23:59:59Z`,
    ordering: '-hege',
  });
  return { url: `${BASE}?${params}`, asn: normalized, effectiveSince: rangeStart, until };
}

export function parseIhrHegemony(payload) {
  const root = asRecord(payload) ?? {};
  const results = Array.isArray(root.results) ? root.results : [];
  const rows = results.map((raw) => {
    const row = asRecord(raw) ?? {};
    return {
      timebin: row.timebin ?? null,
      originAsn: parseNumber(row.originasn),
      transitAsn: parseNumber(row.asn),
      hegemony: parseNumber(row.hege),
      addressFamily: parseNumber(row.af),
      transitName: row.asn_name ?? null,
      originName: row.originasn_name ?? null,
    };
  }).filter((row) => row.transitAsn !== null && row.hegemony !== null);
  const latestTimebin = rows.map((row) => row.timebin).filter(Boolean).sort().at(-1) ?? null;
  const latest = latestTimebin ? rows.filter((row) => row.timebin === latestTimebin) : rows;
  latest.sort((a, b) => b.hegemony - a.hegemony);
  return { count: parseNumber(root.count) ?? rows.length, latestTimebin, dependencies: latest.slice(0, 30) };
}

export async function getIhrDependencies(input) {
  const built = buildIhrHegemonyUrl(input);
  const payload = await fetchJson(built.url, { cacheTtlMs: 6 * 60 * 60 * 1000, timeoutMs: 20_000 });
  const parsed = parseIhrHegemony(payload);
  return {
    ok: true,
    source: 'Internet Health Report',
    status: parsed.dependencies.length ? 'observed' : 'no_data',
    asn: built.asn,
    requested: { since: input.since, until: input.until },
    effective: { since: built.effectiveSince, until: built.until },
    ...parsed,
    sourceUrl: built.url,
    fetchedAt: new Date().toISOString(),
    note: 'AS Hegemony estimates how frequently transit ASes appear on BGP paths toward the selected origin ASN. It is dependency/chokepoint context, not a censorship signal.',
  };
}
