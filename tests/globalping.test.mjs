import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeGlobalpingControl, buildGlobalpingMeasurement, parseGlobalpingProbes, summariseGlobalpingProbes, validateGlobalpingTarget } from '../lib/globalping.mjs';
import { ACTIVE_HOSTS } from '../lib/active-collector.mjs';

test('Globalping inventory keeps only Iran probes and optional ASN scope', () => {
  const payload = [
    { version:'1', location:{ country:'IR', city:'Tehran', asn:58224, network:'TCI' }, tags:['eyeball-network'] },
    { version:'1', location:{ country:'DE', city:'Frankfurt', asn:24940, network:'Hetzner' }, tags:[] },
    { version:'1', location:{ country:'IR', city:'Tehran', asn:44244, network:'IranCell' }, tags:[] },
  ];
  assert.equal(parseGlobalpingProbes(payload).length, 2);
  assert.equal(parseGlobalpingProbes(payload, 'AS58224').length, 1);
});

test('the published inventory is counts per network, without cities, coordinates, resolvers or tags', () => {
  const probes = parseGlobalpingProbes([
    { location:{ country:'IR', city:'Tehran', asn:58224, network:'Iran Telecommunication Company PJS', latitude:35.7, longitude:51.4 }, tags:['eyeball-network'], resolvers:['10.0.0.1'] },
    { location:{ country:'IR', city:'Tabriz', asn:58224, network:'Iran Telecommunication Company PJS' }, tags:['datacenter-network'] },
    { location:{ country:'IR', city:'Shiraz', asn:212121, network:'Ali Example' }, tags:[] },
  ]);
  const summary = summariseGlobalpingProbes(probes, [{ asn: 'AS212121', privateRegistrant: true }]);
  assert.deepEqual(Object.keys(summary).sort(), ['cityCount', 'eyeballCount', 'networkCount', 'networks', 'probeCount']);
  assert.equal(summary.probeCount, 3);
  assert.equal(summary.cityCount, 3);
  assert.deepEqual(summary.networks[0], { asn:'AS58224', network:'Iran Telecommunication Company PJS', probes:2, cities:2, eyeball:1, datacenter:1 });
  assert.equal(summary.networks[1].network, null, 'a network held by a private person is shown by number');
  assert.doesNotMatch(JSON.stringify(summary), /Tehran|Tabriz|35\.7|10\.0\.0\.1|eyeball-network/);
});

test('the on-demand check asks only what the collector asks: allowed services, DNS or HTTPS, one Iranian network', () => {
  const allowed = { hosts: ACTIVE_HOSTS, iranAsns: new Set(['AS58224']) };
  const dns = buildGlobalpingMeasurement({ type:'dns', target:'www.instagram.com', asn:'AS58224', limit:50 }, allowed);
  assert.equal(dns.limit, 5);
  assert.deepEqual(dns.locations, [{ country:'IR', asn:58224, limit:5 }]);
  assert.deepEqual(dns.measurementOptions, { query: { type: 'A' } });
  const http = buildGlobalpingMeasurement({ type:'HTTP', target:'claude.ai', asn:'58224' }, allowed);
  assert.deepEqual(http.measurementOptions, { protocol:'HTTPS', request:{ method:'HEAD', path:'/' } });
  for (const type of ['ping', 'traceroute', 'mtr']) assert.throws(() => buildGlobalpingMeasurement({ type, target:'www.instagram.com', asn:'AS58224' }, allowed), /DNS and HTTPS/);
  for (const target of ['www.bbc.com', 'psiphon.ca', 'https://www.instagram.com/some/path', '1.1.1.1']) {
    assert.throws(() => buildGlobalpingMeasurement({ type:'dns', target, asn:'AS58224' }, allowed), /services the probes may check/);
  }
  assert.throws(() => buildGlobalpingMeasurement({ type:'dns', target:'www.instagram.com' }, allowed), /one network/);
  assert.throws(() => buildGlobalpingMeasurement({ type:'dns', target:'www.instagram.com', asn:'AS9009' }, allowed), /registered in Iran/);
  assert.throws(() => buildGlobalpingMeasurement({ type:'dns', target:'www.instagram.com', asn:'AS58224' }, { hosts: ACTIVE_HOSTS, iranAsns: null }), /registered in Iran/, 'without the registry nothing runs');
});

test('Globalping target validation blocks private and localhost targets', () => {
  for (const target of ['127.0.0.1','10.1.2.3','192.168.1.1','http://localhost/admin','http://169.254.169.254/latest',
    '::ffff:192.168.1.1','::ffff:c0a8:101','::ffff:169.254.169.254','64:ff9b::10.0.0.1','::127.0.0.1','ff02::1']) {
    assert.throws(() => validateGlobalpingTarget(target, target.startsWith('http') ? 'http' : 'ping'));
  }
  assert.equal(validateGlobalpingTarget('https://example.com/', 'http').hostname, 'example.com');
  assert.equal(validateGlobalpingTarget('::ffff:8.8.8.8', 'ping').hostname, '::ffff:8.8.8.8', 'a public address inside is allowed');
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
