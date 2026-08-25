// startupeurope.lol — frontend. The leaderboard is read live from /api/leaderboard
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
    let items = [...activity].sort((a, b) => b.ts - a.ts).slice(0, 20);

    // Continuous marquee needs one lap's worth of content to be wide enough
    // that the -50% translate never shows a gap — pad short lists by repeating.
    const original = items;
    while (items.length < 8) items = items.concat(original);

    const pillHTML = items.map(a => {
      const match = list.find(l => l.name.toLowerCase() === a.name.toLowerCase());
      const rank = match ? list.indexOf(match) + 1 : 0;
      return `
      <div class="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 border" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(a.name, 22, match && match.favicon)}
        <span class="text-sm font-medium whitespace-nowrap">${escapeHTML(a.name)}</span>
        <span class="text-xs whitespace-nowrap" style="color:var(--muted-fg)">#${rank || "?"} · €${a.price.toLocaleString()} · ${timeAgo(a.ts)}</span>
      </div>`;
    }).join("");

    // Two identical copies back to back — translateX(-50%) then lands exactly
    // on the seam between them, so the loop reads as continuous.
    el.innerHTML = pillHTML + pillHTML;
    el.style.animationDuration = `${items.length * 4}s`;
  }

  function siteURL(name) {
    const domain = domainFor(name);
    return domain ? `https://${domain}` : null;
  }

  function leaderboardCardHTML(l, rank) {
    let glow = "";
    if (rank === 1) glow = "rank-glow-1";
    else if (rank === 2) glow = "rank-glow-2";
    else if (rank === 3) glow = "rank-glow-3";
    const href = siteURL(l.name);
    return `
    <div class="group relative flex items-center gap-3 md:gap-4 px-3 md:px-4 py-4 md:py-5 rounded-2xl my-1.5 transition-colors ${glow} ${href ? "cursor-pointer hover:bg-black/[0.03] dark:hover:bg-white/[0.04]" : ""}" ${href ? `data-href="${href}" role="link" tabindex="0"` : ""}>
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

  // Delegated so it survives innerHTML re-renders — bound once per container
  // (guarded by data-bound) rather than re-attached on every render.
  function bindCardInteractions(el) {
    if (el.dataset.bound) return;
    el.dataset.bound = "1";
    el.addEventListener("click", (e) => {
      const outbidBtn = e.target.closest("[data-outbid]");
      if (outbidBtn) {
        // Prefill the amount only — the URL is the CLICKER's own site, not
        // the listing being outranked, so leave it blank and prompt for it.
        const urlInput = document.getElementById("input-url");
        urlInput.value = "";
        urlInput.placeholder = "Enter your URL to claim this spot";
        urlInput.dispatchEvent(new Event("input"));
        document.getElementById("input-amount").value = outbidBtn.getAttribute("data-price");
        urlInput.focus();
        document.getElementById("bid-form").scrollIntoView({ behavior: "smooth", block: "center" });
        return;
      }
      const card = e.target.closest("[data-href]");
      if (card) window.open(card.getAttribute("data-href"), "_blank", "noopener,noreferrer");
    });
    el.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest("[data-href]");
      if (card) {
        e.preventDefault();
        window.open(card.getAttribute("data-href"), "_blank", "noopener,noreferrer");
      }
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
        subEl.textContent = "Be the first European startup on the board — bid above claims #1.";
      }
      return;
    }
    emptyEl.classList.add("hidden");

    const items = showAll ? list : list.slice(0, 10);
    const top3 = items.slice(0, 3);
    const rest = items.slice(3);

    top3El.innerHTML = top3.map((l, i) => leaderboardCardHTML(l, i + 1)).join("");
    restEl.innerHTML = rest.map((l, i) => leaderboardCardHTML(l, i + 4)).join("");

    bindCardInteractions(top3El);
    bindCardInteractions(restEl);
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
      // Stash what we know so the redirect-back skeleton can show real
      // content immediately instead of guessing. The comped/cheat path
      // returns the server's cleaned name (suffix stripped); the Stripe
      // path doesn't echo it back, but the client's own values are already
      // clean there (no cheat stripping ever happens on that path).
      try {
        sessionStorage.setItem("se_pending_bid", JSON.stringify({
          name: data.name || name,
          category: data.category || category,
          amount: data.amount || amount,
        }));
      } catch (e) {}
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

  document.getElementById("target-price-btn").addEventListener("click", function () {
    const amount = document.getElementById("target-price").textContent.replace(/[^\d]/g, "");
    const amountInput = document.getElementById("input-amount");
    amountInput.value = amount;
    amountInput.focus();
    document.getElementById("bid-form").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // Category dropdown — plus-to-menu morph (transitions.dev #20), adapted
  // so a full-width rounded-square trigger grows straight down into the
  // option list instead of a 40px circular FAB growing in both dimensions.
  (function initCategoryMorph() {
    const morph = document.getElementById("category-morph");
    const trigger = document.getElementById("category-trigger");
    const label = document.getElementById("category-label");
    const hiddenInput = document.getElementById("input-category");

    function setOpen(open) {
      morph.setAttribute("data-open", String(open));
      trigger.setAttribute("aria-expanded", String(open));
    }

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      setOpen(morph.getAttribute("data-open") !== "true");
    });

    morph.querySelectorAll(".cat-option").forEach((opt) => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const value = opt.getAttribute("data-value");
        hiddenInput.value = value;
        label.textContent = value;
        morph.querySelectorAll(".cat-option").forEach((o) => o.setAttribute("aria-selected", String(o === opt)));
        setOpen(false);
      });
    });

    document.addEventListener("click", (e) => {
      if (!morph.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  })();

  // theme toggle
  const root = document.documentElement;
  function applyTheme(mode) {
    if (mode === "dark") root.classList.add("dark"); else root.classList.remove("dark");
    localStorage.setItem("startupeurope_theme", mode);
  }
  const savedTheme = localStorage.getItem("startupeurope_theme") || "dark";
  applyTheme(savedTheme);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    applyTheme(root.classList.contains("dark") ? "light" : "dark");
  });

  // Skeleton-then-reveal (transitions.dev "skeleton loader and reveal") for
  // the row landing after a payment/cheat redirect: pulse a placeholder
  // shaped like the real card, then cross-fade to content we already know
  // from sessionStorage — well before the leaderboard refetch resolves.
  function showPendingBidSkeleton(info) {
    const wrap = document.getElementById("pending-bid-row");
    const amount = Math.round(Number(info.amount)) || 0;
    wrap.innerHTML = `
      <div class="t-skel" data-state="loading">
        <div class="t-skel-skeleton is-pulsing flex items-center gap-3 md:gap-4 px-3 md:px-4 rounded-2xl h-full" style="background:var(--card)">
          <div class="skel-bar shrink-0" style="width:36px;height:36px"></div>
          <div class="flex-1 flex flex-col gap-2">
            <div class="skel-bar" style="width:45%;height:13px"></div>
            <div class="skel-bar" style="width:65%;height:10px"></div>
          </div>
          <div class="skel-bar shrink-0" style="width:64px;height:26px"></div>
        </div>
        <div class="t-skel-content flex items-center gap-3 md:gap-4 px-3 md:px-4 rounded-2xl h-full rank-glow-1">
          ${avatarHTML(info.name, 36)}
          <div class="min-w-0 flex-1">
            <div class="font-bold text-sm md:text-base truncate">${escapeHTML(info.name)}</div>
            <div class="text-xs md:text-sm" style="color:var(--muted-fg)">Added to the board</div>
          </div>
          <span class="font-mono font-semibold text-sm md:text-base rounded-full px-2.5 py-0.5 shrink-0" style="background:var(--muted)">€${amount.toLocaleString()}</span>
        </div>
      </div>`;
    const skel = wrap.querySelector(".t-skel");
    setTimeout(() => skel && skel.classList.add("is-revealed"), 900);
  }

  function clearPendingBidSkeleton() {
    document.getElementById("pending-bid-row").innerHTML = "";
  }

  // handle redirect back from Stripe (or the cheat-code path, which
  // redirects the same way but skips Stripe — see api/checkout.js)
  (function handleRedirect() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") === "1") {
      const name = params.get("name") || "your bid";
      const msg = params.get("comped") === "1"
        ? `✅ ${name} added for free! It can take a few seconds to appear on the board.`
        : `✅ Payment received for ${name}! It can take a few seconds to appear on the board.`;
      showBanner(msg, "success");

      let pending = null;
      try { pending = JSON.parse(sessionStorage.getItem("se_pending_bid") || "null"); } catch (e) {}
      sessionStorage.removeItem("se_pending_bid");
      if (pending && pending.name) showPendingBidSkeleton(pending);

      setTimeout(async () => {
        await loadLeaderboard();
        clearPendingBidSkeleton();
      }, 3000);
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
