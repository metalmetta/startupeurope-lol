// POST /api/webhook — Stripe webhook receiver.
// Not required for the leaderboard to function (api/leaderboard.js reads
// completed sessions straight from Stripe), but this confirms deliveries,
// logs paid bids, and is the place to hook in email receipts, Slack
// notifications, fraud checks, etc. later. Needs the raw request body to
// verify the signature, so body parsing is disabled below.

const Stripe = require("stripe");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).end("Method not allowed");
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(500).end("Stripe not configured");
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).end("Invalid signature");
    return;
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const meta = s.metadata || {};
    console.log("Bid paid:", meta.se_name || meta.milano_name, s.amount_total / 100);
  }

  res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
