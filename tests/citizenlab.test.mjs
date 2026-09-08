import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCitizenLabIranList } from '../lib/citizenlab.mjs';

test('Citizen Lab Iran CSV parser preserves quoted notes', () => {
  const text = 'url,category_code,category_description,date_added,source,notes\nhttps://example.com/,NEWS,News Media,2026-01-01,OONI,"note, with comma"\n';
  const rows = parseCitizenLabIranList(text);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].notes, 'note, with comma');
  assert.equal(rows[0].categoryCode, 'NEWS');
});
