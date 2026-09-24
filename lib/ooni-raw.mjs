import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';

// OONI publishes every measurement as hourly files in a public bucket (no API, no quota):
// raw/YYYYMMDD/HH/IR/<test>/<...>.jsonl.gz. The files hold the probe's raw results only; the
// verdicts (anomaly, confirmed, failure) are computed by OONI's pipeline afterwards and are not
// in them. This path therefore derives the verdict from the result fields the probe reports,
// with Iran's known block-page fingerprints for "confirmed". When the OONI API delivers the same
// measurement, OONI's own verdict replaces this one (see the store).
// Measured on 23 September 2026: about 400 MB of compressed files per day for Iran, 99% of it
// Web Connectivity; about 17 MB per hour.

export const OONI_RAW_BUCKET = 'https://ooni-data-eu-fra.s3.eu-central-1.amazonaws.com';
const HOUR = 60 * 60 * 1000;
// Files for an hour appear about 75 minutes after it starts (later uploads get their own
// file); an hour is read as complete two hours after it started.
const HOUR_SETTLED_MS = 2 * HOUR;

// Bucket folder → test name, for the tests the dashboard reads.
export const RAW_TESTS = {
  webconnectivity: 'web_connectivity', whatsapp: 'whatsapp', telegram: 'telegram', signal: 'signal',
  facebookmessenger: 'facebook_messenger', psiphon: 'psiphon', tor: 'tor',
};

export function rawHourPrefix(ms) {
  const iso = new Date(ms).toISOString();
  return `raw/${iso.slice(0, 10).replaceAll('-', '')}/${iso.slice(11, 13)}/IR/`;
}

export function parseRawListing(xml) {
  const files = [];
  for (const [, block] of String(xml ?? '').matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    const key = block.match(/<Key>([^<]+)<\/Key>/)?.[1];
    const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1]);
    const folder = key?.match(/^raw\/\d{8}\/\d{2}\/IR\/([a-z]+)\//)?.[1];
    if (!key?.endsWith('.jsonl.gz') || !RAW_TESTS[folder]) continue;
    files.push({ key, size, test: RAW_TESTS[folder] });
  }
  return { files, truncated: /<IsTruncated>true<\/IsTruncated>/.test(String(xml ?? '')) };
}

// ---------------------------------------------------------------- verdicts

// Iran's block page: DNS answers 10.10.34.34-36, or an HTTP body that frames it.
const IR_BLOCK_IP = /^10\.10\.34\.3[4-6]$/;
const IR_BLOCK_BODY = 'iframe src="http://10.10.34.3';

function bodyText(body) {
  if (typeof body === 'string') return body;
  if (body?.format === 'base64' && typeof body.data === 'string') return Buffer.from(body.data, 'base64').toString('latin1');
  return '';
}

function judgeWebConnectivity(tk) {
  const addresses = (tk.queries ?? []).flatMap((query) => query?.answers ?? []).map((answer) => answer?.ipv4).filter(Boolean);
  if (addresses.some((ip) => IR_BLOCK_IP.test(ip))) return { confirmed: true, blocking_type: 'dns' };
  if ((tk.requests ?? []).some((request) => bodyText(request?.response?.body).includes(IR_BLOCK_BODY))) return { confirmed: true, blocking_type: 'blockpage' };
  const blocking = tk.blocking;
  if (blocking === null || blocking === undefined) return { failure: true };
  if (blocking === false) return {};
  const type = { dns: 'dns', tcp_ip: 'tcp', 'http-diff': 'blockpage', 'http-failure': 'http-failure' }[blocking] ?? null;
  return { anomaly: true, blocking_type: type };
}

const APP_RULES = {
  whatsapp: (tk) => ['registration_server_status', 'whatsapp_endpoints_status', 'whatsapp_web_status'].some((key) => tk[key] === 'blocked'),
  telegram: (tk) => tk.telegram_tcp_blocking === true || tk.telegram_http_blocking === true || tk.telegram_web_status === 'blocked',
  signal: (tk) => tk.signal_backend_status === 'blocked',
  facebook_messenger: (tk) => tk.facebook_tcp_blocking === true || tk.facebook_dns_blocking === true,
  // Psiphon's only verdict is whether the tunnel came up.
  psiphon: (tk) => tk.failure != null,
  // Tor: no directory authority reachable on either port.
  tor: (tk) => Number(tk.or_port_dirauth_total) > 0 && Number(tk.or_port_dirauth_accessible) === 0
    && Number(tk.dir_port_total) > 0 && Number(tk.dir_port_accessible) === 0,
};

export function judgeRawMeasurement(measurement) {
  const tk = measurement?.test_keys ?? {};
  const test = measurement?.test_name;
  if (test === 'web_connectivity') return judgeWebConnectivity(tk);
  const rule = APP_RULES[test];
  if (!rule) return null;
  if (test !== 'psiphon' && tk.failure != null) return { failure: true };
  return rule(tk) ? { anomaly: true } : {};
}

// A raw measurement in the shape the store reads (as the list API describes one).
export function rawToStoreItem(measurement) {
  const verdict = judgeRawMeasurement(measurement);
  if (!verdict) return null;
  return {
    measurement_start_time: measurement.measurement_start_time, probe_asn: measurement.probe_asn, test_name: measurement.test_name,
    input: typeof measurement.input === 'string' ? measurement.input : null, report_id: measurement.report_id,
    anomaly: verdict.anomaly === true, confirmed: verdict.confirmed === true, failure: verdict.failure === true,
    blocking_type: verdict.blocking_type ?? null,
  };
}

// ---------------------------------------------------------------- transport

export async function listRawHour(ms, fetcher = fetch) {
  const url = `${OONI_RAW_BUCKET}/?list-type=2&max-keys=1000&prefix=${encodeURIComponent(rawHourPrefix(ms))}`;
  const response = await fetcher(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`OONI raw listing ${response.status}`);
  const listing = parseRawListing(await response.text());
  if (listing.truncated) throw new Error('OONI raw listing was cut off; the hour is not read as complete.');
  return listing.files;
}

// Streams one compressed file line by line, never holding it whole; calls onBatch per 500.
export async function streamRawFile(key, onBatch, fetcher = fetch) {
  const response = await fetcher(`${OONI_RAW_BUCKET}/${key}`, { signal: AbortSignal.timeout(10 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`OONI raw file ${response.status}: ${key}`);
  const lines = createInterface({ input: Readable.fromWeb(response.body).pipe(createGunzip()), crlfDelay: Infinity });
  let batch = [];
  let read = 0;
  for await (const line of lines) {
    if (!line) continue;
    let item = null;
    try { item = rawToStoreItem(JSON.parse(line)); } catch { item = null; }
    if (!item) continue;
    batch.push(item);
    read += 1;
    if (batch.length >= 500) { await onBatch(batch); batch = []; }
  }
  if (batch.length) await onBatch(batch);
  return read;
}

// ---------------------------------------------------------------- collector path

// Reads the hours since the path's covered end (at most `catchUpHours` back), file by file.
// Files already read are remembered by key and size, so a late upload for an hour is read
// without reading the rest again. An hour counts as covered once it has settled and all its
// files were read; coverage only grows without holes, like the API path.
export async function collectOoniS3(store, {
  now = new Date(), list = listRawHour, stream = streamRawFile, catchUpHours = 6, maxBytes = 200 * 1024 * 1024,
} = {}) {
  const nowMs = now.getTime();
  const run = store.startRun('ooni-s3');
  const seen = JSON.parse(store.getMeta('ooni-s3:files') ?? '{}');
  const coveredUntil = Date.parse(store.getMeta('ooni-s3:coveredUntil') ?? '');
  const startHour = Math.floor((Number.isFinite(coveredUntil) && nowMs - coveredUntil <= 72 * HOUR
    ? coveredUntil - 2 * HOUR : nowMs - catchUpHours * HOUR) / HOUR) * HOUR;
  const continuous = Number.isFinite(coveredUntil) && startHour <= coveredUntil;
  let added = 0;
  let bytes = 0;
  let coveredTo = continuous ? coveredUntil : null;
  let complete = true;
  try {
    for (let hour = startHour; hour + HOUR <= nowMs; hour += HOUR) {
      const files = await list(hour);
      for (const file of files) {
        if (seen[file.key] === file.size) continue;
        if (bytes + file.size > maxBytes) { complete = false; break; }
        await stream(file.key, (batch) => { added += store.addOoniMeasurements(batch, 's3'); });
        seen[file.key] = file.size;
        bytes += file.size;
      }
      if (!complete) break;
      // Only a settled hour that joins the covered stretch without a gap extends it.
      const settled = nowMs >= hour + HOUR_SETTLED_MS;
      if (settled && (coveredTo === null ? hour === startHour : hour <= coveredTo)) coveredTo = hour + HOUR;
    }
    return finish(null);
  } catch (error) {
    return finish(error?.message ?? String(error));
  }

  function finish(error) {
    // Remember read files for three days; older keys are never listed again.
    const cutoff = rawHourPrefix(nowMs - 72 * HOUR);
    for (const key of Object.keys(seen)) if (key < cutoff) delete seen[key];
    store.setMeta('ooni-s3:files', JSON.stringify(seen));
    if (coveredTo !== null) {
      if (!continuous) store.setMeta('ooni-s3:coveredSince', new Date(startHour).toISOString().replace(/\.\d{3}Z$/, 'Z'));
      store.setMeta('ooni-s3:coveredUntil', new Date(coveredTo).toISOString().replace(/\.\d{3}Z$/, 'Z'));
    }
    store.finishRun(run, { rows: added, newest: store.newestOoni(), error });
    return { ok: !error, added, bytes, complete, error };
  }
}

// History from the raw files, hour by hour from `from` to `to` (both whole hours). When the
// read stretch reaches the path's covered period without a gap, coverage is extended back to
// `from`; a stretch that stops early (error) extends it only as far as it got, from the end.
export async function backfillOoniS3(store, { from, to, list = listRawHour, stream = streamRawFile, onHour = () => {} } = {}) {
  const run = store.startRun('ooni-s3');
  const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
  let added = 0;
  let bytes = 0;
  let readFrom = null;
  let error = null;
  // Newest first, so an interrupted backfill still leaves a stretch joined to the present.
  for (let hour = to - HOUR; hour >= from; hour -= HOUR) {
    try {
      for (const file of await list(hour)) {
        await stream(file.key, (batch) => { added += store.addOoniMeasurements(batch, 's3'); });
        bytes += file.size;
      }
      readFrom = hour;
      onHour({ hour: iso(hour), added, bytes });
    } catch (failure) {
      error = `${iso(hour)}: ${failure?.message ?? String(failure)}`;
      break;
    }
  }
  const since = Date.parse(store.getMeta('ooni-s3:coveredSince') ?? '');
  const until = Date.parse(store.getMeta('ooni-s3:coveredUntil') ?? '');
  if (readFrom !== null) {
    if (Number.isFinite(since) && to >= since && readFrom < since) store.setMeta('ooni-s3:coveredSince', iso(readFrom));
    if (!Number.isFinite(since)) {
      store.setMeta('ooni-s3:coveredSince', iso(readFrom));
      store.setMeta('ooni-s3:coveredUntil', iso(Number.isFinite(until) ? Math.max(until, to) : to));
    }
  }
  store.finishRun(run, { rows: added, newest: store.newestOoni(), error });
  return { ok: !error, added, bytes, readFrom: readFrom === null ? null : iso(readFrom), error };
}
