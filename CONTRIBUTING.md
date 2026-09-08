# Contributing

`main` is the canonical branch. Develop changes on short-lived branches and merge them through pull requests after CI succeeds.

Before opening a pull request:

```bash
npm ci
npm run check
npm run build
```

Never commit `.env`, credentials, API tokens, private probe identifiers, or raw data that can identify measurement participants.

Do not turn missing data into zeroes, infer censorship intent from a single telemetry family, or publish province/provider/VPN status without a defensible measurement source.
