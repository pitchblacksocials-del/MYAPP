const state = {
  user: null,
  businesses: [],
  currentBusiness: null,
  conversations: [],
  activeConversation: null,
  meta: { categories: [], provinces: [], cities: [] }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(node.timer);
  node.timer = setTimeout(() => node.classList.remove("show"), 3600);
}

function initials(name) {
  return String(name || "CZ").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function money(value) {
  return `R${Number(value || 0).toLocaleString("en-ZA")}`;
}

function fillSelect(node, values, placeholder) {
  node.innerHTML = `<option value="">${placeholder}</option>` + values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function whatsappUrl(phone, businessName) {
  const clean = String(phone || "").replace(/[^\d]/g, "");
  const normalized = clean.startsWith("27") ? clean : clean.replace(/^0/, "27");
  const text = encodeURIComponent(`Hi ${businessName}, I found you on Connect-ZA and would like to enquire about your services.`);
  return `https://wa.me/${normalized}?text=${text}`;
}

async function boot() {
  try {
    state.meta = await api("/api/meta");
    fillSelect($("#provinceFilter"), state.meta.provinces, "All provinces");
    fillSelect($("#cityFilter"), state.meta.cities, "All South African cities/towns");
    fillSelect($("#categoryFilter"), state.meta.categories, "All categories");
    fillSelect($("#bizProvince"), state.meta.provinces, "Province");
    fillSelect($("#bizCity"), state.meta.cities, "City or town");
    fillSelect($("#bizCategory"), state.meta.categories, "Business category");
    renderCategories();
    await loadMe();
    await loadBusinesses();
    await loadConversations();
    await loadQuotes();
    connectEvents();
  } catch (error) {
    toast(error.message);
  }
}

async function loadMe() {
  try {
    const { user } = await api("/api/auth/me");
    state.user = user;
  } catch {
    state.user = null;
  }
  renderUser();
}

function renderUser() {
  $("#openAuth").textContent = state.user ? state.user.name.split(" ")[0] : "Sign in";
  $("#openBusiness").disabled = state.user?.type === "customer";
  if (state.user?.type === "business") $("#openBusiness").textContent = "Business Profile";
  if (state.user?.type === "admin") $("#openBusiness").textContent = "Admin mode";
}

function showPanel(id) {
  const node = $(id);
  if (node) node.classList.remove("hidden");
}

async function loadBusinesses() {
  const params = new URLSearchParams({
    q: $("#searchInput").value,
    province: $("#provinceFilter").value,
    category: $("#categoryFilter").value,
    city: $("#cityFilter").value,
    rating: $("#ratingFilter").value,
    prime: $("#primeFilter").value
  });
  const { businesses } = await api(`/api/businesses?${params}`);
  const priceKeyword = $("#priceFilter").value.trim().toLowerCase();
  state.businesses = priceKeyword ? businesses.filter((biz) => String(biz.priceRange).toLowerCase().includes(priceKeyword)) : businesses;
  if (!state.currentBusiness && state.businesses.length) state.currentBusiness = state.businesses[0];
  $("#statBusinesses").textContent = state.businesses.length;
  renderBusinesses();
}

function renderCategories() {
  const icons = {
    Construction: "▦",
    Plumbing: "◌",
    Electrical: "ϟ",
    Security: "▣",
    Automotive: "◈",
    Beauty: "✦",
    Cleaning: "◇",
    Logistics: "⇄",
    IT: "</>",
    Solar: "☼",
    Landscaping: "♧",
    Catering: "◒"
  };
  $("#categoryGrid").innerHTML = state.meta.categories.map((category) => `
    <button class="category-tile" data-category="${category}">
      <span>${icons[category] || "◆"}</span>
      <strong>${category}</strong>
    </button>
  `).join("");
}

function renderBusinesses() {
  $("#businessGrid").innerHTML = state.businesses.map((biz) => `
    <article class="business-card ${biz.primeStatus === "active" ? "prime" : ""}">
      <div class="card-media" style="background-image:url('${biz.gallery?.[0] || ""}')"></div>
      <div class="card-body">
        <div class="card-title-row">
          <div>
            <h3>${biz.name}</h3>
            <div class="meta-line">
              ${biz.primeStatus === "active" ? `<span class="prime-badge">PRIME</span>` : ""}
              ${biz.verified ? `<span class="verified-badge">Verified</span>` : ""}
              <span>★ ${biz.rating || "New"} (${biz.reviewCount || 0})</span>
            </div>
          </div>
          <button class="icon-btn favorite-btn" data-id="${biz.id}" title="Save favorite">♡</button>
        </div>
        <p>${biz.description}</p>
        <div class="meta-line"><span>${biz.category}</span><span>${biz.city}, ${biz.province}</span><span>${biz.priceRange}</span></div>
        <div class="service-tags">${(biz.services || []).slice(0, 4).map((service) => `<span>${service}</span>`).join("")}</div>
        <div class="card-actions">
          <button class="secondary-btn view-profile" data-id="${biz.id}">Profile</button>
          <a class="secondary-btn" target="_blank" rel="noopener" href="${whatsappUrl(biz.phone, biz.name)}">WhatsApp</a>
          <button class="primary-btn chat-business" data-id="${biz.id}">Chat</button>
        </div>
      </div>
    </article>
  `).join("") || `<p>No businesses match your filters yet.</p>`;
}

async function showProfile(id) {
  const { business, reviews } = await api(`/api/businesses/${id}`);
  state.currentBusiness = business;
  $("#profileSection").classList.remove("hidden");
  $("#profileSection").innerHTML = `
    <article class="profile-hero">
      <div class="profile-cover" style="background-image:url('${business.cover || business.gallery?.[0] || ""}')"></div>
      <div class="profile-content">
        <div>
          <div class="profile-logo">${initials(business.name)}</div>
          <div class="meta-line">
            ${business.primeStatus === "active" ? `<span class="prime-badge">PRIME</span>` : ""}
            ${business.verified ? `<span class="verified-badge">Verified business</span>` : ""}
            <span>★ ${business.rating || "New"} rating</span>
          </div>
          <h2>${business.name}</h2>
          <p>${business.description}</p>
          <div class="service-tags">${business.services.map((service) => `<span>${service}</span>`).join("")}</div>
          <div class="gallery-grid">${business.gallery.map((item) => `<img alt="${business.name} portfolio" src="${item}">`).join("")}</div>
          <h3>Reviews</h3>
          <div class="quote-list">${reviews.map((review) => `<div class="quote-item"><strong>${"★".repeat(review.rating)}</strong><p>${review.text}</p>${review.response ? `<small>Business response: ${review.response}</small>` : ""}</div>`).join("") || "<p>No reviews yet.</p>"}</div>
        </div>
        <aside class="profile-card">
          <div class="admin-card">
            <h3>Contact</h3>
            <p>${business.address}</p>
            <p>${business.hours}</p>
            <p>${business.email}</p>
            <div class="card-actions">
              <a class="primary-btn" target="_blank" rel="noopener" href="${whatsappUrl(business.phone, business.name)}">WhatsApp</a>
              <button class="secondary-btn chat-business" data-id="${business.id}">Chat</button>
              <button class="secondary-btn request-quote" data-id="${business.id}">Quote</button>
              <a class="secondary-btn" href="tel:${business.phone}">Call Now</a>
              <a class="secondary-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.address} ${business.city} South Africa`)}">Map</a>
              <a class="secondary-btn" target="_blank" rel="noopener" href="${business.website}">Website</a>
            </div>
          </div>
        </aside>
      </div>
    </article>
  `;
  location.hash = "profileSection";
}

async function loadConversations() {
  if (!state.user) {
    renderConversations();
    return;
  }
  try {
    const { conversations } = await api("/api/messages");
    state.conversations = conversations;
    renderConversations();
  } catch {
    state.conversations = [];
    renderConversations();
  }
}

function renderConversations() {
  const businessById = Object.fromEntries(state.businesses.map((biz) => [biz.id, biz]));
  $("#conversationList").innerHTML = state.conversations.map((con) => {
    const biz = businessById[con.businessId] || state.businesses.find((item) => item.id === con.businessId);
    const last = con.messages.at(-1);
    return `<button class="conversation-item ${state.activeConversation?.id === con.id ? "active" : ""}" data-id="${con.id}">
      <strong>${biz?.name || "Conversation"}</strong>
      <small>${last?.text || "No messages yet"}</small>
    </button>`;
  }).join("") || `<p>Sign in and start a chat with any business.</p>`;
  renderChat();
}

function renderChat() {
  const con = state.activeConversation;
  if (!con) {
    $("#chatHeader").textContent = state.currentBusiness ? `Chat with ${state.currentBusiness.name}` : "Select a business to start a chat";
    $("#chatMessages").innerHTML = "";
    return;
  }
  const biz = state.businesses.find((item) => item.id === con.businessId);
  $("#chatHeader").textContent = `Chat with ${biz?.name || "business"}`;
  $("#chatMessages").innerHTML = con.messages.map((message) => `
    <div class="message ${message.senderId === state.user?.id ? "mine" : ""}">
      <strong>${message.type === "voice" ? "Voice note" : message.type === "image" ? "Image" : "Message"}</strong>
      <div>${message.text || message.attachment || ""}</div>
      <small>${new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
    </div>
  `).join("");
  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

async function loadQuotes() {
  if (!state.user) return;
  try {
    const { quotes } = await api("/api/quotes");
    $("#quoteList").innerHTML = quotes.map((quote) => `
      <div class="quote-item">
        <strong>${quote.title}</strong>
        <p>${quote.details}</p>
        <small>${quote.status} • ${quote.budget || "Budget not set"} • ${quote.files?.length || 0} file(s)</small>
      </div>
    `).join("") || "<p>No quote requests yet.</p>";
  } catch {
    $("#quoteList").innerHTML = "<p>Sign in to view quotes.</p>";
  }
}

async function fileInputsToDataUrls(input) {
  const files = Array.from(input.files || []);
  return Promise.all(files.slice(0, 6).map((file) => new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, type: file.type, data: reader.result });
    reader.readAsDataURL(file);
  })));
}

async function renderAdmin() {
  if (state.user?.type !== "admin") {
    $("#adminDashboard").innerHTML = `<div class="admin-card wide"><h3>Admin access</h3><p>Sign in as admin@connect-za.local to manage users, approvals, PRIME, revenue, reports, ads, and push notifications.</p></div>`;
    return;
  }
  const data = await api("/api/admin");
  $("#adminDashboard").innerHTML = `
    <div class="admin-card"><h3>Revenue</h3><h2>${money(data.analytics.revenue)}</h2><p>PRIME and sponsored ads</p></div>
    <div class="admin-card"><h3>Businesses</h3><h2>${data.analytics.activeBusinesses}</h2><p>${data.analytics.pendingBusinesses} pending approval</p></div>
    <div class="admin-card"><h3>Users</h3><h2>${data.analytics.users}</h2><p>Customers, businesses, admins</p></div>
    <div class="admin-card"><h3>Quote requests</h3><h2>${data.analytics.quoteRequests}</h2><p>Tracked marketplace demand</p></div>
    <div class="admin-card wide">
      <h3>Business approval and PRIME moderation</h3>
      <div class="admin-list">
        ${data.businesses.map((biz) => `
          <div class="admin-row">
            <strong>${biz.name}</strong>
            <small>${biz.category} • ${biz.city} • status: ${biz.status} • PRIME: ${biz.primeStatus} • docs: ${biz.verificationDocuments?.proofOfId && biz.verificationDocuments?.proofOfAddress ? "submitted" : "missing"}</small>
            <div class="admin-row-actions">
              <button class="secondary-btn admin-status" data-id="${biz.id}" data-status="approved">Approve</button>
              <button class="secondary-btn admin-status" data-id="${biz.id}" data-status="suspended">Suspend</button>
              <button class="secondary-btn admin-prime" data-id="${biz.id}" data-status="active">Approve PRIME</button>
              <button class="secondary-btn admin-prime" data-id="${biz.id}" data-status="suspended">Suspend PRIME</button>
            </div>
          </div>
        `).join("")}
      </div>
    </div>
    <div class="admin-card wide">
      <h3>Advertisements and notifications</h3>
      <form id="adForm" class="chat-form">
        <input id="adTitle" placeholder="Banner or sponsored ad title">
        <select id="adPlacement"><option>homepage</option><option>category</option><option>profile</option></select>
        <button class="primary-btn">Create</button>
      </form>
      <div class="quote-list">${data.ads.map((ad) => `<div class="quote-item"><strong>${ad.title}</strong><small>${ad.placement} • ${ad.impressions} impressions • ${ad.clicks} clicks</small></div>`).join("")}</div>
    </div>
  `;
}

function connectEvents() {
  const events = new EventSource("/api/events");
  events.addEventListener("ready", () => {
    $("#liveStatus").textContent = "Live updates connected";
  });
  events.addEventListener("message", async () => {
    toast("New chat message");
    await loadConversations();
  });
  events.addEventListener("quote", async () => {
    toast("New quote request");
    await loadQuotes();
  });
  events.addEventListener("prime", async () => {
    toast("PRIME status updated");
    await loadBusinesses();
  });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  try {
    if (target.id === "themeToggle") {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "" : "dark";
    }
    if (target.id === "openAuth") $("#authDialog").showModal();
    if (target.id === "openBusiness") {
      if (!state.user) return $("#authDialog").showModal();
      if (state.user.type !== "business") return toast("Use a business account to create a company profile.");
      $("#businessDialog").showModal();
    }
    if (target.matches("[data-category]")) {
      $("#categoryFilter").value = target.dataset.category;
      await loadBusinesses();
    }
    if (target.classList.contains("view-profile")) await showProfile(target.dataset.id);
    if (target.classList.contains("request-quote")) {
      state.currentBusiness = state.businesses.find((biz) => biz.id === target.dataset.id) || state.currentBusiness;
      showPanel("#chat");
      location.hash = "chat";
      $("#quoteTitle").focus();
    }
    if (target.classList.contains("chat-business")) {
      if (!state.user) return $("#authDialog").showModal();
      state.currentBusiness = state.businesses.find((biz) => biz.id === target.dataset.id);
      state.activeConversation = state.conversations.find((con) => con.businessId === state.currentBusiness.id) || null;
      renderConversations();
      renderChat();
      showPanel("#chat");
      location.hash = "chat";
      $("#chatInput").focus();
    }
    if (target.classList.contains("favorite-btn")) {
      if (!state.user) return $("#authDialog").showModal();
      await api("/api/favorites", { method: "POST", body: JSON.stringify({ businessId: target.dataset.id }) });
      toast("Favorites updated");
    }
    if (target.classList.contains("conversation-item")) {
      state.activeConversation = state.conversations.find((con) => con.id === target.dataset.id);
      renderConversations();
    }
    if (target.classList.contains("tab")) {
      $$(".tab").forEach((tab) => tab.classList.toggle("active", tab === target));
      $$(".auth-pane").forEach((pane) => pane.classList.add("hidden"));
      $(`#auth${target.dataset.authTab[0].toUpperCase()}${target.dataset.authTab.slice(1)}`).classList.remove("hidden");
    }
    if (target.classList.contains("admin-status")) {
      await api("/api/admin/business-status", { method: "POST", body: JSON.stringify({ businessId: target.dataset.id, status: target.dataset.status }) });
      await renderAdmin();
      await loadBusinesses();
      toast("Business status updated");
    }
    if (target.classList.contains("admin-prime")) {
      await api("/api/admin/prime-status", { method: "POST", body: JSON.stringify({ businessId: target.dataset.id, status: target.dataset.status }) });
      await renderAdmin();
      await loadBusinesses();
      toast("PRIME status updated");
    }
  } catch (error) {
    toast(error.message);
  }
});

$("#heroSearch").addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadBusinesses();
  location.hash = "discover";
});

["provinceFilter", "categoryFilter", "cityFilter", "ratingFilter", "primeFilter", "priceFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => loadBusinesses().catch((error) => toast(error.message)));
});

$("#nearbyBtn").addEventListener("click", async () => {
  $("#provinceFilter").value = state.user?.province || "Gauteng";
  $("#cityFilter").value = state.user?.city || "Johannesburg";
  await loadBusinesses();
});

$("#loginBtn").addEventListener("click", async () => {
  try {
    const { user } = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: $("#loginEmail").value, password: $("#loginPassword").value })
    });
    state.user = user;
    $("#authDialog").close();
    renderUser();
    await Promise.all([loadConversations(), loadQuotes(), renderAdmin()]);
    toast(`Signed in as ${user.name}`);
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#registerBtn").addEventListener("click", async () => {
  try {
    const { user, otpDevCode } = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({
        name: $("#registerName").value,
        email: $("#registerEmail").value,
        phone: $("#registerPhone").value,
        password: $("#registerPassword").value,
        type: $("#registerType").value
      })
    });
    state.user = user;
    $("#authMessage").textContent = `Account created. Demo OTP: ${otpDevCode}`;
    renderUser();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#verifyOtpBtn").addEventListener("click", async () => {
  try {
    const { user } = await api("/api/auth/verify-otp", { method: "POST", body: JSON.stringify({ code: $("#otpCode").value }) });
    state.user = user;
    $("#authMessage").textContent = "Phone verified.";
    renderUser();
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#resetBtn").addEventListener("click", async () => {
  const data = await api("/api/auth/password-reset", { method: "POST", body: JSON.stringify({ email: $("#resetEmail").value }) });
  $("#authMessage").textContent = data.message;
});

$("#saveBusinessBtn").addEventListener("click", async () => {
  try {
    if (!state.user) return $("#authDialog").showModal();
    const gallery = (await fileInputsToDataUrls($("#bizGallery"))).map((file) => file.data);
    const proofOfId = (await fileInputsToDataUrls($("#bizProofId")))[0];
    const proofOfAddress = (await fileInputsToDataUrls($("#bizProofAddress")))[0];
    if (!proofOfId || !proofOfAddress) throw new Error("Please upload proof of ID and proof of address.");
    const { business } = await api("/api/businesses", {
      method: "POST",
      body: JSON.stringify({
        name: $("#bizName").value,
        category: $("#bizCategory").value,
        description: $("#bizDescription").value,
        services: $("#bizServices").value,
        phone: $("#bizPhone").value,
        email: $("#bizEmail").value,
        website: $("#bizWebsite").value,
        province: $("#bizProvince").value,
        city: $("#bizCity").value,
        address: $("#bizAddress").value,
        hours: $("#bizHours").value,
        priceRange: $("#bizPrice").value,
        pricingMode: $("#bizPrice").value || "Request quote",
        gallery,
        verificationDocuments: {
          proofOfId,
          proofOfAddress,
          submittedAt: new Date().toISOString()
        }
      })
    });
    $("#businessMessage").textContent = `${business.name} submitted for admin approval.`;
    await loadBusinesses();
  } catch (error) {
    $("#businessMessage").textContent = error.message;
  }
});

$("#chatForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!state.user) return $("#authDialog").showModal();
    if (!state.currentBusiness) throw new Error("Select a business first.");
    const { conversation } = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        businessId: state.currentBusiness.id,
        customerId: state.activeConversation?.customerId,
        type: $("#messageType").value,
        text: $("#chatInput").value
      })
    });
    $("#chatInput").value = "";
    await loadConversations();
    state.activeConversation = state.conversations.find((con) => con.id === conversation.id);
    renderConversations();
  } catch (error) {
    toast(error.message);
  }
});

$("#quoteForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    if (!state.user) return $("#authDialog").showModal();
    if (!state.currentBusiness) throw new Error("Select a business first.");
    const files = await fileInputsToDataUrls($("#quoteFiles"));
    await api("/api/quotes", {
      method: "POST",
      body: JSON.stringify({
        businessId: state.currentBusiness.id,
        title: $("#quoteTitle").value,
        details: $("#quoteDetails").value,
        budget: $("#quoteBudget").value,
        files
      })
    });
    event.target.reset();
    await loadQuotes();
    toast("Quote request sent");
  } catch (error) {
    toast(error.message);
  }
});

$("#startPrime").addEventListener("click", async () => {
  try {
    if (!state.user) return $("#authDialog").showModal();
    if (state.user.type !== "business") throw new Error("Sign in as a business to start PRIME.");
    const own = state.businesses.find((biz) => biz.ownerId === state.user.id) || state.currentBusiness;
    if (!own) throw new Error("Create a business profile before starting PRIME.");
    const { redirectUrl, gateway } = await api("/api/payments/prime", {
      method: "POST",
      body: JSON.stringify({ businessId: own.id, gateway: $("#primeGateway").value, autoRenew: $("#primeRenew").checked })
    });
    toast(`${gateway} checkout created. Redirecting...`);
    setTimeout(() => { location.href = redirectUrl; }, 700);
  } catch (error) {
    toast(error.message);
  }
});

$("#refreshAdmin").addEventListener("click", () => renderAdmin().catch((error) => toast(error.message)));

document.addEventListener("submit", async (event) => {
  if (event.target.id === "adForm") {
    event.preventDefault();
    await api("/api/admin/ads", {
      method: "POST",
      body: JSON.stringify({ title: $("#adTitle").value, placement: $("#adPlacement").value })
    });
    await renderAdmin();
    toast("Advertisement created");
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

boot().then(renderAdmin);
