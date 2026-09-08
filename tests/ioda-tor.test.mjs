import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIodaEvents, parseIodaSeries } from '../lib/ioda.mjs';
import { parseTorBridgeStats, parseTorUserStats } from '../lib/tor.mjs';

test('IODA raw series parser accepts enveloped v2-style data', () => {
  const payload = { data: [{ entityType:'country', entityCode:'IR', datasource:'ping-slash24', from:1788739200, until:1788739380, step:60, values:[10,8,5,7] }] };
  const rows = parseIodaSeries(payload);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].datasource, 'ping-slash24');
  assert.equal(rows[0].sampleCount, 4);
  assert.equal(rows[0].latest, 7);
  assert.equal(rows[0].windowMedian, 7.5);
});

test('IODA outage parser supports IODA and CODF field shapes', () => {
  const payload = { data: [
    { datasource:'bgp', entityType:'country', entityCode:'IR', from:1788739200, until:1788742800, score:20 },
    { datasource:'ping-slash24', location:'country/IR', start:1788746400, duration:600, score:30, location_name:'Iran' },
  ] };
  const rows = parseIodaEvents(payload);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].entityCode, 'IR');
  assert.equal(rows[1].durationSeconds, 600);
});

test('Tor relay CSV parser preserves expected lower/upper bands', () => {
  const text = '# comment\ndate,country,users,lower,upper,frac\n2026-09-01,ir,1200,1000,1500,95\n2026-09-02,ir,900,1000,1500,94\n';
  const rows = parseTorUserStats(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].users, 900);
  assert.equal(rows[1].lower, 1000);
});

test('Tor bridge CSV parser accepts country usage series', () => {
  const text = 'date,country,users,frac\n2026-09-01,ir,300,92\n';
  const rows = parseTorBridgeStats(text);
  assert.deepEqual(rows[0], { date:'2026-09-01', country:'ir', users:300, frac:92 });
});
