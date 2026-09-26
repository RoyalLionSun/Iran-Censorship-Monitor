# Contributing

`main` is the canonical branch. Develop changes on short-lived branches and merge them through pull requests after CI succeeds.

Before opening a pull request:

```bash
npm ci
npm run check
npm run build
```

Never commit `.env`, credentials, API tokens, private probe identifiers, raw data that can identify measurement participants, or personal details (private e-mail addresses, home paths, IP addresses). Use your anonymous GitHub e-mail address for commits.

Only measurements from inside Iranian networks may support a claim about what people in Iran can reach (see `INTERPRETATION.md`). Every Farsi interface string needs its English counterpart and must not start with a Latin word; `npm run check` enforces both.

Do not turn missing data into zeroes, infer censorship intent from a single telemetry family, or publish province/provider/VPN status without a defensible measurement source.
