import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { signFleetResult, validateFleetResult } from './fleet.mjs';
import { compileFleetExecutionPlan, executeFleetPlanEntry } from './fleet-execution.mjs';
import { readFleetStage1LocalConsent } from './fleet-stage1-consent.mjs';
import {
  FLEET_STAGE1_MAX_BACKOFF_MS,
  FLEET_STAGE1_MIN_POLL_MS,
  buildFleetStage1ManifestRequest,
  buildFleetStage1ResultRequest,
  computeFleetStage1Backoff,
  normalizeFleetStage1Config,
  processFleetStage1ManifestResponse,
  processFleetStage1ResultResponse,
} from './fleet-stage1-transport.mjs';

export const FLEET_STAGE1_ENABLE_MARKER = 'FLEET_STAGE1_ENABLED=1\n';

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
  if (key.length < 32) throw new Error('Fleet Stage 1 local probe secret must contain at least 32 bytes.');
}

function assertQueue(queue) {
  for (const method of ['enqueue', 'peek', 'shift', 'size', 'clear']) {
    if (!queue || typeof queue[method] !== 'function') throw new Error(`Fleet Stage 1 queue requires ${method}().`);
  }
  return queue;
}

function purgeQueueOnConsentStop(queue, now) {
  if (queue == null) return 0;
  if (typeof queue.clear !== 'function') {
    throw new Error('Fleet Stage 1 consent withdrawal requires a locally purgeable queue.');
  }
  return queue.clear(now);
}

function failureDelay(config, retryAfterMs = 0, attempt = 0) {
  const localFloorMs = Math.min(
    Math.max(config.pollIntervalMs, FLEET_STAGE1_MIN_POLL_MS),
    FLEET_STAGE1_MAX_BACKOFF_MS,
  );
  return computeFleetStage1Backoff({ attempt, localFloorMs, serverRetryAfterMs: retryAfterMs, jitter: 0 });
}

function assertMeasuredWithinManifest(measuredAt, manifest) {
  const measured = measuredAt.getTime();
  const issued = Date.parse(manifest?.issuedAt);
  const expires = Date.parse(manifest?.expiresAt);
  if (!Number.isFinite(issued) || !Number.isFinite(expires) || measured < issued || measured >= expires) {
    throw new Error('Fleet Stage 1 measurement completed outside the signed manifest window; result discarded.');
  }
}

function summary(fields = {}) {
  return Object.freeze({
    status: fields.status,
    reason: fields.reason ?? null,
    measurements: fields.measurements ?? 0,
    submitted: fields.submitted ?? 0,
    duplicates: fields.duplicates ?? 0,
    dropped: fields.dropped ?? 0,
    purged: fields.purged ?? 0,
    queued: fields.queued ?? 0,
    nextDelayMs: fields.nextDelayMs ?? 0,
    etag: fields.etag ?? null,
    evidenceRole: 'owned-probe-stage1-lab-cycle',
    independentCensorshipVote: false,
  });
}

export async function readFleetStage1LocalGate(enableFile, { reader = readFile } = {}) {
  if (typeof enableFile !== 'string' || !isAbsolute(enableFile)) {
    throw new Error('Fleet Stage 1 local enable file must be an absolute local path.');
  }
  if (typeof reader !== 'function') throw new Error('Fleet Stage 1 local gate reader is invalid.');
  try {
    const content = await reader(enableFile, 'utf8');
    if (content === FLEET_STAGE1_ENABLE_MARKER) {
      return Object.freeze({ enabled: true, reason: 'local_marker_enabled' });
    }
    return Object.freeze({ enabled: false, reason: 'local_marker_disabled' });
  } catch {
    return Object.freeze({ enabled: false, reason: 'local_marker_unavailable' });
  }
}

async function submitQueue({ queue, config, probeId, transport, now, attempt = 0 }) {
  let submitted = 0;
  let duplicates = 0;
  let dropped = 0;

  while (queue.peek(instant(now(), 'Fleet Stage 1 queue read time'))) {
    const requestTime = instant(now(), 'Fleet Stage 1 result request time');
    const envelope = queue.peek(requestTime);
    const request = buildFleetStage1ResultRequest(config, probeId, envelope);
    let response;
    try {
      response = await transport(request);
    } catch {
      return Object.freeze({
        status: 'result_transport_unavailable',
        submitted,
        duplicates,
        dropped,
        nextDelayMs: failureDelay(config, 0, attempt),
      });
    }

    const decision = processFleetStage1ResultResponse(response, { now: requestTime });
    if (decision.status === 'accepted') {
      queue.shift(requestTime);
      submitted += 1;
      continue;
    }
    if (decision.status === 'duplicate') {
      queue.shift(requestTime);
      duplicates += 1;
      continue;
    }
    if (decision.status === 'rejected') {
      queue.shift(requestTime);
      dropped += 1;
      return Object.freeze({
        status: 'result_rejected',
        submitted,
        duplicates,
        dropped,
        nextDelayMs: failureDelay(config, decision.retryAfterMs, attempt),
      });
    }
    if (decision.status === 'contract_error') {
      queue.shift(requestTime);
      dropped += 1;
      return Object.freeze({
        status: 'result_contract_error',
        submitted,
        duplicates,
        dropped,
        nextDelayMs: config.pollIntervalMs,
      });
    }
    if (decision.status === 'rate_limited' || decision.status === 'unavailable') {
      return Object.freeze({
        status: `result_${decision.status}`,
        submitted,
        duplicates,
        dropped,
        nextDelayMs: failureDelay(config, decision.retryAfterMs, attempt),
      });
    }
    throw new Error(`Unsupported Fleet Stage 1 result decision ${decision.status}.`);
  }

  return Object.freeze({ status: 'queue_drained', submitted, duplicates, dropped, nextDelayMs: 0 });
}

export async function runFleetStage1OfflineCycle({
  probeId,
  probeSecret,
  schedulerPublicKey,
  targets,
  localEnableFile,
  localConsentFile,
  config,
  queue,
  transport,
  adapters,
  etag = null,
  now = () => new Date(),
  gateReader = readFile,
  consentReader = readFile,
} = {}) {
  if (!validProbeId(probeId)) throw new Error('Fleet Stage 1 probeId is invalid.');
  if (typeof now !== 'function') throw new Error('Fleet Stage 1 clock is invalid.');

  const gate = await readFleetStage1LocalGate(localEnableFile, { reader: gateReader });
  if (!gate.enabled) {
    return summary({ status: 'disabled', reason: gate.reason });
  }

  const consentTime = instant(now(), 'Fleet Stage 1 consent check time');
  const consent = await readFleetStage1LocalConsent(localConsentFile, probeId, {
    reader: consentReader,
    now: consentTime,
  });
  if (!consent.authorized) {
    const purged = purgeQueueOnConsentStop(queue, consentTime);
    return summary({ status: 'disabled', reason: consent.reason, purged });
  }

  if (typeof transport !== 'function') throw new Error('Fleet Stage 1 requires an injected transport adapter.');
  if (!schedulerPublicKey) throw new Error('Fleet Stage 1 scheduler public key is required.');
  assertProbeSecret(probeSecret);
  const normalizedConfig = normalizeFleetStage1Config(config);
  const localQueue = assertQueue(queue);
  if (!adapters || typeof adapters !== 'object' || Array.isArray(adapters)) {
    throw new Error('Fleet Stage 1 requires locally installed Class A adapters.');
  }

  const initialQueueTime = instant(now(), 'Fleet Stage 1 initial queue time');
  const pendingAtStart = localQueue.size(initialQueueTime);
  if (pendingAtStart > 0) {
    const delivery = await submitQueue({
      queue: localQueue,
      config: normalizedConfig,
      probeId,
      transport,
      now,
    });
    return summary({
      status: delivery.status === 'queue_drained' ? 'drained_pending' : delivery.status,
      reason: 'pending_results_prevent_new_work',
      submitted: delivery.submitted,
      duplicates: delivery.duplicates,
      dropped: delivery.dropped,
      queued: localQueue.size(instant(now(), 'Fleet Stage 1 post-drain queue time')),
      nextDelayMs: delivery.nextDelayMs || normalizedConfig.pollIntervalMs,
      etag,
    });
  }

  const pollRequest = buildFleetStage1ManifestRequest(normalizedConfig, probeId, { etag });
  let pollResponse;
  try {
    pollResponse = await transport(pollRequest);
  } catch {
    return summary({
      status: 'control_transport_unavailable',
      reason: 'manifest_poll_failed',
      nextDelayMs: failureDelay(normalizedConfig),
      etag,
    });
  }

  const pollTime = instant(now(), 'Fleet Stage 1 manifest response time');
  const control = processFleetStage1ManifestResponse(pollResponse, {
    schedulerPublicKey,
    targets,
    now: pollTime,
  });

  if (control.status !== 'manifest') {
    const failedControl = control.status === 'unauthorized' || control.status === 'rate_limited' || control.status === 'unavailable';
    return summary({
      status: control.status === 'no_work' ? 'no_work' : `control_${control.status}`,
      reason: 'no_measurement_work_executed',
      nextDelayMs: failedControl
        ? failureDelay(normalizedConfig, control.retryAfterMs)
        : normalizedConfig.pollIntervalMs,
      etag,
    });
  }

  const plan = compileFleetExecutionPlan(control.manifest, targets, { now: pollTime });
  let measurements = 0;
  let submitted = 0;
  let duplicates = 0;
  let dropped = 0;

  for (const entry of plan.tests) {
    const execution = await executeFleetPlanEntry(entry, adapters);
    const measuredAt = instant(now(), 'Fleet Stage 1 measuredAt');
    assertMeasuredWithinManifest(measuredAt, control.manifest);

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
    const envelope = Object.freeze({
      result: Object.freeze(rawResult),
      mac: signFleetResult(rawResult, probeSecret),
    });
    const queued = localQueue.enqueue(envelope, measuredAt);
    measurements += 1;

    if (!queued.accepted) {
      dropped += 1;
      return summary({
        status: 'queue_full',
        reason: 'bounded_memory_queue_refused_result',
        measurements,
        submitted,
        duplicates,
        dropped,
        queued: localQueue.size(measuredAt),
        nextDelayMs: normalizedConfig.pollIntervalMs,
        etag: control.etag,
      });
    }

    const delivery = await submitQueue({
      queue: localQueue,
      config: normalizedConfig,
      probeId,
      transport,
      now,
    });
    submitted += delivery.submitted;
    duplicates += delivery.duplicates;
    dropped += delivery.dropped;

    if (delivery.status !== 'queue_drained') {
      return summary({
        status: delivery.status,
        reason: 'new_work_stopped_until_result_delivery_resolves',
        measurements,
        submitted,
        duplicates,
        dropped,
        queued: localQueue.size(instant(now(), 'Fleet Stage 1 blocked queue time')),
        nextDelayMs: delivery.nextDelayMs,
        etag: control.etag,
      });
    }
  }

  return summary({
    status: 'completed',
    reason: 'manifest_verified_and_results_delivered',
    measurements,
    submitted,
    duplicates,
    dropped,
    queued: localQueue.size(instant(now(), 'Fleet Stage 1 final queue time')),
    nextDelayMs: normalizedConfig.pollIntervalMs,
    etag: control.etag,
  });
}
