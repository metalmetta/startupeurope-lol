// Not a route (leading "_"). Lightweight per-instance rate limiter.
//
// This is defense-in-depth, not the primary control — Fluid Compute reuses
// function instances across requests, so this in-memory counter catches a
// real chunk of abuse in practice, but a distributed attacker spread across
// many instances/regions can still get through. The real, reliable layer is
// Vercel Firewall's WAF rate-limit rules (per-IP, enforced at the edge
// before your function even runs) — see README.md for the commands to set
// those up. Keep both: this one is free and already shipped; the edge one
// is what actually holds under real abuse.

const buckets = new Map();
const MAX_BUCKETS = 5000; // hard cap so a distributed attack can't grow this unbounded

function clientIP(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress || "unknown";
}

// Returns true if the request should be allowed, false if it's over limit.
function allow(req, { key, max, windowMs }) {
  const ip = clientIP(req);
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();

  let bucket = buckets.get(bucketKey);
  if (!bucket || now - bucket.start > windowMs) {
    if (buckets.size >= MAX_BUCKETS) buckets.clear(); // crude but bounded
    bucket = { start: now, count: 0 };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  return bucket.count <= max;
}

module.exports = { allow, clientIP };
