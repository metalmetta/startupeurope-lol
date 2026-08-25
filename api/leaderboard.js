// GET /api/leaderboard
// Builds the leaderboard by reading completed Stripe Checkout Sessions.
// Stripe is the source of truth for real bids — no separate database. Each
// paid session carries the bidder's URL in metadata; repeat bids for the
// same name accumulate (topping up moves you further up the board).
// Comped (unpaid, cheat-code) entries are the one exception — see _comped.js.

const Stripe = require("stripe");
const { getCompedListings } = require("./_comped");

let cache = null;
let cacheAt = 0;
const CACHE_MS = 4000;

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(200).json({ listings: [], activity: [], configured: false });
    return;
  }

  if (cache && Date.now() - cacheAt < CACHE_MS) {
    res.status(200).json(cache);
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const byName = new Map();
    const activity = [];

    let startingAfter;
    let pages = 0;
    do {
      const page = await stripe.checkout.sessions.list({
        limit: 100,
        status: "complete",
        starting_after: startingAfter,
      });

      for (const s of page.data) {
        if (s.payment_status !== "paid") continue;
        // se_* is current; milano_* covers bids placed before the project
        // was renamed from milanocity.lol to startupeurope.lol.
        const meta = s.metadata || {};
        const name = meta.se_name || meta.milano_name;
        if (!name) continue;

        const category = meta.se_category || meta.milano_category || "Other";
        const desc = meta.se_desc || meta.milano_desc || "";
        const amount = (s.amount_total || 0) / 100;
        const ts = s.created * 1000;
        const key = name.toLowerCase();

        const existing = byName.get(key);
        if (existing) {
          existing.price += amount;
          if (ts >= existing.ts) {
            existing.category = category;
            if (desc) existing.desc = desc;
          }
          existing.ts = Math.max(existing.ts, ts);
        } else {
          byName.set(key, { id: key, name, category, desc, price: amount, ts });
        }

        activity.push({ name, price: amount, ts });
      }

      startingAfter = page.has_more ? page.data[page.data.length - 1].id : undefined;
      pages += 1;
    } while (startingAfter && pages < 10);

    // Comped (unpaid) entries granted via the cheat code in checkout.js.
    // Real Stripe money always wins if it exists for the same name; a comped
    // entry only fills a slot nothing has actually been paid for yet.
    const comped = await getCompedListings();
    for (const c of comped) {
      const key = c.name.toLowerCase();
      if (byName.has(key)) continue;
      byName.set(key, {
        id: key,
        name: c.name,
        category: c.category || "Other",
        desc: c.desc || "",
        price: c.price,
        ts: c.ts || Date.now(),
        comped: true,
      });
      activity.push({ name: c.name, price: c.price, ts: c.ts || Date.now() });
    }

    const listings = Array.from(byName.values()).map((l) => ({
      ...l,
      clicks: l.clicks != null ? l.clicks : seededClicks(l.name),
    }));

    activity.sort((a, b) => b.ts - a.ts);

    const payload = { listings, activity: activity.slice(0, 50), configured: true };
    cache = payload;
    cacheAt = Date.now();
    res.status(200).json(payload);
  } catch (err) {
    console.error("leaderboard error", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
};

function seededClicks(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return 40 + (h % 900);
}
