import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { publicNetworkName } from './asn-names.mjs';
import { getRegistrationAt } from './asn-registry.mjs';
import { join } from 'node:path';
import { asRecord, fetchJson, parseNumber } from './common.mjs';

// How a nationwide shutdown unfolded, hour by hour, from three public sources that each see a
// different layer:
// - routing: RIPE RIS, how many Iranian address prefixes the world's routers still saw
//   (IPv4 and IPv6 separately; RIPEstat country-resource-stats);
// - traffic: Cloudflare Radar, traffic Cloudflare received from Iran (from Iranian networks);
// - reachability: IODA, how many Iranian address blocks still answered pings sent from abroad.
// Routing and IODA look from outside: they say whether Iran's networks were connected, never
// what users could reach. The networks list comes from Radar's traffic, which starts inside.
// A finished shutdown no longer changes, so its answer is kept on disk and never refetched.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const RADAR = 'https://api.cloudflare.com/client/v4/radar';

const hourStart = (ms) => Math.floor(ms / HOUR) * HOUR;
const iso = (ms) => new Date(ms).toISOString().replace('.000Z', 'Z');
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

// --- parsing -------------------------------------------------------------------------------

export function parseRoutingSeries(payload) {
  const stats = asRecord(asRecord(payload)?.data)?.stats;
  const v4 = new Map();
  const v6 = new Map();
  for (const row of Array.isArray(stats) ? stats : []) {
    const time = Date.parse(`${row?.timeline?.[0]?.starttime ?? row?.stats_date ?? ''}${/Z$/.test(String(row?.timeline?.[0]?.starttime ?? '')) ? '' : 'Z'}`);
    if (!Number.isFinite(time)) continue;
    const four = row.v4_prefixes_ris == null ? null : parseNumber(row.v4_prefixes_ris);
    const six = row.v6_prefixes_ris == null ? null : parseNumber(row.v6_prefixes_ris);
    if (four !== null) v4.set(hourStart(time), four);
    if (six !== null) v6.set(hourStart(time), six);
  }
  return { v4, v6 };
}

export function parseRadarHourly(payload) {
  const root = asRecord(payload);
  if (root?.success !== true) throw new Error('Cloudflare Radar traffic response was unsuccessful.');
  const serie = asRecord(asRecord(root.result)?.serie_0);
  const points = new Map();
  (serie?.timestamps ?? []).forEach((timestamp, index) => {
    const time = Date.parse(String(timestamp));
    const raw = serie.values?.[index];
    const value = raw === null || raw === undefined ? null : parseNumber(raw);
    if (Number.isFinite(time) && value !== null) points.set(hourStart(time), value);
  });
  return points;
}

// IODA answers in ten-minute steps; an hour is the median of its steps, so one lost round of
// pings does not count as a drop.
export function parseIodaHourly(payload) {
  const series = (asRecord(payload)?.data ?? []).flat().find((item) => item?.datasource === 'ping-slash24');
  const points = new Map();
  if (!series || !Array.isArray(series.values)) return points;
  const buckets = new Map();
  series.values.forEach((value, index) => {
    // A missing round of pings is no answer at all, not zero answers.
    const number = value === null || value === undefined ? null : parseNumber(value);
    if (number === null) return;
    const hour = hourStart((series.from + index * series.step) * 1000);
    if (!buckets.has(hour)) buckets.set(hour, []);
    buckets.get(hour).push(number);
  });
  for (const [hour, values] of buckets) points.set(hour, median(values));
  return points;
}

export function parseTopAses(payload) {
  const result = asRecord(asRecord(payload)?.result);
  const key = Object.keys(result ?? {}).find((name) => name.startsWith('top'));
  return (key ? result[key] : []).map((row) => ({ asn: `AS${row.clientASN}`, name: row.clientASName ?? '', share: parseNumber(row.value) }))
    .filter((row) => row.share !== null);
}

// --- turning points ------------------------------------------------------------------------

const within = (points, from, to) => [...points].filter(([time]) => time >= from && time < to).sort((a, b) => a[0] - b[0]);

// The first hour from which a series stays below `fraction` of its reference for this and the
// next available hour; `reference(time)` is the normal level for that hour.
function firstDrop(points, { from, to, fraction, reference }) {
  const rows = within(points, from, to);
  for (let index = 0; index < rows.length; index += 1) {
    const [time, value] = rows[index];
    const normal = reference(time);
    if (!normal) continue;
    const next = rows[index + 1];
    const nextNormal = next ? reference(next[0]) : null;
    if (value < normal * fraction && (!next || !nextNormal || next[1] < nextNormal * fraction)) return { time, value, normal, previous: rows[index - 1]?.[0] ?? null };
  }
  return null;
}

// The first hour from which a series stays above `level` for this and the next available hour.
function firstRise(points, { from, to, level }) {
  const rows = within(points, from, to);
  for (let index = 0; index < rows.length; index += 1) {
    const [time, value] = rows[index];
    const next = rows[index + 1];
    if (value >= level && (!next || next[1] >= level)) return { time, value, previous: rows[index - 1]?.[0] ?? null };
  }
  return null;
}

// Routing counts are samples: a change happened between the last sample before and the first
// after. Traffic and reachability are hourly totals: the change happened within that hour.
const between = (point) => ({ from: iso(point.previous ?? point.time - HOUR), to: iso(point.time) });
const inHour = (point) => ({ from: iso(point.time), to: iso(point.time + HOUR) });

const lowest = (points, from, to) => {
  const values = within(points, from, to).map(([, value]) => value);
  return values.length ? Math.min(...values) : null;
};

// Turning points at the start: routes (IPv6, IPv4), traffic, reachability. The normal level is
// the median of the day before; traffic is compared with the same hour a day earlier, because
// it follows the day. Changes smaller than a tenth are not turning points.
export function onsetEvents({ start, routing, traffic, reach }) {
  const startHour = hourStart(Date.parse(start));
  const searchFrom = startHour - 12 * HOUR;
  const searchTo = startHour + 24 * HOUR;
  const normalOf = (points) => median(within(points, startHour - 36 * HOUR, searchFrom).map(([, value]) => value));
  const events = [];
  const base = {};
  for (const family of ['v6', 'v4']) {
    const points = routing?.[family];
    const normal = points ? normalOf(points) : null;
    if (!normal) continue;
    base[family] = normal;
    const drop = firstDrop(points, { from: searchFrom, to: searchTo, fraction: 0.9, reference: () => normal });
    const low = lowest(points, searchFrom, searchTo);
    if (drop) events.push({ kind: `routes-${family}`, ...between(drop), before: Math.round(normal), after: Math.round(low), percent: round((low / normal) * 100) });
    // IPv4 carries nearly all of Iran's traffic: routes that stayed mean the networks were
    // still on the map while traffic stopped. (IPv6 staying says little: it may be gone already.)
    else if (family === 'v4') events.push({ kind: 'routes-v4-kept', from: iso(searchFrom), to: iso(searchTo), before: Math.round(normal), after: Math.round(low ?? normal), percent: round(((low ?? normal) / normal) * 100) });
  }
  if (traffic?.size) {
    const sameHourBefore = (time) => traffic.get(time - DAY) ?? null;
    const half = firstDrop(traffic, { from: searchFrom, to: searchTo, fraction: 0.5, reference: sameHourBefore });
    if (half) {
      events.push({ kind: 'traffic-half', ...inHour(half) });
      const deep = firstDrop(traffic, { from: half.time, to: searchTo, fraction: 0.05, reference: sameHourBefore });
      if (deep) events.push({ kind: 'traffic-deep', ...inHour(deep) });
    }
  }
  const reachNormal = reach?.size ? normalOf(reach) : null;
  if (reachNormal) {
    base.reach = reachNormal;
    const drop = firstDrop(reach, { from: searchFrom, to: searchTo, fraction: 0.5, reference: () => reachNormal });
    if (drop) {
      const low = lowest(reach, drop.time, searchTo);
      events.push({ kind: 'reach', ...inHour(drop), before: Math.round(reachNormal), after: Math.round(low), percent: round((low / reachNormal) * 100) });
    }
  }
  return { events: events.sort((a, b) => a.to.localeCompare(b.to)), base };
}

// Turning points at the end. Routes and reachability count absolutely, so the return is
// measured against the normal level before the shutdown. Traffic is scaled per request and some
// of it (whitelisted networks) flows before the end, so its return is the first hour from which
// it stays at twice the level of the shutdown's last day.
export function restorationEvents({ end, base, routing, traffic, reach }) {
  const endHour = hourStart(Date.parse(end));
  const from = endHour - 12 * HOUR;
  const to = endHour + 36 * HOUR;
  const events = [];
  for (const family of ['v6', 'v4']) {
    const points = routing?.[family];
    const normal = base?.[family];
    if (!points || !normal) continue;
    const before = lowest(points, endHour - 24 * HOUR, from);
    if (before === null || before >= normal * 0.9) continue;
    const back = firstRise(points, { from, to, level: normal * 0.9 });
    if (back) events.push({ kind: `routes-${family}-back`, ...between(back), after: Math.round(back.value), before: Math.round(normal) });
    else {
      // Routes that did not come back are a finding of their own (IPv6 after January 2026).
      const last = within(points, from, to).at(-1);
      if (last) events.push({ kind: `routes-${family}-missing`, from: iso(last[0]), to: iso(last[0]), after: Math.round(last[1]), before: Math.round(normal), percent: round((last[1] / normal) * 100) });
    }
  }
  if (traffic?.size) {
    const during = median(within(traffic, endHour - 24 * HOUR, from).map(([, value]) => value));
    const back = during ? firstRise(traffic, { from, to, level: during * 2 }) : null;
    if (back) events.push({ kind: 'traffic-back', ...inHour(back) });
  }
  const normal = base?.reach;
  if (reach?.size && normal) {
    const back = firstRise(reach, { from, to, level: normal * 0.5 });
    if (back) events.push({ kind: 'reach-back', ...inHour(back) });
    // A day after the end, how much of Iran answered again: a partial return stays visible.
    const dayAfter = median(within(reach, endHour + 18 * HOUR, endHour + 30 * HOUR).map(([, value]) => value));
    if (dayAfter !== null) events.push({ kind: 'reach-day-after', from: iso(endHour + 18 * HOUR), to: iso(endHour + 30 * HOUR), percent: round((dayAfter / normal) * 100) });
  }
  return events.sort((a, b) => a.to.localeCompare(b.to));
}

// Names follow the same rule as everywhere else (lib/asn-names.mjs): an organisation's name, or
// the number alone.
export const organisationName = publicNetworkName;

// Which Iranian networks still carried the traffic that was left, against the week before.
// Networks registered abroad (VPN and hosting providers geolocated to Iran) are left out.
// A network that still carried traffic while the country was cut off had a connection almost
// nobody had. Its registrant is named then, even a private person, as the registry lists it: the
// finding is the measurement, the name says only in whose name the network is registered.
export function survivingNetworks({ before, during, iranAsns, catalog = [], limit = 6 }) {
  if (!during?.length) return null;
  const iranian = (row) => !iranAsns || iranAsns.has(row.asn);
  const beforeShare = new Map((before ?? []).map((row) => [row.asn, row.share]));
  const floor = before?.length ? Math.min(...before.map((row) => row.share)) : null;
  const kept = during.filter(iranian);
  return {
    foreignLeftOut: during.filter((row) => !iranian(row)).length,
    networks: kept.slice(0, limit).map((row) => ({
      asn: row.asn,
      name: organisationName(row.asn, row.name, catalog),
      registrant: organisationName(row.asn, row.name, catalog) ? null : (String(row.name ?? '').trim() || null),
      share: round(row.share),
      before: beforeShare.has(row.asn) ? round(beforeShare.get(row.asn)) : null,
      // Not among the listed networks before: its share was below the smallest listed one.
      beforeBelow: beforeShare.has(row.asn) || floor === null ? null : round(floor, 2),
    })),
  };
}

// --- fetching ------------------------------------------------------------------------------

const routingUrl = (from, to) => `https://stat.ripe.net/data/country-resource-stats/data.json?resource=IR&starttime=${iso(from).slice(0, 16)}&endtime=${iso(to).slice(0, 16)}&resolution=1h`;
const iodaUrl = (from, to) => `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/IR?from=${from / 1000}&until=${to / 1000}&datasource=ping-slash24`;
const trafficUrl = (from, to) => `${RADAR}/netflows/timeseries?location=IR&dateStart=${iso(from)}&dateEnd=${iso(to)}&aggInterval=1h&format=JSON`;
const topUrl = (from, to) => `${RADAR}/netflows/top/ases?location=IR&dateStart=${iso(from)}&dateEnd=${iso(to)}&limit=50&format=JSON`;

async function settle(promise) {
  try { return await promise; } catch { return null; }
}

async function window({ from, to, token, fetch }) {
  const radar = token ? { headers: { authorization: `Bearer ${token}` } } : null;
  const [routing, traffic, reach] = await Promise.all([
    settle(fetch(routingUrl(from, to), { timeoutMs: 30_000 }).then(parseRoutingSeries)),
    radar ? settle(fetch(trafficUrl(from, to), radar).then(parseRadarHourly)) : null,
    settle(fetch(iodaUrl(from, to), { timeoutMs: 30_000 }).then(parseIodaHourly)),
  ]);
  return { routing, traffic, reach, urls: [routingUrl(from, to), ...(radar ? [trafficUrl(from, to)] : []), iodaUrl(from, to)] };
}

export async function buildShutdownAnatomy({ start, end = null, now = Date.now(), token = process.env.CLOUDFLARE_RADAR_API_TOKEN?.trim(), iranAsns = null, catalog = [], fetch = fetchJson }) {
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) throw new Error('A shutdown needs a valid start.');
  const endMs = end ? Date.parse(end) : null;
  const safeNow = now - 2 * HOUR;
  const startHour = hourStart(startMs);
  const onsetWindow = await window({ from: startHour - 36 * HOUR, to: Math.min(startHour + 24 * HOUR, safeNow), token, fetch });
  const onset = onsetEvents({ start, ...onsetWindow });
  let restoration = [];
  let restorationUrls = [];
  if (endMs && endMs + 12 * HOUR < safeNow) {
    const endHour = hourStart(endMs);
    const restorationWindow = await window({ from: endHour - 24 * HOUR, to: Math.min(endHour + 36 * HOUR, safeNow), token, fetch });
    restoration = restorationEvents({ end, base: onset.base, ...restorationWindow });
    restorationUrls = restorationWindow.urls;
  }
  let networks = null;
  let networkUrls = [];
  let registrationMissing = false;
  if (token) {
    // The first week of the shutdown in whole days, against the week before it.
    const duringFrom = Math.ceil(startMs / DAY) * DAY;
    const duringTo = Math.min(endMs ?? safeNow, duringFrom + 7 * DAY, hourStart(safeNow));
    if (duringTo - duringFrom >= DAY) {
      const beforeFrom = Math.floor(startMs / DAY) * DAY - 7 * DAY;
      const beforeTo = Math.floor(startMs / DAY) * DAY;
      const radar = { headers: { authorization: `Bearer ${token}` } };
      const [before, during] = await Promise.all([
        settle(fetch(topUrl(beforeFrom, beforeTo), radar).then(parseTopAses)),
        settle(fetch(topUrl(duringFrom, duringTo), radar).then(parseTopAses)),
      ]);
      networks = survivingNetworks({ before, during, iranAsns, catalog });
      if (networks) Object.assign(networks, { from: iso(duringFrom), to: iso(duringTo) });
      // Who a network that kept access was registered to while it did, as the RIPE Database
      // recorded it then. It is kept with the finished shutdown, so a later change of registrant
      // does not replace the name of the one who had the connection.
      for (const row of networks?.networks ?? []) {
        if (!row.registrant) continue;
        const then = await settle(getRegistrationAt(row.asn, iso(duringFrom), { fetch }));
        if (then?.orgName || then?.asName) {
          Object.assign(row, { registrant: then.orgName ?? row.registrant, registrantAsName: then.asName, registrantAsOf: then.at, registrantSources: then.sourceUrls });
        } else registrationMissing = true;
      }
      networkUrls = [topUrl(beforeFrom, beforeTo), topUrl(duringFrom, duringTo)];
    }
  }
  const complete = Boolean(onsetWindow.routing && onsetWindow.reach && (!token || onsetWindow.traffic) && (!token || networks) && !registrationMissing);
  return {
    ok: true,
    status: onset.events.length || restoration.length || networks?.networks?.length ? 'observed' : 'no_data',
    start,
    end,
    onset: onset.events,
    restoration,
    networks,
    complete,
    sourceUrls: [...onsetWindow.urls, ...restorationUrls, ...networkUrls],
    fetchedAt: new Date(now).toISOString(),
  };
}

// Finished shutdowns (ended more than two days ago, answered by every source) are kept on
// disk; everything else is fetched again after an hour. A stored file of an older format is built
// again once (format 3: the registrant of a network that kept access, as registered then).
export const ANATOMY_FORMAT = 3;
const memory = new Map();
export async function getShutdownAnatomy({ start, end = null, storeDir = null, now = Date.now(), ...options }) {
  const key = `${start}|${end ?? ''}`;
  const file = storeDir ? join(storeDir, `${start.replace(/[^0-9TZ]/g, '')}-${String(end ?? 'open').replace(/[^0-9TZ]/g, '')}.json`) : null;
  const cached = memory.get(key);
  if (cached && (cached.final || cached.expires > now)) return cached.value;
  if (file) {
    const stored = await readFile(file, 'utf8').then(JSON.parse).catch(() => null);
    if (stored?.ok && stored.format === ANATOMY_FORMAT) {
      memory.set(key, { value: stored, final: true });
      return stored;
    }
  }
  const value = { ...(await buildShutdownAnatomy({ start, end, now, ...options })), format: ANATOMY_FORMAT };
  const final = Boolean(end && Date.parse(end) + 2 * DAY < now && value.complete);
  memory.set(key, { value, final, expires: now + HOUR });
  if (final && file) {
    try {
      await mkdir(storeDir, { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(value));
      await rename(`${file}.tmp`, file);
    } catch { /* The disk copy only saves requests. */ }
  }
  return value;
}
