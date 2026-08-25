// POST /api/checkout { name, category, desc, amount } -> { url }
// Creates a Stripe Checkout Session for a bid and returns the redirect URL.
// The leaderboard rank itself is only ever granted once Stripe confirms
// payment (see api/leaderboard.js, which reads completed sessions directly).

const Stripe = require("stripe");

const MIN_BID = 5;
const CATEGORIES = ["SaaS", "AI", "Fintech", "E-commerce", "Marketplace", "DevTools", "Consumer", "Other"];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "Stripe is not configured on this deployment yet." });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const currency = (process.env.STRIPE_CURRENCY || "eur").toLowerCase();

  try {
    const body = req.body || {};
    const name = String(body.name || "").trim().slice(0, 80);
    const category = CATEGORIES.includes(body.category) ? body.category : "Other";
    const desc = String(body.desc || "").trim().slice(0, 140);
    const amount = Math.round(Number(body.amount));

    if (!name) {
      res.status(400).json({ error: "Enter a URL." });
      return;
    }
    if (!amount || amount < MIN_BID) {
      res.status(400).json({ error: `Minimum bid is €${MIN_BID}.` });
      return;
    }

    const origin = req.headers.origin || `https://${req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Managed Payments is enabled by default on this account and requires
      // a tax_code on every product plus picks payment methods for you.
      // A leaderboard placement fee isn't a taxable good, so opt out of it
      // rather than assigning a tax code.
      managed_payments: { enabled: false },
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amount * 100,
            product_data: {
              name: `milanocity.lol — bid for ${name}`,
              description: desc || `Claim your rank on milanocity.lol (${category})`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { milano_name: name, milano_category: category, milano_desc: desc },
      success_url: `${origin}/?paid=1&name=${encodeURIComponent(name)}`,
      cancel_url: `${origin}/?canceled=1`,
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("checkout error", err);
    res.status(500).json({ error: "Could not start checkout." });
  }
};
