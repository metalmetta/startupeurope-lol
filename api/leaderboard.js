// GET /api/leaderboard
// Builds the leaderboard by reading completed Stripe Checkout Sessions.
// Stripe is the source of truth — no separate database. Each paid session
// carries the bidder's URL in metadata; repeat bids for the same
// name accumulate (topping up moves you further up the board).

const Stripe = require("stripe");

let cache = null;
let cacheAt = 0;
const CACHE_MS = 4000;

// Seed placeholders shown while real bids are still thin. Each one only
// fills a slot when no real Stripe payment exists yet for that name — the
// instant a real bid comes in for the same URL, it fully replaces the seed
// (see the merge below), so a seed can never block or absorb real money.
const SEED_LISTINGS = [
  { name: "nova.ai", category: "AI", desc: "AI copilots for Italian PMIs — invoices, contracts, and customer replies, drafted automatically.", price: 420, hoursAgo: 3, clicks: 812 },
  { name: "borsapay.it", category: "Fintech", desc: "Instant B2B payments and invoice financing for small Italian suppliers.", price: 380, hoursAgo: 5, clicks: 664 },
  { name: "tavolo.app", category: "Consumer", desc: "Book the table, order, and split the bill — one app for every ristorante in town.", price: 310, hoursAgo: 2, clicks: 591 },
  { name: "fashionloop.it", category: "E-commerce", desc: "Resell and rent pre-loved Italian designer fashion, authenticated in 24h.", price: 275, hoursAgo: 8, clicks: 503 },
  { name: "buildstack.dev", category: "DevTools", desc: "One-click infra for Italian startups — deploy, monitor, and scale without a DevOps hire.", price: 240, hoursAgo: 6, clicks: 447 },
  { name: "ventomarket.it", category: "Marketplace", desc: "Local marketplace connecting small Italian producers directly with restaurants.", price: 190, hoursAgo: 12, clicks: 388 },
  { name: "cloudpanel.io", category: "SaaS", desc: "The all-in-one back office for Italian freelancers — invoicing, taxes, and clients.", price: 150, hoursAgo: 4, clicks: 305 },
  { name: "spesaexpress.it", category: "E-commerce", desc: "30-minute grocery delivery from your neighborhood's own shops.", price: 120, hoursAgo: 15, clicks: 261 },
  { name: "lexbot.ai", category: "AI", desc: "AI paralegal for Italian law firms — contract review in minutes, not days.", price: 95, hoursAgo: 9, clicks: 198 },
  { name: "pagofacile.it", category: "Fintech", desc: "Tap-to-pay for Italian market stalls and street vendors — no terminal needed.", price: 60, hoursAgo: 20, clicks: 142 },
];

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
        const desc = (s.metadata && s.metadata.milano_desc) || "";
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

    for (const seed of SEED_LISTINGS) {
      const key = seed.name.toLowerCase();
      if (byName.has(key)) continue; // a real bid already exists — never override it
      byName.set(key, {
        id: key,
        name: seed.name,
        category: seed.category,
        desc: seed.desc,
        price: seed.price,
        ts: Date.now() - seed.hoursAgo * 3600 * 1000,
        clicks: seed.clicks,
        seed: true,
      });
    }

    const listings = Array.from(byName.values()).map((l) => ({
      ...l,
      clicks: l.clicks != null ? l.clicks : seededClicks(l.name),
    }));

    // No real bids yet at all — seed the activity feed too, so it doesn't
    // sit empty under a populated board. Disappears the moment a real one lands.
    if (activity.length === 0) {
      for (const seed of SEED_LISTINGS) {
        activity.push({ name: seed.name, price: seed.price, ts: Date.now() - seed.hoursAgo * 3600 * 1000 });
      }
    }

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
