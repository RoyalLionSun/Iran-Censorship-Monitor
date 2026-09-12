import { getLanguage, t } from './i18n.js';

function render(key, variables) {
  return t(key, variables);
}

const patterns = [
  [/^Updated (.+) ago$/, (m) => render('runtime.template.updatedAgo', { age: m[1] })],
  [/^(\d+)\/(\d+) source families observed · assessment votes remain separate$/, (m) => render('runtime.template.sourceFamilies', { active: m[1], total: m[2] })],
  [/^(\d+)\/(\d+) source families observed$/, (m) => render('runtime.template.sourceFamiliesBasic', { active: m[1], total: m[2] })],
  [/^(\d+) allowlisted articles discovered · context only · no sensor vote$/, (m) => render('runtime.template.articles', { count: m[1] })],
  [/^(\d+) updates · (.+)$/, (m) => render('runtime.template.updates', { count: m[1], detail: m[2] })],
  [/^(\d+) UTC days · (\d+) confirmed( · truncated)?$/, (m) => render('runtime.template.utcDays', { days: m[1], confirmed: m[2], suffix: m[3] ? ' · نمونه ناقص' : '' })],
  [/^(\d+) observed · (\d+) samples$/, (m) => render('runtime.template.observedSamples', { observed: m[1], samples: m[2] })],
  [/^(\d+) raw signal series · (.+)$/, (m) => render('runtime.template.rawSeries', { count: m[1], scope: m[2] })],
  [/^(\d+) traffic anomalies · (\d+) outages · (\d+) BGP events$/, (m) => render('runtime.template.radarEvents', { anomalies: m[1], outages: m[2], bgp: m[3] })],
  [/^([\d,]+) bridge users · direct estimate shown above$/, (m) => render('runtime.template.bridgeUsers', { count: m[1] })],
  [/^(\d+) \/ (\d+) RIS peers$/, (m) => render('runtime.template.risPeers', { seen: m[1], total: m[2] })],
  [/^(\d+) rows · (\d+) days$/, (m) => render('runtime.template.rowsDays', { rows: m[1], days: m[2] })],
  [/^([\d.,]+) ms average RTT$/, (m) => render('runtime.template.avgRtt', { value: m[1] })],
  [/^(\d+) measurements · (\d+) confirmed$/, (m) => render('runtime.template.measurementConfirmed', { measurements: m[1], confirmed: m[2] })],
  [/^([\d.,]+)% anomalous OONI rows$/, (m) => render('runtime.template.ooniAnomalous', { rate: m[1] })],
  [/^Traffic anomaly( · .+)?$/, (m) => render('runtime.template.trafficAnomaly', { status: m[1] || '' })],
  [/^BGP hijack event\s*(.*)$/, (m) => render('runtime.template.bgpHijack', { id: m[1] })],
  [/^confidence ([\d.,]+) · (\d+) prefix\(es\)$/, (m) => render('runtime.template.confidencePrefixes', { confidence: m[1], count: m[2] })],
  [/^IODA outage event · (.+)$/, (m) => render('runtime.template.iodaOutage', { source: m[1] })],
  [/^CenAlert event · impact (.+)$/, (m) => render('runtime.template.cenalertImpact', { impact: m[1] })],
  [/^(\d+) day\(s\)$/, (m) => render('runtime.template.dayCount', { count: m[1] })],
  [/^Radar HTTP series · (.+?) · (.+?) · confidence (.+)$/, (m) => render('runtime.template.radarLegend', { scope: m[1], interval: m[2], confidence: m[3] })],
  [/^(.+) latest \/ window median$/, (m) => render('runtime.template.latestMedian', { source: m[1] })],
  [/^reach (.+) · customers (.+) · degree (.+)$/, (m) => render('runtime.template.topology', { reach: m[1], customers: m[2], degree: m[3] })],
  [/^Probes exist, but Built-in Ping (\d+) returned no daily ping-stat buckets in the selected period\.$/, (m) => render('runtime.template.ripeNoPingBuckets', { measurement: m[1] })],
  [/^Dashboard query failed: (.+)$/, (m) => render('runtime.template.dashboardFailure', { message: m[1] })],
  [/^Initialization failed: (.+)$/, (m) => render('runtime.template.initFailure', { message: m[1] })],
  [/^Error: (.+)$/, (m) => render('runtime.template.error', { message: m[1] })],
  [/^Generated (.+)\. RIR inventory is country-scope metadata; routed is a country-level RIPE RIS count, not an ASN-by-ASN routed classification\.$/, (m) => render('context.template.generatedCoverage', { date: m[1] })],
  [/^STALE: older than (.+) hours\. Generated (.+)\. RIR inventory is country-scope metadata; routed is a country-level RIPE RIS count, not an ASN-by-ASN routed classification\.$/, (m) => render('context.template.staleCoverage', { hours: m[1], date: m[2] })],
  [/^STOP context unavailable: (.+)\. No incident comparison is inferred\.$/, (m) => render('context.template.stopUnavailable', { error: m[1] })],
  [/^BridgeDB demand: GLOBAL · not Iran-specific · (.+?)( · latest .+)?\. Global demand is excluded from Iran incident comparison\.$/, (m) => render('context.template.bridgeDemand', { coverage: m[1], latest: m[2] || '' })],
  [/^(\d+) prefixes$/, (m) => getLanguage() === 'fa' ? `${m[1]} پیشوند` : m[0]],
];

export function translateRuntimeText(value) {
  const text = String(value ?? '');
  if (getLanguage() === 'en') return text;
  for (const [pattern, renderer] of patterns) {
    const match = text.match(pattern);
    if (match) return renderer(match);
  }
  return text;
}