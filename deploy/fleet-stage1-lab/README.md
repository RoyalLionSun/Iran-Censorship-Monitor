# Stage 1 systemd sandbox laboratory

Status: **laboratory acceptance only — NOT deployment authorization**.

These units implement the first reproducible Linux/systemd containment test for the v1.2 owned-probe fleet. They are deliberately narrower than any future pilot configuration.

## Effective lab policy

### Probe

`fleet-probe-lab.service`:

- dynamic dedicated unprivileged identity;
- no Linux capabilities and no privilege escalation;
- read-only system/application tree except its private runtime directory;
- systemd address filter is default-deny;
- the only permitted IP destination class is `localhost`;
- no persistent `[Install]` section;
- requires the ephemeral local marker `/run/iran-censorship-monitor/stage1-lab.enable`.

The probe runtime checker permits no caller-supplied host. It tests only:

- `127.0.0.1:18443` — must connect to a project-controlled local fixture;
- `198.51.100.1:443` — TEST-NET, must be rejected by local policy;
- `169.254.169.254:80` — link-local metadata-style destination, must be rejected by local policy.

A timeout is **not** accepted as proof of egress blocking. The negative tests require an immediate local policy error (`EACCES`, `EPERM` or equivalent address-family denial).

### Collector

`fleet-collector-lab.service`:

- dynamic dedicated unprivileged identity;
- `PrivateNetwork=yes`;
- `RestrictAddressFamilies=AF_UNIX` only;
- no IP destination allowlist at all;
- no persistent `[Install]` section;
- same ephemeral enable marker.

This proves the collection process can be designed around Unix-domain/local dependencies without arbitrary Internet egress. It is not yet the fleet HTTP ingestion service.

## Repository/static verification

From the repository root:

```sh
node --test tests/fleet-systemd-sandbox.test.mjs
```

The normal `npm run check` suite also includes these tests automatically.

The tests fail if the committed lab unit is widened, including removal of `IPAddressDeny=any`, addition of collector `AF_INET`, root execution, capabilities, weakened `NoNewPrivileges`, persistent enablement, arbitrary environment loading, or extra lifecycle commands.

## Reproducible real systemd host check

Use an isolated Linux laboratory host with systemd. Do not run this against an Iran probe or production fleet endpoint.

Place the exact repository revision at:

```text
/opt/iran-censorship-monitor
```

Verify the unit syntax first:

```sh
systemd-analyze verify \
  /opt/iran-censorship-monitor/deploy/fleet-stage1-lab/fleet-probe-lab.service \
  /opt/iran-censorship-monitor/deploy/fleet-stage1-lab/fleet-collector-lab.service
```

Create a project-controlled loopback fixture on the fixed laboratory port:

```sh
node -e "require('net').createServer(s=>s.end()).listen(18443,'127.0.0.1')" &
FIXTURE_PID=$!
```

Install the units **ephemerally under `/run`**, not `/etc`:

```sh
install -m 0644 deploy/fleet-stage1-lab/fleet-probe-lab.service /run/systemd/system/fleet-probe-lab.service
install -m 0644 deploy/fleet-stage1-lab/fleet-collector-lab.service /run/systemd/system/fleet-collector-lab.service
mkdir -p /run/iran-censorship-monitor
touch /run/iran-censorship-monitor/stage1-lab.enable
systemctl daemon-reload
```

Run the exact negative/positive egress checks:

```sh
systemctl start fleet-probe-lab.service
systemctl start fleet-collector-lab.service
journalctl -u fleet-probe-lab.service -u fleet-collector-lab.service --no-pager -n 50
```

Expected results:

- probe JSON reports `loopback fixture = allowed`;
- probe TEST-NET and link-local attempts report `policy_denied`;
- collector IPv4 loopback and public-IP attempts report `policy_denied`;
- either service returning non-zero means the sandbox gate **fails**.

Inspect the effective unit security profile:

```sh
systemd-analyze security --no-pager fleet-probe-lab.service fleet-collector-lab.service
systemctl show fleet-probe-lab.service \
  -p User -p DynamicUser -p NoNewPrivileges -p CapabilityBoundingSet \
  -p RestrictAddressFamilies -p IPAddressDeny -p IPAddressAllow
systemctl show fleet-collector-lab.service \
  -p User -p DynamicUser -p NoNewPrivileges -p CapabilityBoundingSet \
  -p PrivateNetwork -p RestrictAddressFamilies -p IPAddressDeny -p IPAddressAllow
```

## Cleanup / rollback

The lab setup is intentionally non-persistent:

```sh
rm -f /run/iran-censorship-monitor/stage1-lab.enable
rm -f /run/systemd/system/fleet-probe-lab.service /run/systemd/system/fleet-collector-lab.service
systemctl daemon-reload
kill "$FIXTURE_PID" 2>/dev/null || true
```

A reboot also removes `/run` units and the enable marker.

## Acceptance boundary

CI can prove the committed configuration remains structurally default-deny. A real systemd laboratory host is still required to prove the kernel/cgroup enforcement behavior of `IPAddressDeny`/`IPAddressAllow`, `RestrictAddressFamilies` and the exact Node build.

No external endpoint, Iran host, VPN/circumvention target, Class B/C/D test, public HTTP ingestion route, persistent probe installation or deployment authorization is introduced here.
