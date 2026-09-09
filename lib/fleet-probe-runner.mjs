import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import {
  signFleetResult,
  validateFleetResult,
  verifyFleetManifestEnvelope,
} from './fleet.mjs';
import { compileFleetExecutionPlan, executeFleetPlanEntry } from './fleet-execution.mjs';
import { createFleetStage0LabAdapters } from './fleet-lab-adapters.mjs';

export const FLEET_STAGE0_ENABLE_MARKER = 'FLEET_STAGE0_ENABLED=1\n';

function validProbeId(value) {
  return typeof value === 'string' && /^p_[A-Za-z0-9_-]{16,64}$/.test(value);
}

function instant(value, name) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${name} is invalid.`);
  return date;
}

function assertProbeSecret(secret) {
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(String(secret ?? ''));
  if (key.length < 32) throw new Error('Fleet Stage 0 local probe secret must contain at least 32 bytes.');
}

export async function readFleetStage0LocalGate(enableFile, { reader = readFile } = {}) {
  if (typeof enableFile !== 'string' || !isAbsolute(enableFile)) {
    throw new Error('Fleet Stage 0 local enable file must be an absolute local path.');
  }
  if (typeof reader !== 'function') throw new Error('Fleet Stage 0 local gate reader is invalid.');
  try {
    const content = await reader(enableFile, 'utf8');
    if (content === FLEET_STAGE0_ENABLE_MARKER) {
      return Object.freeze({ enabled: true, reason: 'local_marker_enabled' });
    }
    return Object.freeze({ enabled: false, reason: 'local_marker_disabled' });
  } catch {
    return Object.freeze({ enabled: false, reason: 'local_marker_unavailable' });
  }
}

function assertMeasuredWithinManifest(measuredAt, manifest) {
  const measured = measuredAt.getTime();
  const issued = Date.parse(manifest.issuedAt);
  const expires = Date.parse(manifest.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || measured < issued || measured >= expires) {
    throw new Error('Fleet Stage 0 measurement completed outside the signed manifest window; result discarded.');
  }
}

export async function runFleetStage0Probe({
  probeId,
  probeSecret,
  manifestEnvelope,
  schedulerPublicKey,
  targets,
  localEnableFile,
  adapters = null,
  now = () => new Date(),
  gateReader = readFile,
} = {}) {
  if (!validProbeId(probeId)) throw new Error('Fleet Stage 0 probeId is invalid.');
  if (typeof now !== 'function') throw new Error('Fleet Stage 0 clock is invalid.');

  const gate = await readFleetStage0LocalGate(localEnableFile, { reader: gateReader });
  if (!gate.enabled) {
    return Object.freeze({
      status: 'disabled',
      reason: gate.reason,
      measurements: 0,
      envelopes: Object.freeze([]),
      evidenceRole: 'owned-probe-local-gate',
      independentCensorshipVote: false,
    });
  }

  if (!manifestEnvelope) throw new Error('Fleet Stage 0 requires a signed manifest envelope.');
  if (!schedulerPublicKey) throw new Error('Fleet Stage 0 requires the scheduler public key.');
  assertProbeSecret(probeSecret);

  const startedAt = instant(now(), 'Fleet Stage 0 start time');
  const manifest = verifyFleetManifestEnvelope(manifestEnvelope, schedulerPublicKey, targets, { now: startedAt });
  const plan = compileFleetExecutionPlan(manifest, targets, { now: startedAt });
  const localAdapters = adapters ?? createFleetStage0LabAdapters();
  const envelopes = [];

  for (const entry of plan.tests) {
    const execution = await executeFleetPlanEntry(entry, localAdapters);
    const measuredAt = instant(now(), 'Fleet Stage 0 measuredAt');
    assertMeasuredWithinManifest(measuredAt, manifest);

    const rawResult = {
      probeId,
      policyVersion: plan.policyVersion,
      manifestNonce: plan.manifestNonce,
      testId: execution.testId,
      targetId: execution.targetId,
      family: execution.family,
      af: execution.af,
      measuredAt: measuredAt.toISOString(),
      outcome: execution.adapterResult.outcome,
      stages: execution.adapterResult.stages,
      timingsMs: execution.adapterResult.timingsMs,
      errorCode: execution.adapterResult.errorCode ?? null,
    };
    validateFleetResult(rawResult, { now: measuredAt });
    envelopes.push(Object.freeze({
      result: Object.freeze(rawResult),
      mac: signFleetResult(rawResult, probeSecret),
    }));
  }

  return Object.freeze({
    status: 'completed',
    reason: 'local_marker_enabled',
    measurements: envelopes.length,
    envelopes: Object.freeze(envelopes),
    evidenceRole: 'owned-probe-stage0-run',
    independentCensorshipVote: false,
  });
}
