import { buildRouteViewsBrokerUrl, parseRouteViewsBrokerPayload } from '../lib/bgpstream.mjs';

const controller = new AbortController();
const timer = setTimeout(() => controller.abort('timeout'), 15_000);
try {
  const url = buildRouteViewsBrokerUrl();
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'iran-censorship-monitor-v1.2' },
    signal: controller.signal,
  });
  if (!response.ok) throw new Error(`CAIDA BGPStream broker HTTP ${response.status} ${response.statusText}`);
  const payload = await response.json();
  const parsed = parseRouteViewsBrokerPayload(payload);
  if (parsed.status !== 'observed') {
    const allResources = Array.isArray(payload.data?.resources) ? payload.data.resources : [];
    const projects = [...new Set(allResources.map((resource) => resource?.project).filter(Boolean))].sort();
    const interval = new URL(url).searchParams.get('intervals[]');
    throw new Error(`CAIDA BGPStream broker returned no current Route Views stream resource for live interval ${interval}; total resources=${allResources.length}; projects=${projects.join(',') || 'none'}.`);
  }
  const transports = [...new Set(parsed.resources.map((resource) => resource.transport).filter(Boolean))].sort();
  const formats = [...new Set(parsed.resources.map((resource) => resource.format).filter(Boolean))].sort();
  console.log(`PASS CAIDA BGPStream broker · Route Views stream · ${parsed.resourceCount} resource(s) · transport ${transports.join(',') || 'unknown'} · format ${formats.join(',') || 'unknown'}`);
} finally {
  clearTimeout(timer);
}
