// GET /api/leaderboard
// Builds the leaderboard by reading completed Stripe Checkout Sessions.
// Stripe is the source of truth — no separate database. Each paid session
// carries the bidder's name/handle in metadata; repeat bids for the same
// name accumulate (topping up moves you further up the board).

const Stripe = require("stripe");

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
        const name = s.metadata && s.metadata.milano_name;
        if (!name) continue;

        const category = (s.metadata && s.metadata.milano_category) || "Other";
        const amount = (s.amount_total || 0) / 100;
        const ts = s.created * 1000;
        const key = name.toLowerCase();

        const existing = byName.get(key);
        if (existing) {
          existing.price += amount;
          if (ts >= existing.ts) existing.category = category;
          existing.ts = Math.max(existing.ts, ts);
        } else {
          byName.set(key, { id: key, name, category, price: amount, ts });
        }

        activity.push({ name, price: amount, ts });
      }

      startingAfter = page.has_more ? page.data[page.data.length - 1].id : undefined;
      pages += 1;
    } while (startingAfter && pages < 10);

    const listings = Array.from(byName.values()).map((l) => ({
      ...l,
      clicks: seededClicks(l.name),
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
