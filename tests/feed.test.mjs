import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFeedEntry, readEntries, renderAtom, upsertEntry } from '../lib/feed.mjs';

const interpretation = {
  summary: { headline: { state: 'services-blocked', services: ['instagram', 'x'] } },
  services: {
    changes: { compared: 41, worse: [{ name: 'Viber', from: 'reachable', to: 'partial' }], better: [], previous: { since: '2026-09-10', until: '2026-09-16' } },
    vpnUse: { current: { date: '2026-09-20', share: 6.4 }, yearAgo: { share: 2.4 } },
  },
};
const history = { services: [{ id: 'telegram', since: { month: '2022-01', fromStart: true } }, { id: 'whatsapp', since: null }] };

test('a feed entry says what the page says, in English and in Farsi', () => {
  const en = buildFeedEntry({ interpretation, lang: 'en', date: '2026-09-25', link: 'https://m.example/?lang=en', history });
  assert.equal(en.title.replace(/\u00a0/g, ' '), 'Instagram and X (Twitter) are blocked');
  assert.deepEqual(en.lines, [
    'More restricted: Viber (reachable → partly)',
    'Telegram: Blocked throughout since at least Jan 2022',
    'Cloudflare WARP (VPN): used by about 6.4% of users in Iran · a year ago 2.4%',
  ]);
  const fa = buildFeedEntry({ interpretation, lang: 'fa', date: '2026-09-25', link: 'https://m.example/?lang=fa', history });
  assert.match(fa.title, /اینستاگرام/);
  assert.match(fa.lines[1], /تلگرام: دست‌کم از دی ۱۴۰۰ پیوسته مسدود/);
  assert.equal(buildFeedEntry({ interpretation: null, lang: 'en', date: '2026-09-25', link: '' }), null);
});

test('the feed is well-formed Atom, keeps one entry per day and escapes text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'feed-'));
  const path = join(dir, 'en.json');
  const entry = buildFeedEntry({ interpretation, lang: 'en', date: '2026-09-24', link: 'https://m.example/?a=1&b=2', history });
  await upsertEntry(path, entry);
  await upsertEntry(path, { ...entry, id: '2026-09-25', title: 'A & B <blocked>' });
  await upsertEntry(path, { ...entry, id: '2026-09-25', title: 'Replaced today' });
  const entries = await readEntries(path);
  assert.deepEqual(entries.map((item) => item.id), ['2026-09-25', '2026-09-24']);
  assert.equal(entries[0].title, 'Replaced today');
  const atom = renderAtom({ entries: [{ ...entries[0], title: 'A & B <blocked>' }, entries[1]], lang: 'fa', selfUrl: 'https://m.example/feed.xml?lang=fa', siteUrl: 'https://m.example/' });
  const file = join(dir, 'feed.xml');
  await writeFile(file, atom);
  const out = execFileSync('python3', ['-c', `
import sys, xml.dom.minidom
d = xml.dom.minidom.parse(sys.argv[1]); e = d.getElementsByTagName('entry')
print(len(e), e[0].getElementsByTagName('title')[0].firstChild.data)`, file], { encoding: 'utf8' });
  assert.equal(out.trim(), '2 2026-09-25 · A & B <blocked>');
});

test('a Telegram post is sent only when a bot and channel are set', async () => {
  const { postToTelegram, telegramText } = await import('../lib/feed.mjs');
  const entry = { title: 'Instagram is blocked', lines: ['What changed: none'], link: 'https://m.example/' };
  assert.equal(telegramText(entry), 'Instagram is blocked\n\nWhat changed: none\n\nhttps://m.example/');
  assert.deepEqual(await postToTelegram(entry, {}), { ok: false, skipped: true });
  let sent = null;
  const result = await postToTelegram(entry, { token: 't', chat: '@c', fetchImpl: async (url, options) => { sent = { url, body: JSON.parse(options.body) }; return new Response('{"ok":true}'); } });
  assert.equal(result.ok, true);
  assert.equal(sent.url, 'https://api.telegram.org/bott/sendMessage');
  assert.equal(sent.body.chat_id, '@c');
});

test('the widget shows the six services with status and "since", in both languages', async () => {
  const { renderWidget } = await import('../lib/widget.mjs');
  const snapshot = { since: '2026-09-18', until: '2026-09-24', interpretation: { services: { items: [{ id: 'instagram', status: 'blocked' }, { id: 'whatsapp', status: 'reachable' }] } }, history: { services: [{ id: 'instagram', since: { month: '2023-02', fromStart: false } }] } };
  const en = renderWidget({ ...snapshot, lang: 'en' });
  assert.match(en, /<svg[^>]+width="560"/);
  assert.match(en, />Instagram<\/text>/);
  assert.match(en, /fill="#ef6d6d">Blocked<\/text>/);
  assert.match(en, /Blocked without interruption since Feb 2023/);
  assert.match(en, /fill="#55c78a">Reachable in tests<\/text>/);
  const fa = renderWidget({ ...snapshot, lang: 'fa' });
  assert.match(fa, /direction="rtl"[^>]*>اینستاگرام</);
  assert.doesNotMatch(fa, /<script/i);
});

test('the monthly report covers the month, credits the sources and follows Farsi conventions', async () => {
  const { monthRange, recentMonths, renderMonthlyReport } = await import('../lib/report.mjs');
  assert.deepEqual(monthRange('2026-08', '2026-09-25'), { month: '2026-08', since: '2026-08-01', until: '2026-08-31', complete: true });
  assert.deepEqual(monthRange('2026-09', '2026-09-25'), { month: '2026-09', since: '2026-09-01', until: '2026-09-25', complete: false });
  assert.equal(monthRange('2026-10', '2026-09-25'), null, 'no future months');
  assert.equal(monthRange('2021-12', '2026-09-25'), null, 'nothing before the history starts');
  assert.deepEqual(recentMonths(3, '2026-09-25'), ['2026-09', '2026-08', '2026-07']);
  const interpretation = { summary: { headline: { state: 'services-blocked', services: ['instagram'] } },
    services: { items: [{ id: 'instagram', status: 'blocked', web: { measurements: 10, confirmed: 8 } }],
      changes: { compared: 3, worse: [{ name: 'Zoom', from: 'reachable', to: 'partial' }, { name: 'GitHub', from: 'reachable', to: 'partial' }], better: [] } } };
  const history = { services: [{ id: 'instagram', months: [{ month: '2026-07', status: 'blocked' }, { month: '2026-08', status: 'blocked' }, { month: '2026-09', status: 'reachable' }] }] };
  const range = monthRange('2026-08', '2026-09-25');
  const en = renderMonthlyReport({ interpretation, history, range, lang: 'en', dashboardUrl: 'https://m.example/' });
  assert.match(en, /Blocked without interruption since Jul 2026/, '"since" is judged at the end of the reported month, not today');
  assert.match(en, /CC BY-NC-SA 4\.0/);
  assert.match(en, /Zoom \(reachable → partly\), GitHub/);
  const fa = renderMonthlyReport({ interpretation, history, range, lang: 'fa', dashboardUrl: 'https://m.example/' });
  assert.match(fa, /<html lang="fa" dir="rtl">/);
  assert.match(fa, /Zoom \([^)]*\)، GitHub/, 'Persian list separator');
});

test('weekly reports run Saturday to Friday and share the monthly report\'s page', async () => {
  const { weekRange, recentWeeks, renderMonthlyReport, renderReportIndex } = await import('../lib/report.mjs');
  assert.deepEqual(weekRange('2026-09-19', '2026-09-26'), { week: '2026-09-19', since: '2026-09-19', until: '2026-09-25', complete: true });
  assert.deepEqual(weekRange('2026-09-26', '2026-09-26'), { week: '2026-09-26', since: '2026-09-26', until: '2026-09-26', complete: false });
  assert.equal(weekRange('2026-09-20', '2026-09-26'), null, 'a week starts on a Saturday');
  assert.equal(weekRange('2026-10-03', '2026-09-26'), null, 'no future weeks');
  assert.equal(weekRange('2026-02-30', '2026-09-26'), null, 'no impossible dates');
  assert.deepEqual(recentWeeks(3, '2026-09-25'), ['2026-09-19', '2026-09-12', '2026-09-05']);
  assert.deepEqual(recentWeeks(1, '2026-09-26'), ['2026-09-26']);
  const interpretation = { summary: { headline: { state: 'services-blocked', services: ['instagram'] } },
    services: { items: [{ id: 'instagram', status: 'blocked', web: { measurements: 10, confirmed: 8 } }],
      more: [{ id: 'news', services: [{ id: 'rezapahlavi', name: 'Crown Prince Reza Pahlavi (official site)', scope: 'network', status: 'blocked' }] }] } };
  const range = weekRange('2026-09-19', '2026-09-26');
  const en = renderMonthlyReport({ interpretation, history: null, range, lang: 'en', dashboardUrl: 'https://m.example/' });
  assert.match(en, /Weekly report/);
  assert.match(en, /Open this week in the dashboard/);
  assert.doesNotMatch(en, /this month/);
  const fa = renderMonthlyReport({ interpretation, history: null, range, lang: 'fa', dashboardUrl: 'https://m.example/' });
  assert.match(fa, /گزارش هفتگی/);
  assert.match(fa, /شاهزاده رضا پهلوی/, 'Farsi reports use the Farsi service names');
  const index = renderReportIndex({ lang: 'en', months: ['2026-09'], weeks: ['2026-09-26', '2026-09-19'], today: '2026-09-26' });
  assert.match(index, /id="weekly"[\s\S]*report\?week=2026-09-19[\s\S]*id="monthly"[\s\S]*report\?month=2026-09/);
});

test('the monthly report shows how a shutdown unfolded, in Tehran time, without naming private persons', async () => {
  const { monthRange, renderMonthlyReport } = await import('../lib/report.mjs');
  const outageAnatomy = {
    start: '2026-01-08T16:30:00Z',
    onset: [{ kind: 'routes-v6', from: '2026-01-08T11:00:00Z', to: '2026-01-08T12:00:00Z', before: 433, after: 33, percent: 7.6 }],
    restoration: [{ kind: 'reach-day-after', from: '2026-02-01T18:00:00Z', to: '2026-02-02T06:00:00Z', percent: 97.9 }],
    networks: { from: '2026-01-09T00:00:00Z', to: '2026-01-16T00:00:00Z', foreignLeftOut: 5, networks: [
      { asn: 'AS49666', name: 'TIC / Zirsakht Gateway', share: 35.4, before: null, beforeBelow: 0.03 },
      { asn: 'AS210705', name: null, share: 4.5, before: 0.1, beforeBelow: null },
    ] },
  };
  const interpretation = { summary: { headline: { state: 'major-outage' } }, services: { items: [] }, dimensions: { connectivity: { outageAnatomy } } };
  const range = monthRange('2026-01', '2026-09-25');
  const en = renderMonthlyReport({ interpretation, history: null, range, lang: 'en', dashboardUrl: 'https://m.example/' });
  assert.match(en, /How the shutdown unfolded/);
  // 11:00–12:00 UTC is 14:30–15:30 in Tehran.
  assert.match(en, /Jan 2026 · \u206614:30–15:30\u2069/);
  assert.match(en, /33 of 433 Iranian IPv6 address ranges/);
  assert.match(en, /TIC \/ Zirsakht Gateway \(\u2066AS49666\u2069\)<\/th><td>35%<\/td><td>under 0.1%/);
  assert.match(en, /\u2066AS210705\u2069 · registered to a private person/);
  assert.match(en, /5 networks registered abroad/);
  const fa = renderMonthlyReport({ interpretation, history: null, range, lang: 'fa', dashboardUrl: 'https://m.example/' });
  assert.match(fa, /قطعی چگونه پیش رفت/);
  assert.match(fa, /۱۴۰۴، ساعت \u2066۱۴:۳۰–۱۵:۳۰\u2069/);
});

test('the daily updates page lists the entries readably and explains how to follow them', async () => {
  const { renderUpdatesPage } = await import('../lib/report.mjs');
  const entries = [{ id: '2026-09-25', title: 'Instagram is blocked', lines: ['What changed: none'], link: 'https://m.example/?lang=en' }];
  const en = renderUpdatesPage({ lang: 'en', entries, feedUrl: 'https://m.example/feed.xml', telegramUrl: 'https://t.me/example' });
  assert.match(en, /<h1>Daily updates<\/h1>/);
  assert.match(en, /Instagram is blocked/);
  assert.match(en, /https:\/\/m\.example\/feed\.xml/);
  assert.match(en, /https:\/\/t\.me\/example/);
  const fa = renderUpdatesPage({ lang: 'fa', entries: [], feedUrl: 'https://m.example/feed.xml?lang=fa' });
  assert.match(fa, /dir="rtl"/);
  assert.match(fa, /به‌روزرسانی روزانه/);
  assert.doesNotMatch(fa, /t\.me/, 'no Telegram line without a channel');
});

test('the sources page groups sources by what they may support, in both languages', async () => {
  const { renderSourcesPage } = await import('../lib/report.mjs');
  const sources = [
    { id: 'ooni', name: 'OONI', access: 'public', role: 'x', url: 'https://ooni.org/' },
    { id: 'censored-planet', name: 'Censored Planet', access: 'public', role: 'x', url: 'https://censoredplanet.org/' },
    { id: 'radar', name: 'Cloudflare Radar', access: 'token', role: 'x', url: 'https://radar.cloudflare.com/' },
  ];
  const overview = { input: { asn: 'AS58224', since: '2026-09-20', until: '2026-09-26' }, asnProfile: { name: 'TCI' },
    ooni: { ok: true, status: 'stale', staleSince: '2026-09-26T20:00:00Z' }, censoredPlanet: { ok: true, status: 'observed', fetchedAt: '2026-09-26T20:56:00Z' }, radar: { ok: true, status: 'token_required' } };
  const en = renderSourcesPage({ lang: 'en', sources, overview });
  assert.match(en, /Evidence of access[\s\S]*OONI[\s\S]*Measured from abroad[\s\S]*Censored Planet/);
  assert.match(en, /not answering; last good answer/);
  assert.match(en, /needs an operator key/);
  assert.match(en, /TCI \(⁦AS58224⁩\)/);
  const fa = renderSourcesPage({ lang: 'fa', sources, overview: null });
  assert.match(fa, /<html lang="fa" dir="rtl">/);
  assert.match(fa, /گواه دسترسی/);
});

test('the tools page shows measured status and official channels, and recommends nothing', async () => {
  const { renderToolsPage } = await import('../lib/report.mjs');
  const interpretation = { services: {
    workarounds: [{ id: 'tor', status: 'partly', usable: 444, ok: 389, failed: 55 }, { id: 'psiphon', status: 'fails', usable: 455, ok: 100, failed: 355 }],
    more: [{ id: 'circumvention', services: [{ id: 'psiphon', scope: 'country', status: 'blocked' }, { id: 'torproject', scope: 'country', status: 'blocked' }] }],
    conduit: { latest: { date: '2026-09-25', connections: 873608 } },
    encryptedDns: { byName: { tested: 12, ok: 0, failed: 12, status: 'fails' }, byAddress: { tested: 12, ok: 7, failed: 5, status: 'partly' } },
  } };
  const en = renderToolsPage({ lang: 'en', interpretation, since: '2026-09-20', until: '2026-09-26' });
  assert.match(en, /Tor Browser[\s\S]*worked in 389 of 444 tests/);
  assert.match(en, /Psiphon[\s\S]*failed in 355 of 455 tests[\s\S]*873,608/);
  assert.match(en, /gettor@torproject\.org/);
  assert.match(en, /get@psiphon3\.com/);
  assert.match(en, /Encrypted DNS[\s\S]*failed in 12 of 12 tests/);
  assert.match(en, /Riseup VPN[\s\S]*not measured from inside Iran/);
  assert.match(en, /recommends nothing/);
  const fa = renderToolsPage({ lang: 'fa', interpretation: null });
  assert.match(fa, /<html lang="fa" dir="rtl">/);
  assert.match(fa, /مرورگر تور/);
});
