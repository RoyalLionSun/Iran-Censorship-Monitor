import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FLEET_STAGE1_CONSENT_VERSION,
  FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS,
  readFleetStage1LocalConsent,
  validateFleetStage1ConsentRecord,
} from '../lib/fleet-stage1-consent.mjs';

const PROBE_ID = 'p_1234567890abcdef';
const NOW = new Date('2026-09-09T12:30:00.000Z');

function record(overrides = {}) {
  return {
    consentVersion: FLEET_STAGE1_CONSENT_VERSION,
    probeId: PROBE_ID,
    consentRecordId: 'cons_1234567890abcdef',
    issuedAt: '2026-09-09T12:00:00.000Z',
    expiresAt: '2026-10-09T11:59:59.000Z',
    acknowledgements: [...FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS],
    ...overrides,
  };
}

function file(content) {
  const dir = mkdtempSync(join(tmpdir(), 'iran-monitor-consent-'));
  const path = join(dir, 'consent.json');
  if (content != null) writeFileSync(path, content, 'utf8');
  return { path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('valid Stage 1 consent is pseudonymous, exact-schema and time bounded', () => {
  const parsed = validateFleetStage1ConsentRecord(record(), { probeId: PROBE_ID, now: NOW });
  assert.equal(parsed.probeId, PROBE_ID);
  assert.equal(parsed.consentRecordId, 'cons_1234567890abcdef');
  assert.deepEqual(parsed.acknowledgements, FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS);
});

test('consent rejects identity fields and arbitrary endpoint or command metadata', () => {
  for (const extra of [
    { name: 'operator' },
    { email: 'operator@example.invalid' },
    { phone: '+000' },
    { sourceIp: '192.0.2.1' },
    { host: 'example.invalid' },
    { port: 443 },
    { command: 'echo x' },
  ]) {
    assert.throws(() => validateFleetStage1ConsentRecord({ ...record(), ...extra }, { probeId: PROBE_ID, now: NOW }), /unsupported field/);
  }
});

test('consent is probe-bound and requires the complete fixed acknowledgement set', () => {
  assert.throws(() => validateFleetStage1ConsentRecord(record({ probeId: 'p_aaaaaaaaaaaaaaaa' }), { probeId: PROBE_ID, now: NOW }), /does not match/);
  assert.throws(() => validateFleetStage1ConsentRecord(record({ acknowledgements: FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS.slice(1) }), { probeId: PROBE_ID, now: NOW }), /missing acknowledgement/);
  assert.throws(() => validateFleetStage1ConsentRecord(record({ acknowledgements: [...FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS, FLEET_STAGE1_REQUIRED_ACKNOWLEDGEMENTS[0]] }), { probeId: PROBE_ID, now: NOW }), /duplicated/);
});

test('consent cannot exceed 30 days, start in the future or remain valid after expiry', () => {
  assert.throws(() => validateFleetStage1ConsentRecord(record({ expiresAt: '2026-10-10T12:00:01.000Z' }), { probeId: PROBE_ID, now: NOW }), /30-day/);
  assert.throws(() => validateFleetStage1ConsentRecord(record({ issuedAt: '2026-09-09T12:31:00.000Z' }), { probeId: PROBE_ID, now: NOW }), /not yet valid/);
  assert.throws(() => validateFleetStage1ConsentRecord(record({ expiresAt: '2026-09-09T12:30:00.000Z' }), { probeId: PROBE_ID, now: NOW }), /expired/);
});

test('local consent reader distinguishes unavailable expired invalid and valid without exposing identity data', async () => {
  const missing = file(null);
  const expired = file(JSON.stringify(record({ issuedAt: '2026-09-08T12:00:00.000Z', expiresAt: '2026-09-09T12:00:00.000Z' })));
  const invalid = file('{');
  const valid = file(JSON.stringify(record()));
  try {
    assert.equal((await readFleetStage1LocalConsent(missing.path, PROBE_ID, { now: NOW })).reason, 'consent_unavailable');
    assert.equal((await readFleetStage1LocalConsent(expired.path, PROBE_ID, { now: NOW })).reason, 'consent_expired');
    assert.equal((await readFleetStage1LocalConsent(invalid.path, PROBE_ID, { now: NOW })).reason, 'consent_invalid');
    const accepted = await readFleetStage1LocalConsent(valid.path, PROBE_ID, { now: NOW });
    assert.equal(accepted.authorized, true);
    assert.equal(accepted.reason, 'consent_valid');
    assert.equal(accepted.consentRecordId, 'cons_1234567890abcdef');
    assert.equal('name' in accepted, false);
    assert.equal('email' in accepted, false);
  } finally {
    missing.cleanup(); expired.cleanup(); invalid.cleanup(); valid.cleanup();
  }
});

test('local consent file must be an absolute local path', async () => {
  await assert.rejects(() => readFleetStage1LocalConsent('relative-consent.json', PROBE_ID, { now: NOW }), /absolute local path/);
});
