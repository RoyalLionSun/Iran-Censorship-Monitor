import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTEXT_CHECKED, CONTEXT_ITEMS, CONTEXT_SOURCES, contextItems } from '../public/context-items.js';

const DATE = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;
const LEADING_DATE = /^(\d{1,2}\s|\d{4}|(January|February|March|April|May|June|July|August|September|October|November|December)\b|[۰-۹])/;

test('every context entry is dated, sourced and written in both languages', () => {
  const ids = new Set();
  for (const item of CONTEXT_ITEMS) {
    assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
    ids.add(item.id);
    assert.ok(['control', 'privileged'].includes(item.panel), `${item.id}: unknown panel`);
    assert.match(item.date, DATE, `${item.id}: date`);
    if (item.until) {
      assert.match(item.until, DATE, `${item.id}: until`);
      assert.ok(item.until >= item.date, `${item.id}: span ends before it starts`);
    }
    if (item.added) assert.match(item.added, DATE, `${item.id}: added`);
    assert.ok(item.text?.en?.trim() && item.text?.fa?.trim(), `${item.id}: text in both languages`);
    // The page writes the date; a date in the text would appear twice.
    assert.doesNotMatch(item.text.en, LEADING_DATE, `${item.id}: English text starts with a date`);
    assert.doesNotMatch(item.text.fa, LEADING_DATE, `${item.id}: Farsi text starts with a date`);
    assert.doesNotMatch(item.text.fa, /^[A-Za-z]/, `${item.id}: Farsi text starts with a Latin word`);
    assert.ok(item.sources?.length, `${item.id}: needs a source`);
    for (const key of item.sources) assert.ok(CONTEXT_SOURCES[key], `${item.id}: unknown source ${key}`);
  }
  for (const [key, source] of Object.entries(CONTEXT_SOURCES)) {
    assert.match(source.date, DATE, `${key}: date`);
    assert.ok(source.name?.en && source.name?.fa, `${key}: name in both languages`);
    assert.ok(source.internal ? source.url.startsWith('/') : source.url.startsWith('https://'), `${key}: url`);
    assert.doesNotMatch(source.url, /wikipedia\.org/, `${key}: Wikipedia is not a source`);
    assert.doesNotMatch(source.name.fa, /^[A-Za-z]/, `${key}: Farsi name starts with a Latin word`);
  }
  assert.match(CONTEXT_CHECKED, DATE);
});

test('each panel lists its entries newest first, by their latest date', () => {
  for (const panel of ['control', 'privileged']) {
    const keys = contextItems(panel).map((item) => {
      const value = item.until ?? item.date;
      return value.length === 7 ? `${value}-15` : value;
    });
    assert.deepEqual(keys, [...keys].sort().reverse(), `${panel} is not newest first`);
  }
  const privileged = contextItems('privileged').map((item) => item.id);
  assert.equal(privileged[0], 'bloomberg');
  // "February to May 2026" counts as mid-May: after 25 May, before 14 May.
  assert.ok(privileged.indexOf('internetPro') < privileged.indexOf('services'));
  assert.ok(privileged.indexOf('internetProEnd') < privileged.indexOf('internetPro'));
  assert.equal(privileged.at(-1), 'perSubscriber');
});
