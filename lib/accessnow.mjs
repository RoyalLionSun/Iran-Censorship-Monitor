import { fetchText, parseNumber, validateRange } from './common.mjs';

const STOP_SHEET_ID = '1DvPAuHNLp5BXGb0nnZDGNoiIwEeu2ogdXEIDvT4Hyfk';
export const ACCESS_NOW_STOP_URL = `https://docs.google.com/spreadsheets/d/${STOP_SHEET_ID}/gviz/tq?tqx=out:csv&headers=1`;
export const ACCESS_NOW_STOP_DATASET_THROUGH_YEAR = 2025;

const REQUIRED_COLUMNS = new Set([
  'start_date', 'country', 'shutdown_type', 'shutdown_extent', 'info_source', 'info_source_link', 'shutdown_status', 'event',
]);

const LINEAGE_DOMAINS = [
  { source: 'OONI', domains: ['ooni.org', 'explorer.ooni.org'] },
  { source: 'Cloudflare Radar', domains: ['radar.cloudflare.com', 'cloudflare.com'] },
  { source: 'IODA', domains: ['ioda.live', 'ioda.inetintel.cc.gatech.edu'] },
  { source: 'M-Lab NDT', domains: ['measurementlab.net'] },
  { source: 'Censored Planet', domains: ['censoredplanet.org'] },
  { source: 'RIPE Atlas', domains: ['atlas.ripe.net'] },
  { source: 'Internet Society Pulse', domains: ['pulse.internetsociety.org'] },
  { source: 'NetBlocks', domains: ['netblocks.org'] },
  { source: 'Miaan / Filterwatch', domains: ['filter.watch', 'miaan.org'] },
];

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text ?? '');

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char === '"') {
      if (quoted && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && input[index + 1] === '\n') index += 1;
      row.push(cell);
      cell = '';
      if (row.some((value) => value !== '')) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }

  if (cell || row.length) {
    row.push(cell);
    if (row.some((value) => value !== '')) rows.push(row);
  }
  if (quoted) throw new Error('Access Now STOP CSV contains an unterminated quoted field.');
  return rows;
}

function parseStopDate(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return text;
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!us) return null;
  const month = Number(us[1]);
  const day = Number(us[2]);
  const year = Number(us[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function triState(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'yes') return true;
  if (normalized === 'no') return false;
  return null;
}

function splitUrls(value) {
  return String(value ?? '').split(';').map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item));
}

function evidenceLineage(urls) {
  const grouped = new Map();
  for (const url of urls) {
    let host;
    try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { continue; }
    for (const entry of LINEAGE_DOMAINS) {
      if (!entry.domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) continue;
      if (!grouped.has(entry.source)) grouped.set(entry.source, []);
      grouped.get(entry.source).push(url);
      break;
    }
  }
  return [...grouped.entries()].map(([source, sourceUrls]) => ({ source, urls: [...new Set(sourceUrls)] }));
}

function stableId(row) {
  const input = [row.startDate, row.country, row.areaName, row.shutdownType, row.shutdownExtent, row.event].join('|');
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `stop-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function iranCountry(value) {
  return /\bIran(?:\s*\(Islamic Republic of\))?\b/i.test(String(value ?? ''));
}

function overlapsWindow(row, since, until) {
  if (!row.startDate || row.startDate > until) return false;
  if (row.endDate) return row.endDate >= since;
  if (String(row.status).toLowerCase() === 'ongoing') return true;
  return row.startDate >= since && row.startDate <= until;
}

function rowObject(headers, values) {
  return Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]));
}

export function parseAccessNowStop(text, { since, until }) {
  validateRange(since, until, 120);
  const matrix = parseCsv(text);
  if (!matrix.length) throw new Error('Access Now STOP CSV returned no rows.');
  const headers = matrix[0].map(normalizeHeader);
  const missing = [...REQUIRED_COLUMNS].filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Access Now STOP schema missing required column(s): ${missing.join(', ')}.`);

  const incidents = [];
  for (const values of matrix.slice(1)) {
    const raw = rowObject(headers, values);
    if (!iranCountry(raw.country)) continue;
    const evidenceUrls = splitUrls(raw.info_source_link);
    const accessNowUrls = splitUrls(raw.an_link);
    const incident = {
      id: null,
      startDateType: raw.start_date_type || null,
      startDate: parseStopDate(raw.start_date),
      endDate: parseStopDate(raw.end_date),
      country: raw.country || null,
      geographicScope: raw.geo_scope || null,
      areaName: raw.area_name || null,
      shutdownType: raw.shutdown_type || null,
      affectedNetwork: raw.affected_network || null,
      shutdownExtent: raw.shutdown_extent || null,
      orderedBy: raw.ordered_by || null,
      decisionMaker: raw.decision_maker || null,
      cause: raw.actual_cause || null,
      causeDetails: raw.actual_cause_details || null,
      primaryEvidenceClass: raw.info_source || null,
      evidenceUrls,
      evidenceLineage: evidenceLineage(evidenceUrls),
      status: raw.shutdown_status || null,
      durationDays: parseNumber(raw.duration),
      governmentJustification: raw.gov_justification || null,
      governmentAcknowledged: triState(raw.gov_ack),
      platforms: {
        facebook: triState(raw.facebook_affected),
        twitterX: triState(raw.twitter_affected),
        whatsapp: triState(raw.whatsapp_affected),
        instagram: triState(raw.instagram_affected),
        telegram: triState(raw.telegram_affected),
        other: raw.other_affected || null,
      },
      smsAffected: triState(raw.sms_affected),
      phoneCallsAffected: triState(raw.phonecall_affected),
      telcosInvolved: raw.telcos_involved || null,
      electionRelated: triState(raw.election),
      violenceReported: triState(raw.violence),
      humanRightsAbuseReported: triState(raw.hr_abuse_reported),
      usersTargeted: raw.users_targeted || null,
      usersTargetDetail: raw.users_target_detail || null,
      event: raw.event || null,
      accessNowUrls,
      region: raw.region || null,
      evidenceRole: 'curated-contextual-incident',
      independentTechnicalVote: false,
    };
    incident.id = stableId(incident);
    if (overlapsWindow(incident, since, until)) incidents.push(incident);
  }

  incidents.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)) || a.id.localeCompare(b.id));
  return incidents;
}

export async function getAccessNowStopIncidents({ since, until }) {
  validateRange(since, until, 120);
  const text = await fetchText(ACCESS_NOW_STOP_URL, { cacheTtlMs: 6 * 60 * 60_000, timeoutMs: 25_000, accept: 'text/csv,text/plain;q=0.9,*/*;q=0.5' });
  const incidents = parseAccessNowStop(text, { since, until });
  const lineageCounts = new Map();
  for (const incident of incidents) {
    for (const lineage of incident.evidenceLineage) lineageCounts.set(lineage.source, (lineageCounts.get(lineage.source) || 0) + 1);
  }
  const selectedAfterPublishedCoverage = Number(since.slice(0, 4)) > ACCESS_NOW_STOP_DATASET_THROUGH_YEAR;
  const extendsBeyondPublishedCoverage = Number(until.slice(0, 4)) > ACCESS_NOW_STOP_DATASET_THROUGH_YEAR;
  return {
    ok: true,
    source: 'Access Now #KeepItOn / STOP',
    status: incidents.length ? (selectedAfterPublishedCoverage ? 'historical_context_only' : 'observed') : 'no_data',
    country: 'IR',
    since,
    until,
    datasetThroughYear: ACCESS_NOW_STOP_DATASET_THROUGH_YEAR,
    totalMatched: incidents.length,
    incidents,
    evidenceLineageSummary: [...lineageCounts.entries()].map(([source, incidentCount]) => ({ source, incidentCount })).sort((a, b) => b.incidentCount - a.incidentCount || a.source.localeCompare(b.source)),
    sourceUrl: ACCESS_NOW_STOP_URL,
    dashboardUrl: 'https://www.accessnow.org/keepiton-data-dashboard/',
    methodologyUrl: 'https://www.accessnow.org/guide/shutdown-tracker-optimization-project/',
    coverageWarning: extendsBeyondPublishedCoverage ? 'The published STOP dataset currently covers shutdown records through 2025. Ongoing historical records can overlap later selected windows, but this response must not be treated as complete coverage of newly starting 2026 incidents.' : null,
    fetchedAt: new Date().toISOString(),
    note: 'STOP is a manually verified contextual shutdown dataset assembled from technical measurements, civil-society reports, media and other evidence. It is never counted as an independent technical sensor vote; evidenceLineage identifies links to already integrated measurement sources where possible.',
  };
}
