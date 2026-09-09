export const OOKLA_OPEN_DATA_POLICY = Object.freeze({
  source: 'Speedtest by Ookla Global Fixed and Mobile Network Performance Maps',
  sourceFamily: 'ookla-open-data',
  evidenceRole: 'performance-context',
  independentCensorshipVote: false,
  intentionalThrottlingInference: false,
  countryAggregationRequired: true,
  directDashboardDownloadAllowed: false,
  rawTilePublicationAllowed: false,
  provincePublicationAllowed: false,
  individualLocationPublicationAllowed: false,
  ingestionImplemented: false,
  dashboardPublicationAllowed: false,
});

const TYPES = new Set(['fixed', 'mobile']);
const FORMATS = new Set(['parquet', 'shapefiles']);
const QUARTER_START = Object.freeze({ 1: '01-01', 2: '04-01', 3: '07-01', 4: '10-01' });
const QUARTER_END_MONTH = Object.freeze({ 1: 3, 2: 6, 3: 9, 4: 12 });

function integer(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer.`);
  return parsed;
}

function validateYear(year) {
  const value = integer(year, 'year');
  if (value < 2019 || value > 2100) throw new Error('year is outside the supported dataset era.');
  return value;
}

function validateQuarter(quarter) {
  const value = integer(quarter, 'quarter');
  if (!Object.hasOwn(QUARTER_START, value)) throw new Error('quarter must be 1, 2, 3 or 4.');
  return value;
}

function validateType(type) {
  const value = String(type || '').toLowerCase();
  if (!TYPES.has(value)) throw new Error('type must be fixed or mobile.');
  return value;
}

function validateFormat(format) {
  const value = String(format || '').toLowerCase();
  if (!FORMATS.has(value)) throw new Error('format must be parquet or shapefiles.');
  return value;
}

export function quarterEndExclusive(year, quarter) {
  const y = validateYear(year);
  const q = validateQuarter(quarter);
  if (q === 4) return new Date(Date.UTC(y + 1, 0, 1));
  return new Date(Date.UTC(y, QUARTER_END_MONTH[q], 1));
}

export function isCompletedOoklaQuarter({ year, quarter, now = new Date() }) {
  const end = quarterEndExclusive(year, quarter);
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(reference.getTime())) throw new Error('now must be a valid date.');
  return reference.getTime() >= end.getTime();
}

export function latestCompletedOoklaQuarter(now = new Date()) {
  const reference = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(reference.getTime())) throw new Error('now must be a valid date.');
  let year = reference.getUTCFullYear();
  let quarter = Math.floor(reference.getUTCMonth() / 3) + 1;
  if (!isCompletedOoklaQuarter({ year, quarter, now: reference })) {
    quarter -= 1;
    if (quarter === 0) {
      year -= 1;
      quarter = 4;
    }
  }
  if (year < 2019) throw new Error('No completed Ookla Open Data quarter is available for this date.');
  return { year, quarter };
}

export function buildOoklaQuarterObject({ year, quarter, type, format = 'parquet', requireCompleted = true, now = new Date() }) {
  const y = validateYear(year);
  const q = validateQuarter(quarter);
  const networkType = validateType(type);
  const fileFormat = validateFormat(format);
  if (requireCompleted && !isCompletedOoklaQuarter({ year: y, quarter: q, now })) {
    throw new Error('Ookla quarter is not complete; partial-quarter publication is not allowed.');
  }
  const start = `${y}-${QUARTER_START[q]}`;
  const extension = fileFormat === 'parquet' ? 'parquet' : 'zip';
  const filename = `${start}_performance_${networkType}_tiles.${extension}`;
  const key = `${fileFormat}/performance/type=${networkType}/year=${y}/quarter=${q}/${filename}`;
  return {
    year: y,
    quarter: q,
    type: networkType,
    format: fileFormat,
    periodStart: start,
    objectKey: key,
    s3Uri: `s3://ookla-open-data/${key}`,
    httpsUrl: `https://ookla-open-data.s3.amazonaws.com/${key}`,
    ...OOKLA_OPEN_DATA_POLICY,
  };
}

export function ooklaIranAggregationReadiness({ deterministicCountryFilter = false, boundedProcessing = false, aggregateOnly = false } = {}) {
  const missing = [];
  if (!deterministicCountryFilter) missing.push('deterministic_country_filter');
  if (!boundedProcessing) missing.push('bounded_processing');
  if (!aggregateOnly) missing.push('aggregate_only_output');
  return {
    source: OOKLA_OPEN_DATA_POLICY.source,
    country: 'IR',
    evidenceRole: OOKLA_OPEN_DATA_POLICY.evidenceRole,
    independentCensorshipVote: false,
    intentionalThrottlingInference: false,
    repositoryContractReady: missing.length === 0,
    ingestionImplemented: false,
    dashboardPublicationAllowed: false,
    missing,
    note: 'Repository readiness is not a performance measurement. Iran values remain unpublished until a real deterministic country aggregation pipeline is implemented and validated.',
  };
}
