import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getAsnNames, publicNetworkName } from '../lib/asn-names.mjs';

// Invented names only: a test must never carry a real person's name.
test('a network name is shown only when it names an organisation', () => {
  assert.equal(publicNetworkName('AS1', 'Example Pardazesh PJSC'), 'Example Pardazesh PJSC');
  assert.equal(publicNetworkName('AS2', 'Example University of Medical Sciences'), 'Example University of Medical Sciences');
  assert.equal(publicNetworkName('AS3', 'Example Online'), 'Example Online');
  assert.equal(publicNetworkName('AS3', 'Moavenate rasaneh majazi seda va sima'), 'Moavenate rasaneh majazi seda va sima', 'a department of the state broadcaster');
  assert.equal(publicNetworkName('AS4', 'Firstname Lastname'), null);
  assert.equal(publicNetworkName('AS5', 'LASTNAME Firstname'), null);
  assert.equal(publicNetworkName('AS6', ''), null);
  assert.equal(publicNetworkName('AS7', null), null);
  assert.equal(publicNetworkName('AS8', 'Firstname Lastname', [{ asn: 'AS8', name: 'Reviewed Operator' }]), 'Reviewed Operator', 'the reviewed catalogue is trusted');
});

test('names from the directory pass the same rule, and a person in it is never looked up again', async () => {
  const directory = { entries: { AS10: { name: 'Example Telecom Co' }, AS11: { name: 'Firstname Lastname' } } };
  const names = await getAsnNames(['AS10', 'AS11', 'AS12'], [{ asn: 'AS12', name: 'Reviewed Operator' }], directory);
  assert.deepEqual(names, { AS10: 'Example Telecom Co', AS12: 'Reviewed Operator' });
});

test('every place that shows registry names uses the rule', async () => {
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.match(server, /getAsnNames\(shown, asns, directory\)/);
  assert.match(server, /displayName: publicNetworkName\(row\.asn, row\.displayName, asns\) \?\? row\.asn/);
  assert.match(server, /name: publicNetworkName\(asn, directory\.entries\[asn\]\.name, asns\)/);
  const anatomy = await readFile(new URL('../lib/anatomy.mjs', import.meta.url), 'utf8');
  assert.match(anatomy, /export const organisationName = publicNetworkName;/);
});

test('a catalogue network held by a private person carries no name, handle or organisation', async () => {
  assert.equal(publicNetworkName('AS9', 'Registered to a private person', [{ asn: 'AS9', name: 'Registered to a private person', privateRegistrant: true }]), null);
  const catalog = JSON.parse(await readFile(new URL('../data/asns.json', import.meta.url), 'utf8'));
  for (const entry of catalog.filter((item) => item.privateRegistrant)) {
    assert.equal(entry.registryName, null, entry.asn);
    assert.equal(entry.asName, null, entry.asn);
    assert.equal(entry.orgId, null, entry.asn);
    assert.equal(entry.name, 'Registered to a private person', entry.asn);
  }
  // Every other catalogue name is an organisation the rule recognises, or reviewed as one.
  const unrecognised = catalog.filter((item) => !item.privateRegistrant && !publicNetworkName(item.asn, item.name) && !publicNetworkName(item.asn, item.registryName));
  assert.deepEqual(unrecognised.map((item) => item.asn), []);
});
