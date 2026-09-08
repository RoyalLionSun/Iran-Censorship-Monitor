import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGlobalpingControl, buildGlobalpingMeasurement, parseGlobalpingProbes, validateGlobalpingTarget } from '../lib/globalping.mjs';

test('Globalping inventory keeps only Iran probes and optional ASN scope', () => {
  const payload = [
    { version:'1', location:{ country:'IR', city:'Tehran', asn:58224, network:'TCI' }, tags:['eyeball-network'] },
    { version:'1', location:{ country:'DE', city:'Frankfurt', asn:24940, network:'Hetzner' }, tags:[] },
    { version:'1', location:{ country:'IR', city:'Tehran', asn:44244, network:'IranCell' }, tags:[] },
  ];
  assert.equal(parseGlobalpingProbes(payload).length, 2);
  assert.equal(parseGlobalpingProbes(payload, 'AS58224').length, 1);
});

test('Globalping active request is Iran-only and limited to five probes', () => {
  const request = buildGlobalpingMeasurement({ type:'ping', target:'1.1.1.1', asn:'AS58224', limit:50 });
  assert.equal(request.limit, 5);
  assert.deepEqual(request.locations, [{ country:'IR', limit:5, asn:58224 }]);
});

test('Globalping target validation blocks private and localhost targets', () => {
  for (const target of ['127.0.0.1','10.1.2.3','192.168.1.1','http://localhost/admin','http://169.254.169.254/latest']) {
    assert.throws(() => validateGlobalpingTarget(target, target.startsWith('http') ? 'http' : 'ping'));
  }
  assert.equal(validateGlobalpingTarget('https://example.com/', 'http').hostname, 'example.com');
});

test('Globalping active controls are disabled by default and require key', () => {
  const oldEnabled = process.env.GLOBALPING_ACTIVE_ENABLED;
  const oldKey = process.env.GLOBALPING_CONTROL_KEY;
  delete process.env.GLOBALPING_ACTIVE_ENABLED;
  delete process.env.GLOBALPING_CONTROL_KEY;
  assert.equal(authorizeGlobalpingControl('x').ok, false);
  process.env.GLOBALPING_ACTIVE_ENABLED='true';
  process.env.GLOBALPING_CONTROL_KEY='long-local-control-key';
  assert.equal(authorizeGlobalpingControl('wrong').ok, false);
  assert.equal(authorizeGlobalpingControl('long-local-control-key').ok, true);
  if (oldEnabled === undefined) delete process.env.GLOBALPING_ACTIVE_ENABLED; else process.env.GLOBALPING_ACTIVE_ENABLED=oldEnabled;
  if (oldKey === undefined) delete process.env.GLOBALPING_CONTROL_KEY; else process.env.GLOBALPING_CONTROL_KEY=oldKey;
});
