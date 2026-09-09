import net from 'node:net';

const ROLE = process.argv[2];
const TIMEOUT_MS = 1200;
const POLICY_DENIED = new Set(['EACCES', 'EPERM', 'EAFNOSUPPORT']);

function connect(host, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.connect({ host, port });
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(Object.freeze({ ...result, durationMs: Date.now() - started }));
    };
    socket.setTimeout(TIMEOUT_MS, () => finish({ ok: false, code: 'TIMEOUT' }));
    socket.once('connect', () => finish({ ok: true, code: null }));
    socket.once('error', (error) => finish({ ok: false, code: error?.code ?? 'ERROR' }));
  });
}

function assertPolicyDenied(result, label) {
  if (result.ok) throw new Error(`${label} unexpectedly connected.`);
  if (!POLICY_DENIED.has(result.code)) {
    throw new Error(`${label} did not prove local policy denial; got ${result.code}.`);
  }
  return Object.freeze({ label, status: 'policy_denied', code: result.code, durationMs: result.durationMs });
}

async function runProbe() {
  const port = Number(process.env.FLEET_LAB_LOOPBACK_PORT);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('FLEET_LAB_LOOPBACK_PORT is invalid.');

  const local = await connect('127.0.0.1', port);
  if (!local.ok) throw new Error(`Allowed loopback fixture failed with ${local.code}.`);

  const testNet = assertPolicyDenied(await connect('198.51.100.1', 443), 'TEST-NET egress');
  const metadata = assertPolicyDenied(await connect('169.254.169.254', 80), 'link-local metadata egress');

  return Object.freeze({
    role: 'probe',
    status: 'pass',
    checks: [
      { label: 'loopback fixture', status: 'allowed', code: null, durationMs: local.durationMs },
      testNet,
      metadata,
    ],
  });
}

async function runCollector() {
  const loopback = assertPolicyDenied(await connect('127.0.0.1', 18443), 'collector IPv4 socket');
  const testNet = assertPolicyDenied(await connect('198.51.100.1', 443), 'collector Internet egress');
  return Object.freeze({ role: 'collector', status: 'pass', checks: [loopback, testNet] });
}

if (process.env.FLEET_STAGE1_LAB_ONLY !== '1') throw new Error('Stage 1 sandbox harness requires FLEET_STAGE1_LAB_ONLY=1.');
if (ROLE !== 'probe' && ROLE !== 'collector') throw new Error('Role must be probe or collector.');

const result = ROLE === 'probe' ? await runProbe() : await runCollector();
process.stdout.write(`${JSON.stringify(result)}\n`);
