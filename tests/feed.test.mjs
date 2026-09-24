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
