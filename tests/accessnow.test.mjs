import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_NOW_STOP_DATASET_THROUGH_YEAR, ACCESS_NOW_STOP_URL, parseAccessNowStop, parseCsv } from '../lib/accessnow.mjs';

const header = [
  'start_date_type','start_date','country','geo_scope','area_name','shutdown_type','affected_network','shutdown_extent','ordered_by','decision_maker','actual_cause','actual_cause_details','info_source','info_source_link','shutdown_status','end_date','duration','gov_justification','gov_ack','facebook_affected','twitter_affected','whatsapp_affected','instagram_affected','telegram_affected','other_affected','sms_affected','phonecall_affected','telcos_involved','election','violence','hr_abuse_reported','users_targeted','users_target_detail','event','an_link','region'
];

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function row(values = {}) {
  return header.map((key) => csvCell(values[key] ?? '')).join(',');
}

function fixture(rows) {
  return [header.join(','), ...rows].join('\n');
}

test('STOP adapter uses the official public Access Now sheet export and declares published coverage', () => {
  assert.match(ACCESS_NOW_STOP_URL, /docs\.google\.com\/spreadsheets\/d\/1DvPAuHNLp5BXGb0nnZDGNoiIwEeu2ogdXEIDvT4Hyfk\/gviz\/tq/);
  assert.equal(ACCESS_NOW_STOP_DATASET_THROUGH_YEAR, 2025);
});

test('CSV parser preserves quoted commas, quotes and embedded newlines', () => {
  const rows = parseCsv('a,b,c\n1,"two, \"\"quoted\"\"\nlines",3');
  assert.deepEqual(rows, [['a','b','c'], ['1','two, "quoted"\nlines','3']]);
});

test('STOP parser keeps only Iran incidents overlapping the selected window and preserves provenance', () => {
  const text = fixture([
    row({
      start_date_type:'Actual', start_date:'9/21/2022', country:'Iran (Islamic Republic of)', geo_scope:'It affected locations in more than one state, province, or region', area_name:'Nationwide', shutdown_type:'Shutdown, Throttle', affected_network:'Broadband, Mobile', shutdown_extent:'Full network, Service-based', ordered_by:'Executive government', actual_cause:'Protests', info_source:'CSO KIO partners', info_source_link:'https://explorer.ooni.org/findings/123; https://radar.cloudflare.com/ir', shutdown_status:'Ended', end_date:'10/7/2022', duration:'17', gov_ack:'Yes', whatsapp_affected:'Yes', instagram_affected:'Yes', other_affected:'Signal', violence:'Yes', hr_abuse_reported:'Yes', event:'Nationwide disruption, with platform blocking\nand throttling.', an_link:'https://www.accessnow.org/example/', region:'MENA'
    }),
    row({ start_date:'9/20/2022', country:'France', shutdown_type:'Shutdown', shutdown_extent:'Full network', info_source:'News media article', shutdown_status:'Ended', end_date:'9/20/2022', event:'Not Iran' }),
    row({ start_date:'1/1/2020', country:'Iran (Islamic Republic of)', shutdown_type:'Shutdown', shutdown_extent:'Service-based', info_source:'CSO KIO partners', shutdown_status:'Ended', end_date:'1/2/2020', event:'Outside selected window' }),
  ]);

  const incidents = parseAccessNowStop(text, { since:'2022-09-15', until:'2022-09-30' });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].startDate, '2022-09-21');
  assert.equal(incidents[0].endDate, '2022-10-07');
  assert.equal(incidents[0].durationDays, 17);
  assert.equal(incidents[0].governmentAcknowledged, true);
  assert.equal(incidents[0].platforms.whatsapp, true);
  assert.equal(incidents[0].humanRightsAbuseReported, true);
  assert.equal(incidents[0].independentTechnicalVote, false);
  assert.deepEqual(incidents[0].evidenceLineage.map((entry) => entry.source).sort(), ['Cloudflare Radar','OONI']);
  assert.match(incidents[0].event, /platform blocking\nand throttling/);
});

test('ongoing Iran records overlap later windows but unknown status is not assumed ongoing', () => {
  const text = fixture([
    row({ start_date:'5/1/2018', country:'Iran (Islamic Republic of)', shutdown_type:'Shutdown', shutdown_extent:'Service-based', info_source:'CSO KIO partners', info_source_link:'https://explorer.ooni.org/chart/mat?probe_cc=IR', shutdown_status:'Ongoing', telegram_affected:'Yes', event:'Telegram block remains ongoing.' }),
    row({ start_date:'1/1/2019', country:'Iran (Islamic Republic of)', shutdown_type:'Shutdown', shutdown_extent:'Service-based', info_source:'Other', shutdown_status:'Unknown', event:'Unknown status should not project forward.' }),
  ]);

  const incidents = parseAccessNowStop(text, { since:'2026-09-01', until:'2026-09-09' });
  assert.equal(incidents.length, 1);
  assert.equal(incidents[0].status, 'Ongoing');
  assert.equal(incidents[0].platforms.telegram, true);
});

test('STOP parser fails closed when required schema columns disappear', () => {
  assert.throws(() => parseAccessNowStop('country,event\nIran,example', { since:'2026-09-01', until:'2026-09-09' }), /schema missing required column/);
});
