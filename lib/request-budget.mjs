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
