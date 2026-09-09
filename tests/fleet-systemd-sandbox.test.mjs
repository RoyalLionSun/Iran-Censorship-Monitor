import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateFleetProbeLabUnit, validateFleetCollectorLabUnit } from '../lib/fleet-systemd-sandbox.mjs';

const probePath = new URL('../deploy/fleet-stage1-lab/fleet-probe-lab.service', import.meta.url);
const collectorPath = new URL('../deploy/fleet-stage1-lab/fleet-collector-lab.service', import.meta.url);
const harnessPath = new URL('../scripts/fleet-stage1-lab-egress-check.mjs', import.meta.url);

const probe = fs.readFileSync(probePath, 'utf8');
const collector = fs.readFileSync(collectorPath, 'utf8');
const harness = fs.readFileSync(harnessPath, 'utf8');

function replaceOnce(text, from, to) {
  assert.ok(text.includes(from), `fixture missing ${from}`);
  return text.replace(from, to);
}

test('Stage 1 probe lab unit is default-deny and loopback-only at systemd level', () => {
  assert.deepEqual(validateFleetProbeLabUnit(probe), { role: 'probe', status: 'valid' });
});

test('Stage 1 collector lab unit has no IP address family or Internet namespace', () => {
  assert.deepEqual(validateFleetCollectorLabUnit(collector), { role: 'collector', status: 'valid' });
});

test('probe sandbox fails closed if egress default-deny is removed or widened', () => {
  assert.throws(() => validateFleetProbeLabUnit(replaceOnce(probe, 'IPAddressDeny=any', 'IPAddressDeny=')), /IPAddressDeny/);
  assert.throws(() => validateFleetProbeLabUnit(replaceOnce(probe, 'IPAddressAllow=localhost', 'IPAddressAllow=any')), /IPAddressAllow/);
});

test('probe sandbox fails closed if privilege controls are weakened', () => {
  assert.throws(() => validateFleetProbeLabUnit(replaceOnce(probe, 'NoNewPrivileges=yes', 'NoNewPrivileges=no')), /NoNewPrivileges/);
  assert.throws(() => validateFleetProbeLabUnit(replaceOnce(probe, 'User=iran-fleet-probe-lab', 'User=root')), /User/);
  assert.throws(() => validateFleetProbeLabUnit(replaceOnce(probe, 'CapabilityBoundingSet=', 'CapabilityBoundingSet=CAP_NET_ADMIN')), /CapabilityBoundingSet/);
});

test('collector sandbox fails closed if an Internet address family or IP allowlist is added', () => {
  assert.throws(() => validateFleetCollectorLabUnit(replaceOnce(collector, 'RestrictAddressFamilies=AF_UNIX', 'RestrictAddressFamilies=AF_UNIX AF_INET')), /RestrictAddressFamilies/);
  assert.throws(() => validateFleetCollectorLabUnit(`${collector}\nIPAddressAllow=localhost\n`), /IPAddressAllow/);
});

test('lab units are ephemeral and not persistently enableable', () => {
  assert.equal(probe.includes('[Install]'), false);
  assert.equal(collector.includes('[Install]'), false);
  assert.match(probe, /ConditionPathExists=\/run\/iran-censorship-monitor\/stage1-lab\.enable/);
  assert.match(collector, /ConditionPathExists=\/run\/iran-censorship-monitor\/stage1-lab\.enable/);
});

test('egress harness has fixed destinations and no DNS HTTP shell or child-process client', () => {
  assert.match(harness, /127\.0\.0\.1/);
  assert.match(harness, /198\.51\.100\.1/);
  assert.match(harness, /169\.254\.169\.254/);
  assert.doesNotMatch(harness, /node:(dns|http|https|child_process)/);
  assert.doesNotMatch(harness, /process\.env\.[A-Z_]*HOST/);
  assert.doesNotMatch(harness, /exec\(|spawn\(|fork\(/);
});

test('egress harness requires explicit lab mode and treats timeout as insufficient proof of policy denial', () => {
  assert.match(harness, /FLEET_STAGE1_LAB_ONLY !== '1'/);
  assert.match(harness, /did not prove local policy denial/);
  assert.doesNotMatch(harness, /POLICY_DENIED[^\n]*TIMEOUT/);
});
