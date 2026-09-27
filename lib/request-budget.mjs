import { randomBytes, timingSafeEqual } from 'node:crypto';

// A per-visitor budget for requests that make the server ask upstream sources (a new Overview,
// a measurement lookup). One visitor may start a limited number per window, so nobody can make
// OONI or another source block this server for every reader. The table of addresses is bounded:
// past `maxAddresses` the least recently seen address is forgotten (it merely loses its count),
// so spoofed or many addresses cannot grow memory or make each request slower.

export function createRequestBudget({ limit, windowMs = 10 * 60 * 1000, maxAddresses = 10_000 } = {}) {
  const seen = new Map();
  return {
    take(address, now = Date.now()) {
      const key = String(address || 'unknown');
      const recent = (seen.get(key) ?? []).filter((time) => now - time < windowMs);
      seen.delete(key);
      if (recent.length >= limit) {
        seen.set(key, recent);
        return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000)) };
      }
      recent.push(now);
      seen.set(key, recent);
      while (seen.size > maxAddresses) seen.delete(seen.keys().next().value);
      return { ok: true };
    },
    size() { return seen.size; },
  };
}

// The visitor's address. Behind exactly one reverse proxy (TRUST_PROXY=1) it is the last entry of
// X-Forwarded-For, the one the proxy appended; earlier entries come from the visitor and can be
// anything. Without TRUST_PROXY the header is ignored.
export function clientAddress(req, trustProxy = process.env.TRUST_PROXY === '1') {
  const forwarded = trustProxy ? String(req.headers?.['x-forwarded-for'] ?? '').split(',').map((part) => part.trim()).filter(Boolean).at(-1) : '';
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

// The server asks its own /api/overview for the feed, the widget, the reports and the sources page.
// Those requests carry a key made at start and are not charged to any visitor's budget (else they
// would all share the loopback address's budget, which one visitor could spend for everyone); the
// visitor whose page caused them is charged instead.
export function createSelfRequestKey(key = randomBytes(24).toString('base64url')) {
  const expected = Buffer.from(key);
  return {
    headers: { 'x-self-request': key },
    matches(req) {
      const got = Buffer.from(String(req.headers?.['x-self-request'] ?? ''));
      return got.length === expected.length && timingSafeEqual(got, expected);
    },
  };
}

// The address the server reaches itself on; a wildcard bind address is reached over loopback.
export function selfOrigin(host, port) {
  const name = !host || host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '[::1]' : host.includes(':') ? `[${host}]` : host;
  return `http://${name}:${port}`;
}

// The base of links that are stored or sent to others (feed, open data, reports, Telegram). It is
// PUBLIC_URL, else the server's own address, never the request's Host header: the visitor chooses
// that header and could otherwise put their own address into what everyone else receives.
export function publicBase(publicUrl, fallback) {
  return String(publicUrl ?? '').trim().replace(/\/+$/, '') || fallback;
}
