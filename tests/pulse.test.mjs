import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePulseShutdowns } from '../lib/pulse.mjs';

const window = { since: '2026-01-01', until: '2026-01-31' };

test('Pulse filters Iran and selected window while retaining ongoing events', () => {
  const events = parsePulseShutdowns({ data: [
    { country: 'Iran', start_date: '2026-01-08T16:30:00Z', end_date: null, type: 'National shutdown', verification_level: 'unconfirmed', cause: 'security', affected_regions: 'Nationwide' },
    { country: 'France', start_date: '2026-01-09T00:00:00Z', end_date: null, type: 'National shutdown' },
    { country: 'Iran', start_date: '2025-01-01T00:00:00Z', end_date: '2025-01-02T00:00:00Z', type: 'National shutdown' },
  ] }, window);
  assert.equal(events.length, 1);
  assert.equal(events[0].startDate, '2026-01-08');
  assert.equal(events[0].endDate, null);
  assert.equal(events[0].independentTechnicalVote, false);
});

test('Pulse accepts IR country code', () => {
  assert.equal(parsePulseShutdowns({ data: [{ country: 'IR', start_date: '2026-01-08T00:00:00Z' }] }, window).length, 1);
});

test('Pulse fails closed when data array is missing', () => {
  assert.throws(() => parsePulseShutdowns({}, window), /missing data array/);
});

test('Pulse fails closed on malformed Iran timestamp', () => {
  assert.throws(() => parsePulseShutdowns({ data: [{ country: 'Iran', start_date: 'nope' }] }, window), /invalid start_date/);
});

test('Pulse fails closed when an Iran event ends before it starts', () => {
  assert.throws(() => parsePulseShutdowns({ data: [{ country: 'Iran', start_date: '2026-01-10', end_date: '2026-01-09' }] }, window), /ends before/);
});

test('Pulse deduplicates identical events deterministically', () => {
  const row = { country: 'Iran', start_date: '2026-01-08T16:30:00Z', end_date: null, type: 'National shutdown', affected_regions: 'Nationwide' };
  const events = parsePulseShutdowns({ data: [row, { ...row }] }, window);
  assert.equal(events.length, 1);
  assert.match(events[0].id, /^pulse-[0-9a-f]{8}$/);
});
