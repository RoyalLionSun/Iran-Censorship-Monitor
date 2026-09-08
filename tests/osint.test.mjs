import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGdeltUrl, parseGdelt } from '../lib/osint.mjs';

test('GDELT URL is Iran censorship scoped and bounded to recent corpus', () => {
  const now = new Date();
  const until = now.toISOString().slice(0,10);
  now.setUTCDate(now.getUTCDate()-6);
  const since = now.toISOString().slice(0,10);
  const built = buildGdeltUrl({ since, until });
  assert.equal(built.available, true);
  const url = new URL(built.url);
  assert.match(url.searchParams.get('query'), /Iran/);
  assert.equal(url.searchParams.get('maxrecords'), '250');
});

test('GDELT parser keeps only professional allowlisted domains', () => {
  const rows = parseGdelt({ articles: [
    { url:'https://asl19.org/en/blog/example', title:'Iran internet shutdown', seendate:'20260908T010000Z' },
    { url:'https://random-blog.example/post', title:'claim' },
    { url:'https://www.bbc.com/news/example', title:'report' },
  ]});
  assert.deepEqual(rows.map((row)=>row.domain), ['asl19.org','bbc.com']);
});
