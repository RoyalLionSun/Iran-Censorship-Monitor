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
  if (parsed.status !== 'observed') throw new Error('CAIDA BGPStream broker returned no current Route Views stream resource.');
  console.log(`PASS CAIDA BGPStream broker · Route Views stream · ${parsed.resourceCount} resource(s)`);
} finally {
  clearTimeout(timer);
}
