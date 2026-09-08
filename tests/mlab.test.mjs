import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMlabComparison, buildMlabStatsUrls, MLAB_MIN_DAILY_SAMPLES, parseMlabStats } from '../lib/mlab.mjs';

test('M-Lab URLs are Iran scoped and optionally ASN scoped', () => {
  assert.deepEqual(buildMlabStatsUrls({ since: '2026-09-01', until: '2026-09-08', asn: '' }), [
    { year: 2026, url: 'https://statistics.measurementlab.net/v0/AS/IR/2026/histogram_daily_stats.json' },
  ]);
  assert.deepEqual(buildMlabStatsUrls({ since: '2025-12-31', until: '2026-01-02', asn: '58224' }), [
    { year: 2025, url: 'https://statistics.measurementlab.net/v0/AS/IR/asn/AS58224/2025/histogram_daily_stats.json' },
    { year: 2026, url: 'https://statistics.measurementlab.net/v0/AS/IR/asn/AS58224/2026/histogram_daily_stats.json' },
  ]);
});

test('M-Lab parser collapses histogram buckets to one daily summary point', () => {
  const parsed = parseMlabStats([[
    { date: '2026-09-01', bucket_min: 0, bucket_max: 1.7, download_MED: 12, upload_MED: 4, download_minRTT_MED: 80, upload_minRTT_MED: 82, dl_samples_day: 50, ul_samples_day: 44, dl_frac_bucket: 0.2, dl_samples_bucket: 10, ul_frac_bucket: 0.1, ul_samples_bucket: 4 },
    { date: '2026-09-01', bucket_min: 1.7, bucket_max: 5.6, download_MED: 12, upload_MED: 4, download_minRTT_MED: 80, upload_minRTT_MED: 82, dl_samples_day: 50, ul_samples_day: 44, dl_frac_bucket: 0.8, dl_samples_bucket: 40, ul_frac_bucket: 0.9, ul_samples_bucket: 40 },
    { date: '2026-08-31', bucket_min: 0, bucket_max: 1.7, download_MED: 20, dl_samples_day: 100 },
  ]], { since: '2026-09-01', until: '2026-09-01', asn: 'AS58224' });

  assert.equal(parsed.points.length, 1);
  assert.equal(parsed.points[0].downloadMedianMbps, 12);
  assert.equal(parsed.points[0].downloadSamples, 50);
  assert.equal(parsed.points[0].downloadHistogram.length, 2);
  assert.equal(parsed.asn, 'AS58224');
});

test('M-Lab comparison requires sample coverage before calculating degradation context', () => {
  const points = Array.from({ length: 8 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    downloadMedianMbps: index < 5 ? 20 : 10,
    uploadMedianMbps: index < 5 ? 8 : 4,
    downloadMinRttMedianMs: index < 5 ? 50 : 100,
    downloadSamples: index === 0 ? MLAB_MIN_DAILY_SAMPLES - 1 : 100,
    uploadSamples: 100,
  }));

  const comparison = buildMlabComparison(points);
  assert.equal(comparison.status, 'observed');
  assert.equal(comparison.metrics.downloadMedianMbps.baselineMedian, 20);
  assert.equal(comparison.metrics.downloadMedianMbps.recentMedian, 10);
  assert.equal(comparison.metrics.downloadMedianMbps.changePercent, -50);
  assert.equal(comparison.metrics.downloadMinRttMedianMs.changePercent, 100);
  assert.equal(comparison.metrics.downloadMedianMbps.baselineDays.length, 4);
  assert.equal(comparison.metrics.downloadMedianMbps.recentDays.length, 3);
});

test('M-Lab comparison returns insufficient-data rather than inventing a trend', () => {
  const points = Array.from({ length: 5 }, (_, index) => ({
    date: `2026-09-${String(index + 1).padStart(2, '0')}`,
    downloadMedianMbps: 10,
    uploadMedianMbps: 5,
    downloadMinRttMedianMs: 60,
    downloadSamples: 100,
    uploadSamples: 100,
  }));
  const comparison = buildMlabComparison(points);
  assert.equal(comparison.status, 'insufficient-data');
  assert.equal(comparison.metrics.downloadMedianMbps.status, 'insufficient-data');
});
