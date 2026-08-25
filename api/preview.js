// GET /api/preview?url=... -> { description }
// Server-side fetch of the submitted URL's homepage, used to auto-fill a
// one-line description for the leaderboard. Runs server-side because
// arbitrary sites don't send CORS headers a browser fetch could read.
// Favicons are NOT handled here — the frontend points straight at
// https://www.google.com/s2/favicons for those, no fetch/backend needed.

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
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

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; milanocitybot/1.0; +https://milanocity.lol)" },
    });
    clearTimeout(timeout);

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
