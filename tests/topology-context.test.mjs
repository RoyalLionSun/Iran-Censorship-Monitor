import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPeeringDbUrl, parsePeeringDb } from '../lib/peeringdb.mjs';
import { buildIhrHegemonyUrl, parseIhrHegemony } from '../lib/ihr.mjs';
import { parsePulseShutdowns } from '../lib/pulse.mjs';

test('PeeringDB query is guest-readable and ASN scoped', () => {
  const url = new URL(buildPeeringDbUrl('AS58224'));
  assert.equal(url.searchParams.get('asn'), '58224');
  assert.equal(url.searchParams.get('depth'), '1');
  const parsed = parsePeeringDb({data:[{id:1,asn:58224,name:'TCI',ix_count:2,fac_count:3}]});
  assert.equal(parsed[0].ixCount, 2);
});

test('IHR dependency request is limited to final seven days and selected origin ASN', () => {
  const built = buildIhrHegemonyUrl({asn:'AS58224', since:'2026-08-01', until:'2026-09-08'});
  const url = new URL(built.url);
  assert.equal(url.searchParams.get('originasn'), '58224');
  assert.equal(built.effectiveSince, '2026-09-02');
});

test('IHR parser selects latest timebin and strongest dependencies', () => {
  const parsed = parseIhrHegemony({count:3,results:[
    {timebin:'2026-09-07T00:00:00Z',originasn:58224,asn:1,hege:0.2,af:4},
    {timebin:'2026-09-08T00:00:00Z',originasn:58224,asn:2,hege:0.3,af:4},
    {timebin:'2026-09-08T00:00:00Z',originasn:58224,asn:3,hege:0.7,af:4},
  ]});
  assert.equal(parsed.latestTimebin,'2026-09-08T00:00:00Z');
  assert.equal(parsed.dependencies[0].transitAsn,3);
});

test('Pulse parser keeps only Iran incidents and preserves verification level', () => {
  const rows = parsePulseShutdowns({data:[
    {country:'Iran',start_date:'2026-01-08T16:30:00Z',type:'national',verification_level:'unconfirmed',cause:'protests'},
    {country:'France',start_date:'2026-01-01T00:00:00Z'}
  ]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].verificationLevel,'unconfirmed');
});
