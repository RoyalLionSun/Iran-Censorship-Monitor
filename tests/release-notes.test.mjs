import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseTagForVersion, validateReleaseNotes, validateReleaseTag } from '../scripts/verify-release-notes.mjs';

const validNotes = `## Iran Censorship Monitor v9.8.7

This release contains a sufficiently detailed description of the implemented monitoring changes, evidence boundaries, source provenance and operator-facing behavior. It deliberately contains enough text to exercise the minimum release-note completeness gate without relying on placeholder content.

### Verification

Deterministic tests, build verification and presentation checks passed for this release candidate.

### Deployment boundary

Release publication does not authorize any otherwise disabled active measurement or deployment capability.`;

test('stable package versions map to exact v-prefixed release tags while prereleases skip the gate', () => {
  assert.equal(releaseTagForVersion('1.4.0'), 'v1.4.0');
  assert.equal(releaseTagForVersion('1.4.0-dev'), null);
  assert.throws(() => releaseTagForVersion('1.4'), /Unsupported package version/);
});

test('release tags accept only stable semantic versions', () => {
  assert.equal(validateReleaseTag('v1.4.0'), 'v1.4.0');
  assert.throws(() => validateReleaseTag('1.4.0'), /Invalid stable release tag/);
  assert.throws(() => validateReleaseTag('v1.4.0-dev'), /Invalid stable release tag/);
});

test('complete canonical release notes pass the release gate', () => {
  assert.equal(validateReleaseNotes('v9.8.7', validNotes), validNotes);
});

test('release notes fail closed on missing sections, placeholders or insufficient content', () => {
  assert.throws(() => validateReleaseNotes('v9.8.7', 'short'), /too short/);
  assert.throws(() => validateReleaseNotes('v9.8.7', validNotes.replace('### Verification', '### Checks')), /Verification/);
  assert.throws(() => validateReleaseNotes('v9.8.7', validNotes.replace('### Deployment boundary', '### Deployment')), /Deployment boundary/);
  assert.throws(() => validateReleaseNotes('v9.8.7', `${validNotes}\n\nTODO`), /placeholder/);
});
