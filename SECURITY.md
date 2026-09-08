# Security

## Secrets

No credentials are committed. `.env` is ignored. Cloudflare Radar is the only integrated source that requires a credential in v1.0.0.

Use a narrowly scoped token with **Radar Read** permission only. Do not use a Global API Key.

## Network exposure

Default bind address is `127.0.0.1`. For production Internet exposure:

1. keep Node on loopback/private interface where possible;
2. place an HTTPS reverse proxy in front;
3. restrict administrative network access if this is an internal intelligence dashboard;
4. rate-limit external requests at the proxy;
5. log only operational metadata needed for diagnosis.

## Browser security headers

Static responses currently set:

- `Content-Security-Policy` with same-origin scripts/styles/connections;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `frame-ancestors 'none'` via CSP.

## Data sensitivity

The server does not persist user measurements or upstream responses to disk. Manually entered VPN field measurements remain in browser `localStorage` only.

If a future probe fleet is deployed inside Iran, treat probe operators, IP addresses, location, tunnel endpoints, and raw logs as sensitive operational data. Do not expose probe identifiers publicly by default.

## SSRF controls

The user-provided OONI `target` is not fetched by this server. It is passed only as an `input` filter to OONI's API after requiring an absolute `http:` or `https:` URL. External server fetch destinations themselves are fixed in source code.

## Dependency risk

The runtime has no third-party npm dependencies. Node.js itself and the reverse proxy/host remain patch-management responsibilities.

## Radar credential handling (v1.0.1)

- `CLOUDFLARE_RADAR_API_TOKEN` is read only server-side.
- `.env` is ignored by Git and is not copied by the production build.
- Radar URLs never contain the credential.
- `scripts/verify-radar.mjs` prints only source states/counts/errors and never the token.
- Use a dedicated token restricted to **Account > Radar > Read**.

## Active-measurement safety (v1.1)

Globalping active measurements are `false` by default. Enabling them requires both `GLOBALPING_ACTIVE_ENABLED=true` and a server-only `GLOBALPING_CONTROL_KEY`. Requests are server-rate-limited, Iran-vantage-only, capped to five probes, restricted to an allowlist of measurement types and reject localhost/private/reserved/CGNAT/link-local/documentation targets and URL credentials. The browser UI does not store or expose the control key.

## OSINT integrity

GDELT and curated reports are explicitly contextual. They do not become additional technical votes simply because multiple articles repeat the same upstream measurement. Evidence provenance must be traced to the root sensor before corroboration.
