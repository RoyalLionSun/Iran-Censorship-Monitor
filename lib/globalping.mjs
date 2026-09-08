import { isIP } from 'node:net';
import { timingSafeEqual } from 'node:crypto';
import { asRecord, fetchJson, normalizeAsn, parseNumber } from './common.mjs';

const API = 'https://api.globalping.io/v1';
const ALLOWED_TYPES = new Set(['ping', 'traceroute', 'mtr', 'dns', 'http']);
const MAX_PROBES = 5;
const activeRuns = [];

function upstreamHeaders() {
  const token = process.env.GLOBALPING_API_TOKEN?.trim();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export function parseGlobalpingProbes(payload, selectedAsn = '') {
  const normalizedAsn = normalizeAsn(selectedAsn);
  const expected = normalizedAsn ? Number(normalizedAsn.slice(2)) : null;
  const probes = Array.isArray(payload) ? payload : [];
  return probes.map((raw) => {
    const item = asRecord(raw) ?? {};
    const loc = asRecord(item.location) ?? {};
    return {
      version: item.version ?? null,
      country: loc.country ?? null,
      city: loc.city ?? null,
      region: loc.region ?? null,
      asn: parseNumber(loc.asn),
      network: loc.network ?? null,
      latitude: parseNumber(loc.latitude),
      longitude: parseNumber(loc.longitude),
      tags: Array.isArray(item.tags) ? item.tags : [],
      resolvers: Array.isArray(item.resolvers) ? item.resolvers : [],
    };
  }).filter((probe) => probe.country === 'IR' && (expected === null || probe.asn === expected));
}

export async function getGlobalpingIranProbes({ asn = '' } = {}) {
  const sourceUrl = `${API}/probes`;
  const payload = await fetchJson(sourceUrl, { headers: upstreamHeaders(), cacheTtlMs: 120_000 });
  const probes = parseGlobalpingProbes(payload, asn);
  const byAsn = new Map();
  for (const probe of probes) {
    const key = probe.asn ? `AS${probe.asn}` : 'unknown';
    const row = byAsn.get(key) ?? { asn: key, network: probe.network, probes: 0, cities: new Set(), eyeball: 0, datacenter: 0 };
    row.probes += 1;
    if (probe.city) row.cities.add(probe.city);
    if (probe.tags.some((tag) => /eyeball/i.test(tag))) row.eyeball += 1;
    if (probe.tags.some((tag) => /datacenter/i.test(tag))) row.datacenter += 1;
    byAsn.set(key, row);
  }
  return {
    ok: true,
    source: 'Globalping',
    status: probes.length ? 'observed' : 'no_data',
    country: 'IR',
    asn: normalizeAsn(asn) || null,
    fetchedAt: new Date().toISOString(),
    probeCount: probes.length,
    probes,
    networks: [...byAsn.values()].map((row) => ({ ...row, cities: [...row.cities].sort() })).sort((a, b) => b.probes - a.probes),
    sourceUrl,
    note: 'Probe inventory is passive discovery of currently online Globalping probes. Presence or absence of probes is not itself a censorship signal.',
  };
}

function parseIpv4(ip) {
  return ip.split('.').map(Number);
}

function isForbiddenIpv4(ip) {
  const [a, b] = parseIpv4(ip);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && ip.startsWith('192.0.2.')) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && ip.startsWith('203.0.113.')) || a === 255;
}

function isForbiddenIpv6(ip) {
  const value = ip.toLowerCase();
  return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd') ||
    /^fe[89ab]/.test(value) || value.startsWith('2001:db8:') || value.startsWith('::ffff:127.') || value.startsWith('::ffff:10.');
}

export function validateGlobalpingTarget(target, type = 'ping') {
  const testType = String(type).toLowerCase();
  if (!ALLOWED_TYPES.has(testType)) throw new Error('Unsupported Globalping measurement type.');
  let value = String(target ?? '').trim();
  if (!value || value.length > 253) throw new Error('Globalping target is required and must be <=253 characters.');
  let hostname = value;
  if (/^https?:\/\//i.test(value)) {
    const url = new URL(value);
    if (url.username || url.password) throw new Error('Credentials in measurement targets are not allowed.');
    hostname = url.hostname;
    if (testType !== 'http') value = hostname;
  } else if (testType === 'http') {
    if (/^[a-z][a-z0-9+.-]*:/i.test(value)) throw new Error('HTTP target must use HTTP or HTTPS.');
    value = `https://${value}`;
    hostname = new URL(value).hostname;
  }
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal') || lower.endsWith('.lan')) {
    throw new Error('Private/local measurement targets are not allowed.');
  }
  const ipVersion = isIP(lower);
  if ((ipVersion === 4 && isForbiddenIpv4(lower)) || (ipVersion === 6 && isForbiddenIpv6(lower))) {
    throw new Error('Private, reserved, or non-routable measurement targets are not allowed.');
  }
  return { type: testType, target: value, hostname: lower };
}

export function buildGlobalpingMeasurement({ type, target, asn = '', limit = 3 }) {
  const validated = validateGlobalpingTarget(target, type);
  const normalizedAsn = normalizeAsn(asn);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 1, MAX_PROBES));
  const location = { country: 'IR', limit: safeLimit };
  if (normalizedAsn) location.asn = Number(normalizedAsn.slice(2));
  return {
    type: validated.type,
    target: validated.target,
    limit: safeLimit,
    locations: [location],
    measurementOptions: validated.type === 'ping' ? { packets: 3 } : undefined,
  };
}

export function authorizeGlobalpingControl(provided) {
  if (process.env.GLOBALPING_ACTIVE_ENABLED !== 'true') return { ok: false, status: 403, error: 'Active Globalping measurements are disabled.' };
  const expected = process.env.GLOBALPING_CONTROL_KEY?.trim();
  if (!expected) return { ok: false, status: 503, error: 'GLOBALPING_CONTROL_KEY is not configured.' };
  const got = String(provided ?? '');
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return ok ? { ok: true } : { ok: false, status: 401, error: 'Invalid Globalping control key.' };
}

export function globalpingRateLimit(now = Date.now()) {
  const hourAgo = now - 3_600_000;
  while (activeRuns.length && activeRuns[0] < hourAgo) activeRuns.shift();
  const max = Math.max(1, Math.min(Number(process.env.GLOBALPING_SERVER_RUNS_PER_HOUR || 10), 30));
  if (activeRuns.length >= max) return { ok: false, retryAfterSeconds: Math.ceil((activeRuns[0] + 3_600_000 - now) / 1000), remaining: 0, limit: max };
  activeRuns.push(now);
  return { ok: true, remaining: max - activeRuns.length, limit: max };
}

async function requestJson(url, { method = 'GET', body = null } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Iran-Censorship-Monitor/1.1', ...upstreamHeaders() },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(payload).slice(0, 300)}`);
    return payload;
  } finally { clearTimeout(timer); }
}

export async function createGlobalpingMeasurement(input) {
  const request = buildGlobalpingMeasurement(input);
  const created = await requestJson(`${API}/measurements`, { method: 'POST', body: request });
  const id = typeof created.id === 'string' ? created.id : null;
  if (!id) throw new Error('Globalping did not return a measurement ID.');
  return { ok: true, source: 'Globalping', status: 'created', id, probesCount: parseNumber(created.probesCount), request, resultUrl: `${API}/measurements/${encodeURIComponent(id)}` };
}

export async function getGlobalpingMeasurement(id) {
  if (!/^[A-Za-z0-9_-]{4,100}$/.test(String(id ?? ''))) throw new Error('Invalid Globalping measurement ID.');
  const payload = await requestJson(`${API}/measurements/${encodeURIComponent(id)}`);
  return { ok: true, source: 'Globalping', ...payload };
}
