import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRadarSignals } from '../lib/radar.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const envPath = join(root, '.env');
if (existsSync(envPath)) {
  const content = await readFile(envPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

if (!process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim()) {
  console.error('Radar token is not configured in CLOUDFLARE_RADAR_API_TOKEN.');
  process.exit(2);
}

const until = new Date().toISOString().slice(0, 10);
const sinceDate = new Date(`${until}T00:00:00Z`);
sinceDate.setUTCDate(sinceDate.getUTCDate() - 1);
const since = sinceDate.toISOString().slice(0, 10);

const result = await getRadarSignals({ asn: 'AS58224', since, until });
const summary = {
  source: result.source,
  status: result.status,
  scope: result.asn,
  range: { since, until },
  traffic: { status: result.traffic?.status, points: result.traffic?.series?.length ?? 0, confidenceLevel: result.traffic?.confidenceLevel ?? null, error: result.traffic?.error ?? null },
  outages: { status: result.outages?.status, count: result.outages?.annotations?.length ?? 0, error: result.outages?.error ?? null },
  bgp: { status: result.bgp?.status, count: result.bgp?.events?.length ?? 0, error: result.bgp?.error ?? null },
  trafficAnomalies: { status: result.trafficAnomalies?.status, count: result.trafficAnomalies?.events?.length ?? 0, error: result.trafficAnomalies?.error ?? null },
};
console.log(JSON.stringify(summary, null, 2));
if (result.status === 'error') process.exitCode = 1;
