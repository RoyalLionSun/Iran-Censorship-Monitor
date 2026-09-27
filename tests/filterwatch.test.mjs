import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFilterwatchUrl, getFilterwatchReports, parseFilterwatchPosts } from '../lib/filterwatch.mjs';
import { renderMonthlyReport } from '../lib/report.mjs';

test('Filterwatch is asked for the period, in the reader\'s language, only for monitoring and investigations', () => {
  const en = new URL(buildFilterwatchUrl({ lang: 'en', since: '2026-03-01', until: '2026-03-31' }));
  assert.equal(en.origin + en.pathname, 'https://filter.watch/english/wp-json/wp/v2/posts');
  assert.equal(en.searchParams.get('after'), '2026-03-01T00:00:00');
  assert.equal(en.searchParams.get('before'), '2026-04-01T00:00:00', 'the last day is included');
  assert.equal(en.searchParams.get('categories'), '4,3');
  assert.match(buildFilterwatchUrl({ lang: 'fa', since: '2026-03-01', until: '2026-03-31' }), /^https:\/\/filter\.watch\/wp-json\/.*categories=7%2C9/);
  assert.throws(() => buildFilterwatchUrl({ since: 'x', until: '2026-03-31' }));
});

test('titles are plain text and only the site\'s own web links are kept', () => {
  const posts = parseFilterwatchPosts([
    { date_gmt: '2026-03-17T08:21:30', link: 'https://filter.watch/english/2026/03/17/report/', title: { rendered: 'Is Iran Bracing for a Repeat? Access &#8217;Bans&#8217; &amp; <b>More</b>' } },
    { date_gmt: '2026-03-18T00:00:00', link: 'javascript:alert(1)', title: { rendered: 'x' } },
    { date_gmt: '2026-03-19T00:00:00', link: 'https://elsewhere.example/2026/', title: { rendered: 'y' } },
  ], 'en');
  assert.deepEqual(posts, [{ date: '2026-03-17', title: 'Is Iran Bracing for a Repeat? Access ’Bans’ & More', url: 'https://filter.watch/english/2026/03/17/report/' }]);
  assert.deepEqual(parseFilterwatchPosts({ code: 'rest_error' }), []);
});

test('a report links the period\'s expert analysis as context, escaped', async () => {
  const expert = await getFilterwatchReports({ lang: 'en', since: '2026-03-01', until: '2026-03-31', complete: true, fetch: async () => [
    { date_gmt: '2026-03-17T08:21:30', link: 'https://filter.watch/english/2026/03/17/report/', title: { rendered: 'Report &lt;script&gt;' } },
  ] });
  assert.equal(expert.independentCensorshipVote, false);
  const range = { month: '2026-03', since: '2026-03-01', until: '2026-03-31', complete: true };
  const interpretation = { summary: { headline: { state: 'services-blocked', services: [] } }, services: { items: [] }, dimensions: { connectivity: {} } };
  const en = renderMonthlyReport({ interpretation, history: null, range, lang: 'en', dashboardUrl: 'https://m.example/', expert });
  assert.match(en, /Expert analysis published in this period/);
  assert.match(en, /analysis, not a measurement/);
  assert.match(en, /<a href="https:\/\/filter\.watch\/english\/2026\/03\/17\/report\/" rel="noreferrer">Report &lt;script&gt;<\/a>/);
  assert.doesNotMatch(renderMonthlyReport({ interpretation, history: null, range, lang: 'en', dashboardUrl: 'https://m.example/' }), /Expert analysis/, 'no section without reports');
});
