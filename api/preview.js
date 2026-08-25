// GET /api/preview?url=... -> { description }
// Server-side fetch of the submitted URL's homepage, used to auto-fill a
// one-line description for the leaderboard. Runs server-side because
// arbitrary sites don't send CORS headers a browser fetch could read.
// Favicons are NOT handled here — the frontend points straight at
// https://www.google.com/s2/favicons for those, no fetch/backend needed.
//
// This endpoint makes the server fetch an attacker-chosen URL, which is a
// classic SSRF surface (probing internal/loopback addresses, cloud metadata
// endpoints, etc.) and a cheap way to burn function time/bandwidth without
// paying anything — so it's rate-limited and blocks non-public targets.

const dns = require("dns").promises;
const { allow } = require("./_ratelimit");

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!allow(req, { key: "preview", max: 20, windowMs: 60_000 })) {
    res.status(429).json({ error: "Too many requests — slow down." });
    return;
  }

  let raw = (req.query && req.query.url) || "";
  raw = String(raw).trim();
  if (!raw) {
    res.status(400).json({ error: "Missing url" });
    return;
  }
  if (!/^https?:\/\//i.test(raw)) raw = "https://" + raw;

  let target;
  try {
    target = new URL(raw);
  } catch {
    res.status(200).json({ description: "" });
    return;
  }

  if (target.protocol !== "https:" && target.protocol !== "http:") {
    res.status(200).json({ description: "" });
    return;
  }

  const blocked = await isBlockedTarget(target.hostname);
  if (blocked) {
    res.status(400).json({ error: "That URL isn't allowed." });
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; startupeuropebot/1.0; +https://startupeurope.lol)" },
    });
    clearTimeout(timeout);

    // A redirect could still land on a private target — check where we
    // actually ended up, not just the original hostname.
    const finalHost = new URL(resp.url).hostname;
    if (finalHost !== target.hostname && (await isBlockedTarget(finalHost))) {
      res.status(400).json({ error: "That URL isn't allowed." });
      return;
    }

    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      res.status(200).json({ description: "" });
      return;
    }

    const html = (await resp.text()).slice(0, 250000);
    res.status(200).json({ description: extractDescription(html) });
  } catch (err) {
    console.error("preview error", err.message);
    res.status(200).json({ description: "" });
  }
};

// Blocks loopback, private, link-local, and cloud-metadata addresses —
// both when typed literally and when the hostname *resolves* to one (basic
// DNS-rebinding guard). Fails closed: if DNS lookup errors, treat as blocked.
async function isBlockedTarget(hostname) {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "metadata.google.internal") return true;
  if (isPrivateIP(h)) return true;

  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.some((r) => isPrivateIP(r.address));
  } catch {
    return true;
  }
}

function isPrivateIP(ip) {
  if (ip.includes(":")) {
    // IPv6: loopback, link-local, unique-local, and the v4-mapped range.
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("::ffff:")) return isPrivateIP(lower.replace("::ffff:", ""));
    return false;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
  if (a === 0) return true;
  return false;
}

function extractDescription(html) {
  const desc =
    matchMeta(html, "description") ||
    matchMeta(html, "og:description") ||
    matchMeta(html, "twitter:description");
  if (desc) return clean(desc);

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) return clean(titleMatch[1]);

  return "";
}

function matchMeta(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${escaped}["']`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clean(s) {
  return decodeEntities(s).replace(/\s+/g, " ").trim().slice(0, 140);
}
