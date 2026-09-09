import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createInterface } from 'node:readline';
import {
  BGPSTREAM_ROUTEVIEWS_DEFAULT_RETENTION_DAYS,
  BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES,
  BGPSTREAM_ROUTEVIEWS_MAX_RETENTION_DAYS,
  buildRouteViewsBgpReaderArgs,
  parseRouteViewsBgpReaderLine,
  resolveRouteViewsPrefixScope,
} from '../lib/bgpstream.mjs';
import { reconnectDelayMs } from '../lib/rislive.mjs';
import { normalizeAsn } from '../lib/common.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const registeredAsns = JSON.parse(await readFile(join(root, 'data/asns.json'), 'utf8'));
const allowed = new Map(registeredAsns.map((row) => [row.asn, row]));

function parseArgs(argv) {
  const options = {
    asn: '',
    bgpreader: 'bgpreader',
    outputDir: join(root, 'var', 'bgpstream-routeviews'),
    prefixFile: '',
    retentionDays: BGPSTREAM_ROUTEVIEWS_DEFAULT_RETENTION_DAYS,
    maxPrefixes: BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES,
    durationSeconds: 0,
    maxMessages: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--asn') options.asn = argv[++index] ?? '';
    else if (arg === '--bgpreader') options.bgpreader = argv[++index] ?? '';
    else if (arg === '--output-dir') options.outputDir = argv[++index] ?? '';
    else if (arg === '--prefix-file') options.prefixFile = argv[++index] ?? '';
    else if (arg === '--retention-days') options.retentionDays = Number(argv[++index]);
    else if (arg === '--max-prefixes') options.maxPrefixes = Number(argv[++index]);
    else if (arg === '--duration-seconds') options.durationSeconds = Number(argv[++index]);
    else if (arg === '--max-messages') options.maxMessages = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function usage() {
  console.log(`Passive Route Views collector via CAIDA BGPStream\n\nUsage:\n  npm run collect:routeviews -- --asn AS58224 [options]\n\nRequirements:\n  bgpreader from CAIDA BGPStream must be installed and available in PATH, or supplied with --bgpreader.\n\nOptions:\n  --asn ASxxxxx          Required; must exist in data/asns.json\n  --bgpreader PATH       Default: bgpreader\n  --prefix-file FILE     Optional explicit CIDR list (JSON array or one CIDR per line)\n  --output-dir DIR       Default: var/bgpstream-routeviews\n  --retention-days N     Default: ${BGPSTREAM_ROUTEVIEWS_DEFAULT_RETENTION_DAYS}; max: ${BGPSTREAM_ROUTEVIEWS_MAX_RETENTION_DAYS}\n  --max-prefixes N       Safety cap; default/max: ${BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES}\n  --duration-seconds N   Optional bounded run; 0 means until interrupted\n  --max-messages N       Optional bounded event count; 0 means unlimited\n\nThis collector is passive. It reads the public Route Views BMP stream through BGPStream and never triggers measurements.`);
}

function boundedInteger(value, { name, minimum, maximum, allowZero = false }) {
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || (allowZero && numeric === 0 ? false : numeric < minimum) || numeric > maximum) {
    const zero = allowZero ? ' or 0' : '';
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}${zero}.`);
  }
  return numeric;
}

async function explicitPrefixes(filePath) {
  const text = await readFile(filePath, 'utf8');
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) throw new Error('Prefix JSON must be an array.');
    return parsed.map(String);
  }
  return text.split(/\r?\n/).map((line) => line.replace(/#.*/, '').trim()).filter(Boolean);
}

function sleep(ms, signal) {
  return new Promise((resolvePromise) => {
    if (signal.aborted) { resolvePromise(); return; }
    const timer = setTimeout(resolvePromise, ms);
    signal.addEventListener('abort', () => { clearTimeout(timer); resolvePromise(); }, { once: true });
  });
}

async function cleanupRetention(directory, retentionDays) {
  const cutoff = Date.now() - retentionDays * 86_400_000;
  let entries = [];
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = entry.name.match(/^AS\d+-(\d{4}-\d{2}-\d{2})\.jsonl$/);
    if (!match) continue;
    const timestamp = Date.parse(`${match[1]}T00:00:00Z`);
    if (Number.isFinite(timestamp) && timestamp < cutoff) await rm(join(directory, entry.name), { force: true });
  }
}

function eventDay(event) {
  const date = event.timestamp ? new Date(event.timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

async function writeStatus(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const options = parseArgs(process.argv.slice(2));
if (options.help) { usage(); process.exit(0); }

const asn = normalizeAsn(options.asn);
if (!asn || !allowed.has(asn)) throw new Error(`--asn must be one of the registered Iran networks: ${[...allowed.keys()].join(', ')}`);
if (!String(options.bgpreader).trim()) throw new Error('--bgpreader must not be empty.');
options.retentionDays = boundedInteger(options.retentionDays, { name: '--retention-days', minimum: 1, maximum: BGPSTREAM_ROUTEVIEWS_MAX_RETENTION_DAYS });
options.maxPrefixes = boundedInteger(options.maxPrefixes, { name: '--max-prefixes', minimum: 1, maximum: BGPSTREAM_ROUTEVIEWS_MAX_PREFIXES });
options.durationSeconds = boundedInteger(options.durationSeconds, { name: '--duration-seconds', minimum: 1, maximum: 86_400, allowZero: true });
options.maxMessages = boundedInteger(options.maxMessages, { name: '--max-messages', minimum: 1, maximum: 1_000_000, allowZero: true });
const outputDir = resolve(options.outputDir || join(root, 'var', 'bgpstream-routeviews'));
await mkdir(outputDir, { recursive: true });
await cleanupRetention(outputDir, options.retentionDays);

let prefixes;
let prefixSourceUrl;
if (options.prefixFile) {
  prefixes = await explicitPrefixes(resolve(options.prefixFile));
  prefixSourceUrl = `operator-file:${basename(options.prefixFile)}`;
} else {
  const scope = await resolveRouteViewsPrefixScope(asn, { maxPrefixes: options.maxPrefixes });
  if (scope.status !== 'observed') throw new Error(`RIPEstat returned no currently announced prefixes for ${asn}; refusing to start an unscoped Route Views stream.`);
  prefixes = scope.prefixes;
  prefixSourceUrl = scope.sourceUrl;
}

const command = buildRouteViewsBgpReaderArgs(prefixes, { maxPrefixes: options.maxPrefixes });
const network = allowed.get(asn);
const controller = new AbortController();
let stopReason = null;
let collectedEvents = 0;
let reconnects = 0;
const startedAt = new Date().toISOString();
const statusPath = join(outputDir, `status-${asn}.json`);
let durationTimer = null;

function stop(reason) {
  if (controller.signal.aborted) return;
  stopReason = reason;
  controller.abort(reason);
}
process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
if (options.durationSeconds > 0) durationTimer = setTimeout(() => stop('duration-limit'), options.durationSeconds * 1000);

const statusBase = {
  source: 'Route Views BMP via CAIDA BGPStream',
  provider: 'Route Views',
  accessFramework: 'CAIDA BGPStream',
  routingSourceFamily: 'routeviews',
  evidenceRole: 'routing-control-plane',
  independentCensorshipVote: false,
  asn,
  network: network.name,
  prefixCount: command.prefixes.length,
  prefixSource: prefixSourceUrl,
  project: 'routeviews-stream',
  retentionDays: options.retentionDays,
  startedAt,
};
await writeStatus(statusPath, { ...statusBase, state: 'starting', reconnects, collectedEvents, updatedAt: new Date().toISOString() });
console.log(`Route Views passive collector: ${asn} ${network.name} · ${command.prefixes.length} prefix(es) · output ${outputDir}`);

let attempt = 0;
while (!controller.signal.aborted) {
  let child;
  let abortChild;
  try {
    await writeStatus(statusPath, { ...statusBase, state: 'connecting', reconnects, collectedEvents, updatedAt: new Date().toISOString() });
    child = spawn(options.bgpreader, command.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let spawnError = null;
    child.once('error', (error) => { spawnError = error; });
    const stderrChunks = [];
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(String(chunk));
      while (stderrChunks.join('').length > 4096) stderrChunks.shift();
    });
    abortChild = () => { if (!child.killed) child.kill('SIGTERM'); };
    controller.signal.addEventListener('abort', abortChild, { once: true });
    const closed = once(child, 'close');
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    attempt = 0;
    await writeStatus(statusPath, { ...statusBase, state: 'connected', reconnects, collectedEvents, updatedAt: new Date().toISOString() });

    for await (const line of lines) {
      const parsed = parseRouteViewsBgpReaderLine(line);
      for (const event of parsed.events) {
        const record = {
          ...event,
          collectedAt: new Date().toISOString(),
          scopeAsn: asn,
          scopeNetwork: network.name,
          scopePrefixCount: command.prefixes.length,
          scopePrefixSource: prefixSourceUrl,
        };
        await appendFile(join(outputDir, `${asn}-${eventDay(event)}.jsonl`), `${JSON.stringify(record)}\n`, 'utf8');
        collectedEvents += 1;
        if (options.maxMessages > 0 && collectedEvents >= options.maxMessages) { stop('message-limit'); break; }
      }
      if (controller.signal.aborted) break;
    }

    const [code, signal] = await closed;
    if (spawnError) throw spawnError;
    if (controller.signal.aborted) break;
    const stderr = stderrChunks.join('').trim();
    throw new Error(`bgpreader exited unexpectedly with code ${code ?? 'null'} signal ${signal ?? 'none'}${stderr ? `: ${stderr.slice(-800)}` : ''}`);
  } catch (error) {
    if (controller.signal.aborted) break;
    reconnects += 1;
    const message = error instanceof Error ? error.message : String(error);
    const delay = reconnectDelayMs(attempt);
    attempt += 1;
    console.error(`Route Views BGPStream error: ${message}; reconnect in ${delay} ms.`);
    await writeStatus(statusPath, { ...statusBase, state: 'reconnecting', reconnects, collectedEvents, lastError: message, nextRetryMs: delay, updatedAt: new Date().toISOString() });
    await sleep(delay, controller.signal);
  } finally {
    if (abortChild) controller.signal.removeEventListener('abort', abortChild);
    if (child && !child.killed && controller.signal.aborted) child.kill('SIGTERM');
  }
}

if (durationTimer) clearTimeout(durationTimer);
await cleanupRetention(outputDir, options.retentionDays);
await writeStatus(statusPath, { ...statusBase, state: 'stopped', reconnects, collectedEvents, stopReason: stopReason || 'abort', stoppedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
console.log(`Route Views collector stopped · ${collectedEvents} route event(s) · ${reconnects} reconnect(s) · reason ${stopReason || 'abort'}`);
