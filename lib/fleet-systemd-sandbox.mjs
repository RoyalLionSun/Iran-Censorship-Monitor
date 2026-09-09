function fail(message) {
  throw new Error(`Fleet systemd sandbox invalid: ${message}`);
}

export function parseSystemdUnit(text) {
  if (typeof text !== 'string' || text.length === 0) fail('unit text is empty');
  const sections = new Map();
  let section = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1);
      if (!sections.has(section)) sections.set(section, new Map());
      continue;
    }
    if (!section) fail(`directive outside section: ${line}`);
    const index = line.indexOf('=');
    if (index < 1) fail(`malformed directive: ${line}`);
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    const directives = sections.get(section);
    const values = directives.get(key) ?? [];
    values.push(value);
    directives.set(key, values);
  }
  return sections;
}

function values(unit, section, key) {
  return unit.get(section)?.get(key) ?? [];
}

function requireExact(unit, section, key, expected) {
  const actual = values(unit, section, key);
  if (actual.length !== 1 || actual[0] !== expected) {
    fail(`${section}.${key} must be exactly ${JSON.stringify(expected)}; got ${JSON.stringify(actual)}`);
  }
}

function requireEmpty(unit, section, key) {
  requireExact(unit, section, key, '');
}

function requireCommonServiceHardening(unit, user, runtimeDirectory) {
  requireExact(unit, 'Service', 'User', user);
  requireExact(unit, 'Service', 'Group', user);
  requireExact(unit, 'Service', 'DynamicUser', 'yes');
  requireExact(unit, 'Service', 'NoNewPrivileges', 'yes');
  requireExact(unit, 'Service', 'PrivateTmp', 'yes');
  requireExact(unit, 'Service', 'PrivateDevices', 'yes');
  requireExact(unit, 'Service', 'ProtectSystem', 'strict');
  requireExact(unit, 'Service', 'ProtectHome', 'yes');
  requireExact(unit, 'Service', 'ProtectKernelTunables', 'yes');
  requireExact(unit, 'Service', 'ProtectKernelModules', 'yes');
  requireExact(unit, 'Service', 'ProtectKernelLogs', 'yes');
  requireExact(unit, 'Service', 'ProtectControlGroups', 'yes');
  requireExact(unit, 'Service', 'ProtectHostname', 'yes');
  requireExact(unit, 'Service', 'ProtectClock', 'yes');
  requireExact(unit, 'Service', 'RestrictSUIDSGID', 'yes');
  requireExact(unit, 'Service', 'RestrictNamespaces', 'yes');
  requireExact(unit, 'Service', 'RestrictRealtime', 'yes');
  requireExact(unit, 'Service', 'LockPersonality', 'yes');
  requireExact(unit, 'Service', 'MemoryDenyWriteExecute', 'yes');
  requireEmpty(unit, 'Service', 'CapabilityBoundingSet');
  requireEmpty(unit, 'Service', 'AmbientCapabilities');
  requireExact(unit, 'Service', 'RemoveIPC', 'yes');
  requireExact(unit, 'Service', 'UMask', '0077');
  requireExact(unit, 'Service', 'SystemCallArchitectures', 'native');
  requireExact(unit, 'Service', 'RuntimeDirectory', runtimeDirectory);
  requireExact(unit, 'Service', 'RuntimeDirectoryMode', '0700');
  requireExact(unit, 'Service', 'ReadWritePaths', `/run/${runtimeDirectory}`);
  requireExact(unit, 'Service', 'ProtectProc', 'invisible');
  requireExact(unit, 'Service', 'ProcSubset', 'pid');
  if (values(unit, 'Install', 'WantedBy').length > 0) fail('lab unit must not be persistently enableable');
  if (values(unit, 'Service', 'EnvironmentFile').length > 0) fail('lab unit must not load an arbitrary environment file');
  for (const key of ['ExecStartPre', 'ExecStartPost', 'ExecReload']) {
    if (values(unit, 'Service', key).length > 0) fail(`${key} is not permitted in lab unit`);
  }
}

export function validateFleetProbeLabUnit(text) {
  const unit = parseSystemdUnit(text);
  requireExact(unit, 'Unit', 'ConditionPathExists', '/run/iran-censorship-monitor/stage1-lab.enable');
  requireCommonServiceHardening(unit, 'iran-fleet-probe-lab', 'iran-fleet-probe-lab');
  requireExact(unit, 'Service', 'Type', 'oneshot');
  requireExact(unit, 'Service', 'WorkingDirectory', '/opt/iran-censorship-monitor');
  requireExact(unit, 'Service', 'ExecStart', '/usr/bin/node scripts/fleet-stage1-lab-egress-check.mjs probe');
  requireExact(unit, 'Service', 'RestrictAddressFamilies', 'AF_UNIX AF_INET AF_INET6');
  requireExact(unit, 'Service', 'IPAddressDeny', 'any');
  requireExact(unit, 'Service', 'IPAddressAllow', 'localhost');
  if (values(unit, 'Service', 'PrivateNetwork').length > 0) fail('probe lab unit must use host loopback for the allowed fixture');
  return Object.freeze({ role: 'probe', status: 'valid' });
}

export function validateFleetCollectorLabUnit(text) {
  const unit = parseSystemdUnit(text);
  requireExact(unit, 'Unit', 'ConditionPathExists', '/run/iran-censorship-monitor/stage1-lab.enable');
  requireCommonServiceHardening(unit, 'iran-fleet-collector-lab', 'iran-fleet-collector-lab');
  requireExact(unit, 'Service', 'Type', 'oneshot');
  requireExact(unit, 'Service', 'WorkingDirectory', '/opt/iran-censorship-monitor');
  requireExact(unit, 'Service', 'ExecStart', '/usr/bin/node scripts/fleet-stage1-lab-egress-check.mjs collector');
  requireExact(unit, 'Service', 'PrivateNetwork', 'yes');
  requireExact(unit, 'Service', 'RestrictAddressFamilies', 'AF_UNIX');
  requireExact(unit, 'Service', 'IPAddressDeny', 'any');
  if (values(unit, 'Service', 'IPAddressAllow').length > 0) fail('collector lab unit must not allow IP destinations');
  return Object.freeze({ role: 'collector', status: 'valid' });
}
