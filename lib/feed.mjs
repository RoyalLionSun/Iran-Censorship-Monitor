import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import enCore from '../public/locales/en.js';
import faCore from '../public/locales/fa.js';
import enExtra from '../public/locales/en-extra.js';
import faExtra from '../public/locales/fa-extra.js';
import enRuntime from '../public/locales/en-runtime.js';
import faRuntime from '../public/locales/fa-runtime.js';
import enContext from '../public/locales/en-context.js';
import faContext from '../public/locales/fa-context.js';
import enV19 from '../public/locales/en-v19.js';
import faV19 from '../public/locales/fa-v19.js';

// "What changed" as an Atom feed, one entry per day for all of Iran, in English or Farsi, with
// the same wording as the page (the page's own texts are used). Feed readers and a Telegram
// channel can follow it without an account; the page stays the source.

const DICTIONARIES = {
  en: { ...enCore, ...enExtra, ...enRuntime, ...enContext, ...enV19 },
  fa: { ...faCore, ...faExtra, ...faRuntime, ...faContext, ...faV19 },
};
const LOCALE = { en: 'en-GB', fa: 'fa-IR' };
const NAMED = ['services-blocked', 'services-restricted', 'services-reachable', 'services-untested', 'services-blocked-independent'];
const MAX_ENTRIES = 60;

export function translator(lang) {
  const dictionary = DICTIONARIES[lang] ?? DICTIONARIES.en;
  const fill = (template, vars) => String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
  // The feed speaks for all of Iran: a sentence's all-Iran wording wins where one exists.
  const t = (key, vars = {}) => fill(dictionary[`${key}.iran`] ?? dictionary[key] ?? DICTIONARIES.en[`${key}.iran`] ?? DICTIONARIES.en[key] ?? key, vars);
  const number = (value, digits = 0) => new Intl.NumberFormat(LOCALE[lang] ?? 'en-GB', { maximumFractionDigits: digits }).format(value);
  const list = (items) => new Intl.ListFormat(LOCALE[lang] ?? 'en-GB', { style: 'long', type: 'conjunction' }).format(items);
  const brand = (id) => { const key = `board.brand.${id}`; const text = t(key); return text === key ? id : text; };
  const month = (value) => new Intl.DateTimeFormat(LOCALE[lang] ?? 'en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`));
  const day = (value) => new Intl.DateTimeFormat(LOCALE[lang] ?? 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  const plural = (key, count, vars) => t(`${key}.${count === 1 ? 'one' : 'other'}`, { count: number(count), ...vars });
  return { t, number, list, brand, month, day, plural };
}

function headline(interpretation, tr) {
  const head = interpretation?.summary?.headline;
  if (!head) return null;
  const names = (head.services ?? []).map(tr.brand);
  if (NAMED.includes(head.state) && names.length) return tr.plural(`board.headline.${head.state}`, names.length, { services: tr.list(names) });
  if (head.state === 'outage-ended') {
    const date = tr.day(head.endedOn);
    return names.length ? tr.plural('board.headline.outage-ended.blocked', names.length, { date, services: tr.list(names) }) : tr.t('board.headline.outage-ended', { date });
  }
  return tr.t(`board.headline.${head.state}`);
}

function percent(tr, value) {
  return tr.t('board.outage.percent', { value: tr.number(value, value < 10 ? 1 : 0) });
}

// One day's entry: the headline, what changed against the period before, how long the main
// services have been blocked, and the use of Cloudflare's WARP VPN.
export function buildFeedEntry({ interpretation, lang, date, link, history = null }) {
  const tr = translator(lang);
  const title = headline(interpretation, tr);
  if (!title) return null;
  const services = interpretation.services ?? {};
  const lines = [];
  const changes = services.changes;
  if (changes?.outageOverlap) lines.push(tr.t('board.changes.outage', { period: changes.previous ? `${tr.day(changes.previous.since)} – ${tr.day(changes.previous.until)}` : '' }));
  else if (changes?.compared) {
    const change = (entry) => `${entry.name} (${tr.t(`board.more.status.${entry.from}`)} → ${tr.t(`board.more.status.${entry.to}`)})`;
    if (!changes.worse.length && !changes.better.length) lines.push(`${tr.t('board.changes.title')}: ${tr.t('board.changes.none')}`);
    if (changes.worse.length) lines.push(`${tr.t('board.changes.worse')}: ${changes.worse.map(change).join(', ')}`);
    if (changes.better.length) lines.push(`${tr.t('board.changes.better')}: ${changes.better.map(change).join(', ')}`);
  }
  for (const service of history?.services ?? []) {
    if (!service.since) continue;
    lines.push(`${tr.brand(service.id)}: ${tr.t(service.since.fromStart ? 'board.history.sinceStart' : 'board.history.since', { month: tr.month(service.since.month) })}`);
  }
  const vpn = services.vpnUse;
  if (vpn?.current) {
    const parts = [tr.t('board.vpnUse.line', { share: percent(tr, vpn.current.share) })];
    if (vpn.yearAgo) parts.push(tr.t('board.vpnUse.yearAgo', { share: percent(tr, vpn.yearAgo.share) }));
    lines.push(parts.join(' · '));
  }
  return { id: date, updated: new Date().toISOString(), title, lines, link };
}

const xml = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

export function renderAtom({ entries, lang, selfUrl, siteUrl }) {
  const title = lang === 'fa' ? 'پایش سانسور اینترنت ایران' : 'Iran Censorship Monitor';
  const updated = entries[0]?.updated ?? new Date().toISOString();
  const dir = lang === 'fa' ? ' dir="rtl"' : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <title>${xml(title)}</title>
  <subtitle>${xml(lang === 'fa' ? 'کدام سرویس‌ها در ایران مسدودند؛ روزانه' : 'Which services are blocked in Iran, daily')}</subtitle>
  <id>${xml(selfUrl)}</id>
  <link rel="self" href="${xml(selfUrl)}"/>
  <link rel="alternate" href="${xml(siteUrl)}"/>
  <updated>${xml(updated)}</updated>
  <author><name>@RoyalLionSun</name></author>
${entries.map((entry) => `  <entry>
    <id>${xml(`${selfUrl}#${entry.id}`)}</id>
    <title>${xml(`${entry.id} · ${entry.title}`)}</title>
    <updated>${xml(entry.updated)}</updated>
    <link rel="alternate" href="${xml(entry.link)}"/>
    <content type="html">${xml(`<div${dir}><p><strong>${xml(entry.title)}</strong></p>${entry.lines.map((line) => `<p>${xml(line)}</p>`).join('')}<p><a href="${xml(entry.link)}">${xml(entry.link)}</a></p></div>`)}</content>
  </entry>`).join('\n')}
</feed>
`;
}

// Stored entries per language: today's entry is replaced when refreshed, older days are kept.
export async function upsertEntry(path, entry) {
  let entries = [];
  try { entries = JSON.parse(await readFile(path, 'utf8')); } catch { entries = []; }
  entries = [entry, ...entries.filter((item) => item.id !== entry.id)].sort((a, b) => b.id.localeCompare(a.id)).slice(0, MAX_ENTRIES);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(`${path}.tmp`, JSON.stringify(entries));
  await rename(`${path}.tmp`, path);
  return entries;
}

export async function readEntries(path) {
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return []; }
}

// A new day's entry, posted to a Telegram channel (optional: TELEGRAM_BOT_TOKEN and
// TELEGRAM_CHANNEL_<LANG>, e.g. TELEGRAM_CHANNEL_FA=@mychannel). Plain text, no preview of
// third-party pages; the link leads to the dashboard view.
export function telegramText(entry) {
  return [entry.title, '', ...entry.lines, '', entry.link].join('\n').slice(0, 4000);
}

export async function postToTelegram(entry, { token, chat, fetchImpl = fetch } = {}) {
  if (!token || !chat) return { ok: false, skipped: true };
  const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chat, text: telegramText(entry), disable_web_page_preview: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => ({}));
  return { ok: Boolean(payload.ok), error: payload.ok ? null : payload.description ?? `HTTP ${response.status}` };
}
