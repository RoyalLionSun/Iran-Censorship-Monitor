// One controlled round of independent checks from probes on Iranian networks, for a first test
// or a manual check: starts the measurements, waits for the results, stores and prints them.
// Needs ACTIVE_MEASUREMENTS_ENABLED=true (the owner's ethics decision) and, for RIPE Atlas, a key.
//   node scripts/active-round.mjs --source ripe-atlas --hosts www.instagram.com,www.youtube.com --probes 5
import { join } from 'node:path';
import { ACTIVE_HOSTS, activeHttp, atlasPath, collectActivePath, globalpingPath } from '../lib/active-collector.mjs';
import { loadEnvFile } from '../lib/common.mjs';
import { iranRegisteredAsns } from '../lib/ooni.mjs';
import { openStore } from '../lib/store.mjs';

const root = join(import.meta.dirname, '..');
await loadEnvFile(join(root, '.env'));
const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
if (process.env.ACTIVE_MEASUREMENTS_ENABLED !== 'true') {
  console.error('Active measurements are off. Set ACTIVE_MEASUREMENTS_ENABLED=true only after deciding the ethics question (DATA_RESILIENCE_PLAN.md).');
  process.exit(2);
}
const source = option('source', 'ripe-atlas');
const hosts = option('hosts', ACTIVE_HOSTS.join(',')).split(',').map((host) => host.trim()).filter(Boolean);
const probes = Math.max(1, Math.min(Number(option('probes', '5')), 20));
const key = process.env.RIPE_ATLAS_API_KEY?.trim();
if (source === 'ripe-atlas' && !key) { console.error('RIPE_ATLAS_API_KEY is missing in .env.'); process.exit(2); }
const path = source === 'ripe-atlas' ? atlasPath({ http: activeHttp, key, hosts, probeLimit: probes })
  : globalpingPath({ http: activeHttp, token: process.env.GLOBALPING_API_TOKEN?.trim() ?? '', hosts, limit: probes });

const store = openStore(join(root, 'var/store/monitor.db'));
const iranAsns = await iranRegisteredAsns();
const started = await collectActivePath(store, source, path, { iranAsns, everyHours: 0 });
console.log('started', started);
if (!started.ok) process.exit(1);
// One-off Atlas measurements settle within about half an hour; Globalping within a minute.
const waitMs = source === 'ripe-atlas' ? 31 * 60_000 : 60_000;
console.log(`waiting ${Math.round(waitMs / 60_000)} min for results…`);
await new Promise((resolve) => setTimeout(resolve, waitMs));
const read = await collectActivePath(store, source, path, { iranAsns, everyHours: 1e9 });
console.log('collected', read);
const today = new Date().toISOString().slice(0, 10);
console.table(store.activeChecks({ hosts, since: today, until: today }).filter((row) => row.source === source));
store.close();
