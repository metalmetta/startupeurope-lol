// Not a route — filenames starting with "_" are excluded from Vercel's
// api/ auto-routing. Shared helper for "comped" (free, unpaid) leaderboard
// entries created via the cheat-code path in checkout.js.
//
// Stripe stays the source of truth for real bids. This is a deliberate,
// separate side-channel for entries an operator wants to grant without a
// charge (e.g. their own product, a partner, a giveaway) — stored in
// Vercel Blob since there's no database in this project. Requires a Blob
// store linked to the project (BLOB_READ_WRITE_TOKEN env var).

const BLOB_PATH = "comped-listings.json";

async function getCompedListings() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return [];
  try {
    const { list } = require("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATH, limit: 1 });
    const match = blobs.find((b) => b.pathname === BLOB_PATH);
    if (!match) return [];
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error("comped listings read error", err);
    return [];
  }
}

async function addCompedListing(entry) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Blob storage isn't configured (missing BLOB_READ_WRITE_TOKEN).");
  }
  const { put } = require("@vercel/blob");
  const current = await getCompedListings();
  const key = entry.name.toLowerCase();
  const idx = current.findIndex((c) => c.name.toLowerCase() === key);
  if (idx >= 0) current[idx] = { ...current[idx], ...entry };
  else current.push(entry);

  await put(BLOB_PATH, JSON.stringify(current), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
  return current;
}

module.exports = { getCompedListings, addCompedListing };
