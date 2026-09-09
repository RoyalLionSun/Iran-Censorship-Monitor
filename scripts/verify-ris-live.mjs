import { fetchJson } from '../lib/common.mjs';
import { buildRipeStatUrls, parseAnnouncedPrefixes } from '../lib/ripestat.mjs';
import { buildRisLiveStreamRequest } from '../lib/rislive.mjs';

const ASN = 'AS58224';
const now = new Date();
const sinceDate = new Date(now);
sinceDate.setUTCDate(sinceDate.getUTCDate() - 7);
const since = sinceDate.toISOString().slice(0, 10);
const until = now.toISOString().slice(0, 10);
const urls = buildRipeStatUrls({ asn: ASN, since, until });
const payload = await fetchJson(urls.announcedPrefixes, { timeoutMs: 20_000 });
const prefixes = parseAnnouncedPrefixes(payload).map((row) => row.prefix).filter(Boolean);
if (!prefixes.length) throw new Error(`RIS Live acceptance cannot resolve a current announced prefix for ${ASN}.`);

// Acceptance deliberately uses one RIPEstat-derived prefix. This validates the public
// stream/subscription protocol only; it is not a partial production collector scope.
const request = buildRisLiveStreamRequest([prefixes[0]], { maxPrefixes: 1 });
const controller = new AbortController();
const timer = setTimeout(() => controller.abort('RIS Live acceptance timeout'), 10_000);
try {
  const response = await fetch(request.url, { headers: request.headers, signal: controller.signal });
  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    throw new Error(`RIS Live subscription rejected: HTTP ${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  console.log(`PASS RIPE RIS Live passive subscription handshake · ${ASN} · ${prefixes[0]} · HTTP ${response.status}`);
  await response.body.cancel().catch(() => {});
} finally {
  clearTimeout(timer);
  controller.abort();
}
