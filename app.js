// milanocity.lol — frontend. The leaderboard is read live from /api/leaderboard
// (which itself reads completed Stripe Checkout Sessions — no local fake state).
// Bidding redirects to a real Stripe Checkout session via /api/checkout.
(function () {
  "use strict";

  const GRADIENTS = [
    ["#1f6f4a", "#7fbf9e"], ["#c9a35c", "#e8d5a8"], ["#ce2b37", "#f2a3a9"],
    ["#2563eb", "#93c5fd"], ["#0f766e", "#5eead4"], ["#7c3aed", "#c4b5fd"],
    ["#b45309", "#fbbf24"], ["#be185d", "#f9a8d4"],
  ];

  const CATEGORIES = ["SaaS", "AI", "Fintech", "E-commerce", "Marketplace", "DevTools", "Consumer", "Other"];

  let listings = [];
  let activity = [];
  let showAll = false;
  let activeCategory = "All";

  function timeAgo(ts) {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min < 60) return min + " minute" + (min === 1 ? "" : "s") + " ago";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + " hour" + (hr === 1 ? "" : "s") + " ago";
    const d = Math.floor(hr / 24);
    return d === 1 ? "yesterday" : d + " days ago";
  }

  function initials(name) {
    const clean = name.replace(/^https?:\/\//, "").replace(/^@/, "");
    const parts = clean.split(/[.\s]/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }

  function gradientFor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return GRADIENTS[h % GRADIENTS.length];
  }

  function domainFor(name) {
    if (!name) return null;
    const trimmed = name.trim();
    if (trimmed.startsWith("@")) return null;
    const host = trimmed.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
    return host.includes(".") ? host : null;
  }

  function faviconURL(name) {
    const domain = domainFor(name);
    return domain ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}` : null;
  }

  function avatarHTML(name, size, faviconOverride) {
    const [c1, c2] = gradientFor(name);
    const fallback = `<div class="avatar" style="--seed1:${c1};--seed2:${c2}; width:${size}px; height:${size}px; font-size:${size * 0.4}px; position:absolute; inset:0;">${initials(name)}</div>`;
    // faviconOverride is a real logo we already know about (seed placeholders
    // ship one in /logos). Otherwise fall back to guessing one from the domain.
    const favicon = faviconOverride || faviconURL(name);
    if (!favicon) return `<div style="width:${size}px;height:${size}px" class="shrink-0 relative">${fallback}</div>`;
    return `<div style="width:${size}px;height:${size}px" class="shrink-0 relative">
      ${fallback}
      <img src="${favicon}" width="${size}" height="${size}" alt=""
        class="relative rounded-full object-cover bg-white"
        style="width:${size}px;height:${size}px"
        onerror="this.remove()">
    </div>`;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function sorted() {
    return [...listings].sort((a, b) => b.price - a.price);
  }

  function render() {
    const list = sorted();
    renderForm(list);
    renderActivity();
    renderCategoryFilters(list);
    renderLeaderboard(list);
  }

  function renderCategoryFilters(list) {
    const el = document.getElementById("category-filters");
    const present = CATEGORIES.filter(c => list.some(l => l.category === c));
    const tabs = ["All", ...present];
    if (!tabs.includes(activeCategory)) activeCategory = "All";

    el.innerHTML = tabs.map(c => {
      const active = c === activeCategory;
      return `<button data-cat="${escapeHTML(c)}" class="shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
        active ? "bg-primary text-primary-foreground" : "border hover:bg-muted"
      }" ${active ? "" : `style="border-color:var(--border); color:var(--muted-fg)"`}>${escapeHTML(c)}</button>`;
    }).join("");

    el.querySelectorAll("[data-cat]").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.getAttribute("data-cat");
        renderCategoryFilters(sorted());
        renderLeaderboard(sorted());
      });
    });
  }

  function renderForm(list) {
    const top = list[0];
    const topPrice = top ? top.price : 0;
    document.getElementById("target-price").textContent = Math.ceil(topPrice + (top ? 1 : 0)).toLocaleString();
  }

  function renderActivity() {
    const section = document.getElementById("activity-section");
    const el = document.getElementById("activity-list");
    if (!activity.length) {
      section.classList.add("hidden");
      return;
    }
    section.classList.remove("hidden");
    const list = sorted();
    const items = [...activity].sort((a, b) => b.ts - a.ts).slice(0, 20);
    el.innerHTML = items.map(a => {
      const match = list.find(l => l.name.toLowerCase() === a.name.toLowerCase());
      const rank = match ? list.indexOf(match) + 1 : 0;
      return `
      <div class="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 border fade-in" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(a.name, 22, match && match.favicon)}
        <span class="text-sm font-medium whitespace-nowrap">${escapeHTML(a.name)}</span>
        <span class="text-xs whitespace-nowrap" style="color:var(--muted-fg)">#${rank || "?"} · €${a.price.toLocaleString()} · ${timeAgo(a.ts)}</span>
      </div>`;
    }).join("");
  }

  function leaderboardCardHTML(l, rank) {
    let glow = "";
    if (rank === 1) glow = "rank-glow-1";
    else if (rank === 2) glow = "rank-glow-2";
    else if (rank === 3) glow = "rank-glow-3";
    return `
    <div class="group relative flex items-center gap-3 md:gap-4 px-3 md:px-4 py-4 md:py-5 rounded-2xl my-1.5 ${glow}">
      <div class="w-8 md:w-10 text-center text-sm md:text-base font-medium shrink-0" style="color:var(--muted-fg)">#${rank}</div>
      ${avatarHTML(l.name, rank <= 3 ? 44 : 36, l.favicon)}
      <div class="min-w-0 flex-1">
        <div class="flex items-baseline gap-2">
          <span class="min-w-0 truncate font-bold text-sm md:text-base">${escapeHTML(l.name)}</span>
        </div>
        ${l.desc ? `<div class="text-xs md:text-sm truncate" style="color:var(--muted-fg)">${escapeHTML(l.desc)}</div>` : ""}
        <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] md:text-xs" style="color:var(--muted-fg)">
          <span class="rounded-full px-1.5 py-0.5 font-medium" style="background:var(--muted)">${escapeHTML(l.category)}</span>
          <span>·</span><span>${timeAgo(l.ts)}</span><span>·</span><span>${l.clicks.toLocaleString()} clicks</span>
        </div>
      </div>
      <div class="flex flex-col items-end gap-1.5 shrink-0">
        <span class="font-mono font-semibold text-sm md:text-base rounded-full px-2.5 py-0.5" style="background:var(--muted)">€${l.price.toLocaleString()}</span>
        <button data-outbid="${escapeHTML(l.name)}" data-price="${Math.ceil(l.price) + 1}" class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors" style="border-color:var(--border)">
          claim for €${(Math.ceil(l.price) + 1).toLocaleString()}
        </button>
      </div>
    </div>`;
  }

  function bindOutbidButtons(el) {
    el.querySelectorAll("[data-outbid]").forEach(btn => {
      btn.addEventListener("click", () => {
        const urlInput = document.getElementById("input-url");
        urlInput.value = btn.getAttribute("data-outbid");
        urlInput.dispatchEvent(new Event("input"));
        document.getElementById("input-amount").value = btn.getAttribute("data-price");
        urlInput.focus();
        document.getElementById("bid-form").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function renderLeaderboard(fullList) {
    const top3El = document.getElementById("leaderboard-top3");
    const restEl = document.getElementById("leaderboard-rest");
    const emptyEl = document.getElementById("empty-state");

    const list = activeCategory === "All" ? fullList : fullList.filter(l => l.category === activeCategory);

    if (!list.length) {
      top3El.innerHTML = "";
      restEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      const [titleEl, subEl] = emptyEl.querySelectorAll("p");
      if (fullList.length) {
        titleEl.textContent = `No bids in ${escapeHTML(activeCategory)} yet.`;
        subEl.textContent = "Be the first in this category — bid above claims #1.";
      } else {
        titleEl.textContent = "No one has claimed a spot yet.";
        subEl.textContent = "Be the first Italian startup on the board — bid above claims #1.";
      }
      return;
    }
    emptyEl.classList.add("hidden");

    const items = showAll ? list : list.slice(0, 10);
    const top3 = items.slice(0, 3);
    const rest = items.slice(3);

    top3El.innerHTML = top3.map((l, i) => leaderboardCardHTML(l, i + 1)).join("");
    restEl.innerHTML = rest.map((l, i) => leaderboardCardHTML(l, i + 4)).join("");

    bindOutbidButtons(top3El);
    bindOutbidButtons(restEl);
  }

  function showBanner(msg, kind) {
    const wrap = document.getElementById("status-banner");
    const inner = document.getElementById("status-banner-inner");
    const colors = {
      success: { border: "#1f6f4a", bg: "rgba(31,111,74,0.10)" },
      info: { border: "var(--border)", bg: "var(--muted)" },
      error: { border: "#ce2b37", bg: "rgba(206,43,55,0.08)" },
    }[kind || "info"];
    inner.style.borderColor = colors.border;
    inner.style.background = colors.bg;
    inner.textContent = msg;
    wrap.classList.remove("hidden");
  }

  async function loadLeaderboard() {
    try {
      const res = await fetch("/api/leaderboard");
      const data = await res.json();
      if (data.configured === false) {
        document.getElementById("config-banner").classList.remove("hidden");
      }
      listings = data.listings || [];
      activity = data.activity || [];
      render();
    } catch (e) {
      console.error("Failed to load leaderboard", e);
    }
  }

  // Live preview: as the user types a URL, fetch its favicon (client-side,
  // via Google's favicon service — no backend needed) and a one-line
  // description (server-side, via /api/preview — arbitrary sites don't send
  // CORS headers a browser fetch could read). The fetched description rides
  // along with the bid and lands in Stripe metadata / the leaderboard card.
  let fetchedDesc = "";
  let previewController = null;
  let previewDebounce = null;

  function renderPreview(state, favicon, text) {
    const box = document.getElementById("url-preview");
    if (state === "idle") {
      box.classList.add("hidden");
      box.classList.remove("flex");
      box.innerHTML = "";
      return;
    }
    box.classList.remove("hidden");
    box.classList.add("flex");
    if (state === "loading") {
      box.innerHTML = `<span>Fetching preview…</span>`;
      return;
    }
    const img = favicon
      ? `<img src="${favicon}" width="16" height="16" class="rounded-sm shrink-0" onerror="this.remove()">`
      : "";
    box.innerHTML = `${img}<span class="truncate">${text ? escapeHTML(text) : "No description found — leaderboard card will show the URL only."}</span>`;
  }

  document.getElementById("input-url").addEventListener("input", function () {
    const raw = this.value.trim();
    clearTimeout(previewDebounce);
    fetchedDesc = "";
    if (previewController) previewController.abort();

    const domain = domainFor(raw);
    if (!domain) {
      renderPreview("idle");
      return;
    }

    previewDebounce = setTimeout(async () => {
      renderPreview("loading");
      previewController = new AbortController();
      try {
        const res = await fetch(`/api/preview?url=${encodeURIComponent(raw)}`, { signal: previewController.signal });
        const data = await res.json();
        fetchedDesc = (data.description || "").trim();
        renderPreview("done", faviconURL(raw), fetchedDesc);
      } catch (err) {
        if (err.name !== "AbortError") renderPreview("done", faviconURL(raw), "");
      }
    }, 600);
  });

  document.getElementById("bid-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const urlInput = document.getElementById("input-url");
    const categoryInput = document.getElementById("input-category");
    const amountInput = document.getElementById("input-amount");
    const errEl = document.getElementById("form-error");
    const submitBtn = document.getElementById("submit-btn");
    errEl.classList.add("hidden");

    const name = urlInput.value.trim();
    const category = categoryInput.value;
    const amount = parseInt(amountInput.value, 10);

    if (!name) return showError("Enter a URL.");
    if (!category) return showError("Pick a category.");
    if (!amount || amount < 5) return showError("Minimum bid is €5.");

    submitBtn.disabled = true;
    submitBtn.textContent = "Redirecting to Stripe…";

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, category, desc: fetchedDesc, amount }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        showError(data.error || "Could not start checkout.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Outbid";
        return;
      }
      window.location.href = data.url;
    } catch (err) {
      showError("Network error — try again.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Outbid";
    }

    function showError(msg) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
  });

  document.getElementById("show-more-btn").addEventListener("click", function () {
    showAll = !showAll;
    this.textContent = showAll ? "Show less" : "Show more";
    render();
  });

  // theme toggle
  const root = document.documentElement;
  function applyTheme(mode) {
    if (mode === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    localStorage.setItem("milanocity_theme", mode);
  }
  const savedTheme = localStorage.getItem("milanocity_theme") || "dark";
  applyTheme(savedTheme);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    applyTheme(root.classList.contains("dark") ? "light" : "dark");
  });

  // handle redirect back from Stripe
  (function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      const name = params.get("name") || "your bid";
      showBanner(`✅ Payment received for ${name}! It can take a few seconds to appear on the board.`, "success");
      setTimeout(loadLeaderboard, 3000);
    } else if (params.get("canceled") === "1") {
      showBanner("Checkout canceled — no charge was made.", "info");
    }
    if (params.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  })();


  loadLeaderboard();
  setInterval(loadLeaderboard, 8000);
})();
