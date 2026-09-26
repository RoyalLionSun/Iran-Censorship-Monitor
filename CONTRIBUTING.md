# Contributing

To suggest a service, report a wrong finding or propose a data source, use the issue forms (New issue). Never include anything that could identify you or anyone in Iran. People in Iran who want to contribute measurements should use OONI Probe (https://ooni.org/install/) after reading OONI's risk information; its results reach the dashboard automatically.

`main` is the canonical branch. Develop changes on short-lived branches and merge them through pull requests after CI succeeds.

Enable the project's commit check once per clone; it runs `npm run check` before every commit, which
also verifies that versions, the test count and the links in the documents are current:

```bash
git config core.hooksPath .githooks
```

Before opening a pull request:

```bash
npm ci
npm run check
npm run build
```

Never commit `.env`, credentials, API tokens, private probe identifiers, raw data that can identify measurement participants, or personal details (private e-mail addresses, home paths, IP addresses). Use your anonymous GitHub e-mail address for commits.

Only measurements from inside Iranian networks may support a claim about what people in Iran can reach (see `docs/INTERPRETATION.md`). Every Farsi interface string needs its English counterpart and must not start with a Latin word; `npm run check` enforces both.

Do not turn missing data into zeroes, infer censorship intent from a single telemetry family, or publish province/provider/VPN status without a defensible measurement source.
