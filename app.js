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

  let listings = [];
  let activity = [];
  let showAll = false;
  let visitorBase = 0;

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

  function avatarHTML(name, size) {
    const [c1, c2] = gradientFor(name);
    return `<div class="avatar" style="--seed1:${c1};--seed2:${c2}; width:${size}px; height:${size}px; font-size:${size * 0.4}px">${initials(name)}</div>`;
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
    renderTrending(list);
    renderActivity();
    renderLeaderboard(list);
  }

  function renderForm(list) {
    const top = list[0];
    const topPrice = top ? top.price : 0;
    document.getElementById("target-price").textContent = Math.ceil(topPrice + (top ? 1 : 0)).toLocaleString();
  }

  function renderTrending(list) {
    const el = document.getElementById("trending-row");
    if (!list.length) { el.innerHTML = `<p class="text-sm" style="color:var(--muted-fg)">Nothing trending yet — be the first bid.</p>`; return; }
    const top = [...list].sort((a, b) => b.clicks - a.clicks).slice(0, 6);
    el.innerHTML = top.map(l => `
      <div class="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 border" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(l.name, 22)}
        <span class="text-sm font-medium whitespace-nowrap">${escapeHTML(l.name)}</span>
        <span class="text-xs whitespace-nowrap" style="color:var(--muted-fg)">${l.clicks} clicks/h</span>
      </div>`).join("");
  }

  function renderActivity() {
    const el = document.getElementById("activity-list");
    if (!activity.length) { el.innerHTML = `<p class="text-sm" style="color:var(--muted-fg)">No bids yet.</p>`; return; }
    const list = sorted();
    const items = [...activity].sort((a, b) => b.ts - a.ts).slice(0, showAll ? 50 : 5);
    el.innerHTML = items.map(a => {
      const rank = list.findIndex(l => l.name.toLowerCase() === a.name.toLowerCase()) + 1;
      return `
      <div class="flex items-center gap-3 rounded-xl px-3 py-2 border fade-in" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(a.name, 28)}
        <div class="min-w-0 flex-1 truncate text-sm">
          <span class="font-medium">${escapeHTML(a.name)}</span>
          <span style="color:var(--muted-fg)"> at #${rank || "?"} · €${a.price.toLocaleString()}</span>
        </div>
        <span class="text-xs shrink-0" style="color:var(--muted-fg)">${timeAgo(a.ts)}</span>
      </div>`;
    }).join("");
  }

  function renderLeaderboard(list) {
    const el = document.getElementById("leaderboard-list");
    const emptyEl = document.getElementById("empty-state");
    if (!list.length) {
      el.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }
    emptyEl.classList.add("hidden");

    const items = showAll ? list : list.slice(0, 10);
    el.innerHTML = items.map((l, i) => {
      const rank = i + 1;
      let glow = "";
      if (rank === 1) glow = "rank-glow-1";
      else if (rank === 2) glow = "rank-glow-2";
      else if (rank === 3) glow = "rank-glow-3";
      return `
      <div class="group relative flex items-center gap-3 md:gap-4 px-3 md:px-4 py-4 md:py-5 rounded-2xl my-1.5 ${glow}">
        <div class="w-8 md:w-10 text-center text-sm md:text-base font-medium shrink-0" style="color:var(--muted-fg)">#${rank}</div>
        ${avatarHTML(l.name, rank <= 3 ? 44 : 36)}
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline gap-2">
            <span class="min-w-0 truncate font-bold text-sm md:text-base">${escapeHTML(l.name)}</span>
            <span class="font-mono font-semibold text-sm md:text-base shrink-0">€${l.price.toLocaleString()}</span>
          </div>
          ${l.desc ? `<div class="text-xs md:text-sm line-clamp-2" style="color:var(--muted-fg)">${escapeHTML(l.desc)}</div>` : ""}
          <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] md:text-xs" style="color:var(--muted-fg)">
            <span>${timeAgo(l.ts)}</span><span>·</span><span>${l.clicks.toLocaleString()} clicks</span>
          </div>
        </div>
        <button data-outbid="${escapeHTML(l.name)}" data-price="${Math.ceil(l.price) + 1}" class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors" style="border-color:var(--border)">
          claim for €${(Math.ceil(l.price) + 1).toLocaleString()}
        </button>
      </div>`;
    }).join("");

    el.querySelectorAll("[data-outbid]").forEach(btn => {
      btn.addEventListener("click", () => {
        document.getElementById("input-url").value = btn.getAttribute("data-outbid");
        document.getElementById("input-amount").value = btn.getAttribute("data-price");
        document.getElementById("input-url").focus();
        document.getElementById("bid-form").scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
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

  document.getElementById("bid-form").addEventListener("submit", async function (e) {
    e.preventDefault();
    const urlInput = document.getElementById("input-url");
    const descInput = document.getElementById("input-desc");
    const amountInput = document.getElementById("input-amount");
    const errEl = document.getElementById("form-error");
    const submitBtn = document.getElementById("submit-btn");
    errEl.classList.add("hidden");

    const name = urlInput.value.trim();
    const desc = descInput.value.trim();
    const amount = parseInt(amountInput.value, 10);

    if (!name) return showError("Enter a URL or @handle.");
    if (!amount || amount < 5) return showError("Minimum bid is €5.");

    submitBtn.disabled = true;
    submitBtn.textContent = "Redirecting to Stripe…";

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, desc, amount }),
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
  const savedTheme = localStorage.getItem("milanocity_theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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

  // ambient simulation: cosmetic only, doesn't affect the leaderboard
  visitorBase = 40000 + Math.floor(Math.random() * 5000);
  document.getElementById("visitor-count").textContent = visitorBase.toLocaleString();
  setInterval(() => {
    const el = document.getElementById("online-count");
    if (el) el.textContent = (260 + Math.floor(Math.random() * 90)).toString();
    visitorBase += Math.floor(Math.random() * 3);
    document.getElementById("visitor-count").textContent = visitorBase.toLocaleString();
  }, 4000);

  loadLeaderboard();
  setInterval(loadLeaderboard, 8000);
})();
