// outbid.lol clone — client-side simulation, persisted to localStorage
(function () {
  "use strict";

  const STORAGE_KEY = "outbid_clone_state_v1";
  const MIN_BID = 5;

  const SEED_LISTINGS = [
    { name: "joni.ai", price: 14013, desc: "JONI is your personal AI computer. Chat once and a team of AI agents and skills gets to work, with the right model picked for every job. None of the complexity.", clicks: 5554, hoursAgo: 9 },
    { name: "outrank.so", price: 13005, desc: "Get traffic and outrank competitors with Backlinks & SEO-optimized content while you sleep.", clicks: 8081, hoursAgo: 9 },
    { name: "orynth.dev", price: 12716, desc: "Discover early-stage products, support their creators, and invest in their coins. Orynth connects builders with communities who believe in them.", clicks: 11273, hoursAgo: 10 },
    { name: "crowdreply.io", price: 12711, desc: "Get your brand added to the pages ChatGPT, Gemini, and Perplexity already cite. CrowdReply runs the outreach. You approve placements and pay when they publish.", clicks: 5027, hoursAgo: 10 },
    { name: "trycomp.ai", price: 10000, desc: "Automate SOC 2, ISO 27001, HIPAA, and GDPR. 580+ integrations, 1,000+ companies, audit-ready in days, with audit and pentest included.", clicks: 11651, hoursAgo: 24 },
    { name: "winning.com", price: 3129, desc: "", clicks: 235, hoursAgo: 1 },
    { name: "lathire.com", price: 3127, desc: "LatHire is Latin America's largest talent marketplace. Hire vetted tech and generalist professionals in as little as 24 hours, for up to 80% less.", clicks: 2767, hoursAgo: 7 },
    { name: "contentstudio.io", price: 3126, desc: "All-in-one social media management tool backed by AI to plan, schedule, publish, and track your content across every major platform from one dashboard.", clicks: 613, hoursAgo: 7 },
    { name: "unify.ai", price: 3125, desc: "AI teammates for everyone else. Contribute to unifyai/unify development by creating an account on GitHub.", clicks: 446, hoursAgo: 8 },
    { name: "rankaffiliate.lol", price: 5, desc: "", clicks: 12, hoursAgo: 0.03 },
    { name: "getwiser.ai", price: 12, desc: "", clicks: 44, hoursAgo: 0.03 },
    { name: "oyashield.com", price: 10, desc: "", clicks: 21, hoursAgo: 0.2 },
    { name: "vibewar.lol", price: 23, desc: "", clicks: 88, hoursAgo: 0.25 },
  ];

  const GRADIENTS = [
    ["#e8501f", "#f9a45c"], ["#2563eb", "#60a5fa"], ["#16a34a", "#86efac"],
    ["#9333ea", "#d8b4fe"], ["#dc2626", "#fca5a5"], ["#0891b2", "#67e8f9"],
    ["#ca8a04", "#fde047"], ["#db2777", "#f9a8d4"],
  ];

  function now() { return Date.now(); }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    const listings = SEED_LISTINGS.map((l, i) => ({
      id: "seed-" + i,
      name: l.name,
      desc: l.desc,
      price: l.price,
      clicks: l.clicks,
      ts: now() - l.hoursAgo * 3600 * 1000,
    }));
    return {
      listings,
      activity: listings.slice(0, 5).map(l => ({ name: l.name, rank: 0, price: l.price, ts: l.ts })),
      visitors: 1072388,
    };
  }

  let state = loadState();

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function sorted() {
    return [...state.listings].sort((a, b) => b.price - a.price);
  }

  function timeAgo(ts) {
    const diff = Math.max(0, now() - ts);
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

  let showAll = false;

  function render() {
    const list = sorted();
    renderHero();
    renderForm(list);
    renderTrending(list);
    renderActivity();
    renderLeaderboard(list);
  }

  function renderHero() {
    document.getElementById("visitor-count").textContent = state.visitors.toLocaleString();
  }

  function renderForm(list) {
    const top = list[0];
    const topPrice = top ? top.price : 0;
    document.getElementById("target-price").textContent = (topPrice + (top ? 5 : 0)).toLocaleString();
    document.getElementById("claim-rank-label").textContent = "#1";
  }

  function renderTrending(list) {
    const top = [...list].sort((a, b) => b.clicks - a.clicks).slice(0, 6);
    const el = document.getElementById("trending-row");
    el.innerHTML = top.map(l => `
      <div class="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 border" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(l.name, 22)}
        <span class="text-sm font-medium whitespace-nowrap">${escapeHTML(l.name)}</span>
        <span class="text-xs whitespace-nowrap" style="color:var(--muted-fg)">${(l.clicks % 700) + 40} clicks/h</span>
      </div>`).join("");
  }

  function renderActivity() {
    const el = document.getElementById("activity-list");
    const items = [...state.activity].sort((a, b) => b.ts - a.ts).slice(0, showAll ? 50 : 5);
    el.innerHTML = items.map(a => `
      <div class="flex items-center gap-3 rounded-xl px-3 py-2 border fade-in" style="border-color:var(--border); background:var(--card)">
        ${avatarHTML(a.name, 28)}
        <div class="min-w-0 flex-1 truncate text-sm">
          <span class="font-medium">${escapeHTML(a.name)}</span>
          <span style="color:var(--muted-fg)"> at #${a.rank || "?"} · $${a.price.toLocaleString()}</span>
        </div>
        <span class="text-xs shrink-0" style="color:var(--muted-fg)">${timeAgo(a.ts)}</span>
      </div>`).join("");
  }

  function renderLeaderboard(list) {
    const el = document.getElementById("leaderboard-list");
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
            <span class="font-mono font-semibold text-sm md:text-base shrink-0">$${l.price.toLocaleString()}</span>
          </div>
          ${l.desc ? `<div class="text-xs md:text-sm line-clamp-2" style="color:var(--muted-fg)">${escapeHTML(l.desc)}</div>` : ""}
          <div class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] md:text-xs" style="color:var(--muted-fg)">
            <span>${timeAgo(l.ts)}</span><span>·</span><span>${l.clicks.toLocaleString()} clicks</span>
          </div>
        </div>
        <button data-outbid="${l.id}" class="shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors" style="border-color:var(--border)">
          claim for $${(l.price + 1).toLocaleString()}
        </button>
      </div>`;
    }).join("");

    el.querySelectorAll("[data-outbid]").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-outbid");
        const target = state.listings.find(l => l.id === id);
        if (target) {
          document.getElementById("input-amount").value = target.price + 1;
          document.getElementById("input-url").focus();
          document.getElementById("bid-form").scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function slugId() { return "u-" + Math.random().toString(36).slice(2, 10); }

  document.getElementById("bid-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const urlInput = document.getElementById("input-url");
    const descInput = document.getElementById("input-desc");
    const amountInput = document.getElementById("input-amount");
    const errEl = document.getElementById("form-error");
    errEl.classList.add("hidden");

    const name = urlInput.value.trim();
    const desc = descInput.value.trim();
    const amount = parseInt(amountInput.value, 10);

    if (!name) { showError("Enter a URL or @handle."); return; }
    if (!amount || amount < MIN_BID) { showError(`Minimum bid is $${MIN_BID}.`); return; }

    const existing = state.listings.find(l => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (amount <= existing.price) { showError(`Your current bid is $${existing.price}. Bid higher to move up.`); return; }
      existing.price = amount;
      existing.ts = now();
      if (desc) existing.desc = desc;
    } else {
      state.listings.push({
        id: slugId(), name, desc, price: amount, clicks: Math.floor(Math.random() * 20) + 1, ts: now(),
      });
    }

    const rank = sorted().findIndex(l => l.name.toLowerCase() === name.toLowerCase()) + 1;
    state.activity.unshift({ name, rank, price: amount, ts: now() });
    state.activity = state.activity.slice(0, 100);
    save();
    render();

    urlInput.value = ""; descInput.value = ""; amountInput.value = "";

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
    localStorage.setItem("outbid_theme", mode);
  }
  const savedTheme = localStorage.getItem("outbid_theme")
    || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);
  document.getElementById("theme-toggle").addEventListener("click", () => {
    applyTheme(root.classList.contains("dark") ? "light" : "dark");
  });

  // ambient simulation: online count + visitor ticker + fake activity
  setInterval(() => {
    const el = document.getElementById("online-count");
    if (el) el.textContent = (480 + Math.floor(Math.random() * 80)).toString();
    state.visitors += Math.floor(Math.random() * 4);
    renderHero();
  }, 4000);

  render();
})();
