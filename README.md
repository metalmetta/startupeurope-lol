# startupeurope.lol

A pay-to-rank public leaderboard for European startups — inspired by
[outbid.lol](https://outbid.lol), not affiliated with it.

Anyone submits a URL/handle and bids in euros. Paying more than the current
#1 takes the top spot; a smaller bid still claims whatever rank it can beat.
Re-submitting the same name tops up your existing bid.

## How it's built

- Static frontend: `index.html` + `app.js` (Tailwind via CDN, no build step).
- Backend: three Vercel Functions in `api/`, using Stripe as the **only**
  data store — there's no database. The leaderboard is built live from
  completed Stripe Checkout Sessions (amount + metadata), so a bid only
  ever appears once Stripe has actually charged the card.
  - `api/checkout.js` — creates a Stripe Checkout Session for a bid.
  - `api/leaderboard.js` — lists completed sessions and aggregates them
    into ranked listings (repeat bids for the same name sum together).
  - `api/webhook.js` — verifies and logs `checkout.session.completed`
    events (optional today, but the place to hook in receipts/notifications).

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `STRIPE_SECRET_KEY` — your Stripe secret key.
   - `STRIPE_WEBHOOK_SECRET` — from `stripe listen` locally, or from the
     webhook endpoint you create in the Stripe Dashboard pointing at
     `https://<your-domain>/api/webhook` (event: `checkout.session.completed`).
   - `STRIPE_CURRENCY` — defaults to `eur`.
2. In Vercel: **Project Settings → Environment Variables**, add the same
   three keys before deploying (or `vercel env add`).
3. `npm install` (installs the `stripe` package used by the API functions).

## Local dev

```
vercel dev
```

(Plain `python3 -m http.server` still serves the static pages, but the
`/api/*` bidding endpoints only work under `vercel dev` or once deployed,
since they're serverless functions.)

Without Stripe configured, the site still loads and shows a banner asking
for `STRIPE_SECRET_KEY` — the leaderboard is simply empty until it's set.
