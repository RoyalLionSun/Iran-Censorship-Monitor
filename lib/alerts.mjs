import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ongoingNationwideOutage, translator } from './feed.mjs';

// Change alerts: a feed entry (and a Telegram post, if configured) as soon as a nationwide outage
// begins or ends, or a main service turns from blocked to reachable across Iran or back, instead
// of waiting for the next daily entry. Only changes a reader can act on are watched, and each one
// must be seen in two checks at least CONFIRM_MS apart, so that one odd answer never becomes an
// alert.

export const CONFIRM_MS = 50 * 60 * 1000;

// What is watched. Unknown parts stay null and never count as a change: without Cloudflare Radar
// no outage state, without a current OONI answer no service states.
export function alertState(interpretation) {
  const connectivity = interpretation?.dimensions?.connectivity;
  const radarAnswered = (connectivity?.availableSources ?? []).includes('Cloudflare Radar');
  const outage = radarAnswered ? ongoingNationwideOutage(interpretation) : null;
  const services = interpretation?.services;
  const current = services && !services.stale && services.state !== 'unavailable';
  return {
    outage: radarAnswered ? (outage ? { start: outage.start } : false) : null,
    services: current ? Object.fromEntries((services.items ?? []).filter((item) => ['blocked', 'reachable'].includes(item.status)).map((item) => [item.id, item.status])) : null,
  };
}

export function alertChanges(before, now) {
  const changes = [];
  if (before?.outage !== null && before?.outage !== undefined && now?.outage !== null && now?.outage !== undefined) {
    if (!before.outage && now.outage) changes.push({ kind: 'outage-start', start: now.outage.start });
    if (before.outage && !now.outage) changes.push({ kind: 'outage-end' });
  }
  if (before?.services && now?.services) {
    for (const [id, status] of Object.entries(now.services)) {
      const was = before.services[id];
      if (was === 'reachable' && status === 'blocked') changes.push({ kind: 'blocked', service: id });
      if (was === 'blocked' && status === 'reachable') changes.push({ kind: 'reachable', service: id });
    }
  }
  return changes;
}

const signature = (changes) => JSON.stringify(changes.map((change) => [change.kind, change.service ?? '']));

// Given the stored state and the current one: which alerts to send now, and what to store.
export function decideAlerts(stored, current, now = Date.now(), confirmMs = CONFIRM_MS) {
  // The first check only records what it sees; so does one that knows less than before.
  if (!stored?.confirmed) return { alerts: [], next: { confirmed: current, pending: null } };
  const merged = {
    outage: current.outage ?? stored.confirmed.outage ?? null,
    services: current.services ?? stored.confirmed.services ?? null,
  };
  const changes = alertChanges(stored.confirmed, merged);
  // A check that could not see a part keeps a change that is waiting for its confirmation.
  const partial = current.outage === null || current.services === null;
  if (!changes.length) return { alerts: [], next: { confirmed: merged, pending: partial ? stored.pending ?? null : null } };
  const pending = stored.pending;
  if (pending && pending.signature === signature(changes) && now - pending.since >= confirmMs) {
    return { alerts: changes, next: { confirmed: merged, pending: null } };
  }
  return { alerts: [], next: { confirmed: stored.confirmed, pending: pending && pending.signature === signature(changes) ? pending : { signature: signature(changes), since: now } } };
}

// One feed entry per alert, in the reader's language and the page's wording.
export function buildAlertEntries(changes, { lang, link, at = new Date() }) {
  const tr = translator(lang);
  const stamp = at.toISOString();
  const label = `${new Intl.DateTimeFormat(tr.locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(at)} UTC`;
  return changes.map((change) => {
    const title = change.kind === 'outage-start' ? tr.t('board.headline.nationwide-since', { date: tr.day(change.start) })
      : change.kind === 'outage-end' ? tr.t('feed.alert.outageEnd')
        : tr.t(`feed.alert.${change.kind}`, { service: tr.brand(change.service) });
    const source = change.kind.startsWith('outage') ? tr.t('feed.alert.source.radar') : tr.t('feed.alert.source.ooni');
    return {
      id: `${stamp.slice(0, 16).replace(':', '')}-${change.kind}${change.service ? `-${change.service}` : ''}`,
      label, updated: stamp, alert: true, title, lines: [source], link,
    };
  });
}

export async function readAlertState(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; }
}

export async function writeAlertState(path, state) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(state));
  await rename(`${path}.tmp`, path);
}
