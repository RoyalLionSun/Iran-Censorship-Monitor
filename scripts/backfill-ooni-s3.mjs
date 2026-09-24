// Fills the local store with OONI's Iranian measurements from the public raw files, newest
// hour first, and extends the store's covered period back. About 400 MB of downloads and four
// minutes per day of history (September 2026). Safe to stop and run again.
//   node scripts/backfill-ooni-s3.mjs --days 8 [--db var/store/monitor.db]
import { join } from 'node:path';
import { backfillOoniS3 } from '../lib/ooni-raw.mjs';
import { openStore } from '../lib/store.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : fallback; };
const days = Math.max(1, Math.min(Number(option('days', '8')), 400));
const store = openStore(option('db', join(import.meta.dirname, '..', 'var/store/monitor.db')));
const HOUR = 60 * 60 * 1000;
// Continue below what is covered already; otherwise start at the last settled hour.
const covered = Date.parse(store.getMeta('ooni-s3:coveredSince') ?? '');
const to = Number.isFinite(covered) ? covered : Math.floor((Date.now() - 2 * HOUR) / HOUR) * HOUR;
const from = to - days * 24 * HOUR;
console.log(`Backfilling ${new Date(from).toISOString()} → ${new Date(to).toISOString()}`);
const result = await backfillOoniS3(store, {
  from, to,
  onHour: ({ hour, added, bytes }) => { if (hour.endsWith('T00:00:00Z')) console.log(`${hour.slice(0, 10)} done · ${added} measurements · ${(bytes / 1048576).toFixed(0)} MB`); },
});
console.log(JSON.stringify(result));
store.close();
process.exitCode = result.ok ? 0 : 1;
