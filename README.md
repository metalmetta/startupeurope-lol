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
  - `api/_comped.js` — not a route (leading `_`). Shared helper for the
    cheat-code side channel below, backed by Vercel Blob.

### Cheat code (free/comped entries)

Setting `CHEAT_CODE` turns on a hidden bypass: submitting a URL with
`-<CHEAT_CODE>` appended (e.g. `getfluida.com-xyz123`) skips Stripe entirely
and grants that entry for free, at whatever amount was entered. It's meant
for an operator to comp their own product, a partner, or a giveaway —
not something advertised in the UI.

**This is not a secret mechanism** — the suffix-matching logic lives in this
public repo, so anyone who reads `api/checkout.js` can see *that* a bypass
exists. What stays private is the actual `CHEAT_CODE` value, since it's only
ever read from an environment variable and never committed. Treat it like a
password: pick something unguessable, keep it out of git, and rotate it in
Vercel's dashboard if it ever leaks.

Comped entries are stored in Vercel Blob (not Stripe), merged into the
leaderboard behind real bids — if someone later pays for the same URL for
real, their payment takes over the entry.

## Setup

1. Copy `.env.example` to `.env` and fill in:
   - `STRIPE_SECRET_KEY` — your Stripe secret key.
   - `STRIPE_WEBHOOK_SECRET` — from `stripe listen` locally, or from the
     webhook endpoint you create in the Stripe Dashboard pointing at
     `https://<your-domain>/api/webhook` (event: `checkout.session.completed`).
   - `STRIPE_CURRENCY` — defaults to `eur`.
   - `BLOB_READ_WRITE_TOKEN` (optional) — create a Blob store in the Vercel
     dashboard (Storage tab) and link it to this project to enable it.
   - `CHEAT_CODE` (optional) — enables the free-entry bypass above.
2. In Vercel: **Project Settings → Environment Variables**, add the same
   keys before deploying (or `vercel env add`).
3. `npm install` (installs `stripe` and `@vercel/blob`, used by the API
   functions).

## Local dev

```
vercel dev
```

(Plain `python3 -m http.server` still serves the static pages, but the
`/api/*` bidding endpoints only work under `vercel dev` or once deployed,
since they're serverless functions.)

Without Stripe configured, the site still loads and shows a banner asking
for `STRIPE_SECRET_KEY` — the leaderboard is simply empty until it's set.
