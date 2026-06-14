const state = {
  user: null,
  businesses: [],
  myBusinesses: [],
  editingBusinessId: "",
  businessGalleryDraft: [],
  currentBusiness: null,
  conversations: [],
  activeConversation: null,
  meta: { categories: [], provinces: [], cities: [] }
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options
    });
  } catch {
    throw new Error("Could not reach the server. Please check your connection and reduce upload file sizes if you selected large files.");
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
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

const subscriptionPlans = {
  standard: { label: "Standard", amount: 150 },
  prime: { label: "PRIME", amount: 250 }
};
const MAX_BUSINESS_FILE_BYTES = 8 * 1024 * 1024;
const MAX_BUSINESS_UPLOAD_BYTES = 20 * 1024 * 1024;

function subscriptionPlanLabel(plan) {
  const data = subscriptionPlans[plan] || subscriptionPlans.standard;
  return `${data.label} R${data.amount}/month`;
}

function subscriptionBadge(business) {
  if (business.primeStatus === "active") return `<span class="prime-badge">PRIME</span>`;
  if (business.subscriptionPlan === "standard" && business.subscriptionStatus === "active") return `<span class="standard-badge">STANDARD</span>`;
  return "";
}

function fillSelect(node, values, placeholder) {
  node.innerHTML = `<option value="">${placeholder}</option>` + values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function syncCityFilter(sourceId) {
  const heroCity = $("#heroCityFilter");
  const discoverCity = $("#cityFilter");
  if (!heroCity || !discoverCity) return;
  if (sourceId === "heroCityFilter") discoverCity.value = heroCity.value;
  if (sourceId === "cityFilter") heroCity.value = discoverCity.value;
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
    fillSelect($("#heroCityFilter"), state.meta.cities, "All cities/towns");
    fillSelect($("#cityFilter"), state.meta.cities, "All South African cities/towns");
    fillSelect($("#categoryFilter"), state.meta.categories, "All categories");
    fillSelect($("#bizProvince"), state.meta.provinces, "Province");
    fillSelect($("#bizCity"), state.meta.cities, "City or town");
    fillSelect($("#bizCategory"), state.meta.categories, "Business category");
    renderCategories();
    await loadMe();
    await loadMyBusinesses();
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
  $("#openBusiness").textContent = "List Business";
  if (state.user?.type === "business") $("#openBusiness").textContent = "Business Profile";
  if (state.user?.type === "admin") $("#openBusiness").textContent = "Admin mode";
  $("#admin").classList.toggle("hidden", state.user?.type !== "admin");
  renderPrimePanel();
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

async function loadMyBusinesses() {
  state.myBusinesses = [];
  if (state.user?.type !== "business") {
    renderPrimePanel();
    return;
  }
  try {
    const { businesses } = await api("/api/businesses/mine");
    state.myBusinesses = businesses;
  } catch {
    state.myBusinesses = [];
  }
  renderPrimePanel();
}

function renderPrimePanel() {
  const select = $("#primeBusinessSelect");
  const status = $("#primeStatusText");
  const planSelect = $("#subscriptionPlan");
  if (!select || !status) return;
  const selectedId = select.value;
  const selectedPlan = planSelect?.value || "standard";
  if ($("#startSubscription")) $("#startSubscription").textContent = selectedPlan === "prime" ? "Start PRIME" : "Start Standard";

  if (!state.user) {
    select.innerHTML = `<option value="">Sign in as a business owner</option>`;
    status.textContent = "Business owners can activate Standard for R150/month or PRIME for R250/month.";
    return;
  }

  if (state.user.type !== "business") {
    select.innerHTML = `<option value="">Business account required</option>`;
    status.textContent = "Create or sign in with a business account to subscribe a company.";
    return;
  }

  if (!state.myBusinesses.length) {
    select.innerHTML = `<option value="">Create a business profile first</option>`;
    status.textContent = "Submit a business profile, then return here to start a monthly subscription.";
    return;
  }

  select.innerHTML = state.myBusinesses.map((business) => {
    const plan = business.subscriptionPlan && business.subscriptionPlan !== "none" ? business.subscriptionPlan : "no plan";
    const label = `${business.name} - ${plan} ${business.subscriptionStatus || "inactive"}`;
    return `<option value="${business.id}">${label}</option>`;
  }).join("");

  const selected = state.myBusinesses.find((business) => business.id === selectedId) || state.myBusinesses[0];
  select.value = selected.id;
  const currentPlan = selected.subscriptionPlan && selected.subscriptionPlan !== "none" ? selected.subscriptionPlan : selectedPlan;
  const currentStatus = selected.subscriptionStatus || selected.primeStatus || "inactive";
  const planName = subscriptionPlans[currentPlan]?.label || "Subscription";
  const labels = {
    active: `${planName} is active. ${currentPlan === "prime" ? "This business is boosted in search results." : "This business is listed normally."}`,
    pending: `${planName} payment/request received. Admin approval is pending.`,
    suspended: `${planName} is suspended for this business.`,
    inactive: `Choose Standard for R150/month or PRIME for R250/month.`
  };
  status.textContent = labels[currentStatus] || labels.inactive;
}

function setBusinessTab(tabName) {
  $$(".business-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.businessTab === tabName));
  $("#businessDetailsPane").classList.toggle("hidden", tabName !== "details");
  $("#businessPhotosPane").classList.toggle("hidden", tabName !== "photos");
}

function renderBusinessProfileSelect() {
  const select = $("#bizProfileSelect");
  select.innerHTML = `<option value="">Register new business</option>` + state.myBusinesses.map((business) => (
    `<option value="${business.id}">${business.name}</option>`
  )).join("");
  select.value = state.editingBusinessId || "";
  select.classList.toggle("hidden", !state.myBusinesses.length);
}

function setFieldValue(id, value = "") {
  const node = $(`#${id}`);
  if (node) node.value = value || "";
}

function renderProjectGalleryEditor() {
  const node = $("#projectGalleryEditor");
  if (!node) return;
  node.innerHTML = state.businessGalleryDraft.map((item, index) => `
    <article class="project-photo-tile">
      <img alt="Project photo ${index + 1}" src="${item}">
      <button type="button" class="icon-btn remove-project-photo" data-index="${index}" title="Remove project photo">x</button>
    </article>
  `).join("") || `<p class="empty-gallery-note">No project photos yet. Add completed-work images below.</p>`;
}

function populateBusinessForm(business = null) {
  state.editingBusinessId = business?.id || "";
  state.businessGalleryDraft = Array.isArray(business?.gallery) ? [...business.gallery] : [];
  $("#businessDialogTitle").textContent = business ? "Edit business profile" : "Register your business";
  $("#saveBusinessBtn").textContent = business ? "Update profile" : "Submit for approval";
  $("#businessMessage").textContent = "";
  setFieldValue("bizName", business?.name);
  setFieldValue("bizCategory", business?.category);
  setFieldValue("bizDescription", business?.description);
  setFieldValue("bizServices", (business?.services || []).join(", "));
  setFieldValue("bizPhone", business?.phone);
  setFieldValue("bizEmail", business?.email);
  setFieldValue("bizWebsite", business?.website);
  setFieldValue("bizProvince", business?.province);
  setFieldValue("bizCity", business?.city);
  setFieldValue("bizAddress", business?.address);
  setFieldValue("bizHours", business?.hours);
  setFieldValue("bizPrice", business?.priceRange);
  $("#bizGallery").value = "";
  $("#bizProofId").value = "";
  $("#bizProofAddress").value = "";
  renderBusinessProfileSelect();
  renderProjectGalleryEditor();
}

async function openBusinessProfileDialog() {
  await loadMyBusinesses();
  populateBusinessForm(state.myBusinesses[0] || null);
  setBusinessTab("details");
  $("#businessDialog").showModal();
}

function renderCategories() {
  const icons = {
    Construction: "BLD",
    Plumbing: "PLM",
    Electrical: "ELC",
    Security: "SEC",
    Automotive: "CAR",
    Beauty: "BTY",
    Cleaning: "CLN",
    Logistics: "LOG",
    IT: "</>",
    Solar: "SOL",
    Landscaping: "LND",
    Catering: "CAT",
    Roofing: "ROF",
    Painting: "PNT",
    Tiling: "TIL",
    Carpentry: "CRP",
    Welding: "WLD",
    HVAC: "AIR",
    "Pest Control": "PST",
    Moving: "MOV",
    Events: "EVT",
    Education: "EDU",
    Healthcare: "MED",
    "Legal Services": "LAW",
    Accounting: "ACC",
    "Real Estate": "EST",
    Agriculture: "AGR",
    Manufacturing: "MFG",
    Retail: "RTL",
    Marketing: "MKT",
    Photography: "PHO",
    "Pet Services": "PET",
    "Home Repairs": "FIX",
    "Appliance Repairs": "APP",
    CCTV: "CCTV",
    "Fibre Internet": "NET"
  };
  $("#categoryGrid").innerHTML = state.meta.categories.map((category) => `
    <button class="category-tile" data-category="${category}">
      <span>${icons[category] || "ZA"}</span>
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
              ${subscriptionBadge(biz)}
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
            ${subscriptionBadge(business)}
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

function validateBusinessFiles() {
  const inputs = [$("#bizGallery"), $("#bizProofId"), $("#bizProofAddress")];
  const files = inputs.flatMap((input) => Array.from(input.files || []));
  const oversized = files.find((file) => file.size > MAX_BUSINESS_FILE_BYTES);
  if (oversized) {
    throw new Error(`${oversized.name} is too large. Please use files smaller than 8MB each.`);
  }
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_BUSINESS_UPLOAD_BYTES) {
    throw new Error("Business registration uploads are too large. Please keep all selected files under 20MB total.");
  }
}

async function renderAdmin() {
  if (state.user?.type !== "admin") {
    $("#adminDashboard").innerHTML = `<div class="admin-card wide"><h3>Admin access</h3><p>Sign in with an administrator account to manage users, approvals, PRIME, revenue, reports, ads, and push notifications.</p></div>`;
    return;
  }
  const data = await api("/api/admin");
  $("#adminDashboard").innerHTML = `
    <div class="admin-card"><h3>Revenue</h3><h2>${money(data.analytics.revenue)}</h2><p>${data.analytics.standardSubscribers || 0} Standard and ${data.analytics.primeSubscribers || 0} PRIME</p></div>
    <div class="admin-card"><h3>Listings</h3><h2>${data.analytics.activeListings || 0}</h2><p>${data.analytics.pendingBusinesses} businesses pending approval</p></div>
    <div class="admin-card"><h3>Users</h3><h2>${data.analytics.users}</h2><p>Customers, businesses, admins</p></div>
    <div class="admin-card"><h3>Quote requests</h3><h2>${data.analytics.quoteRequests}</h2><p>Tracked marketplace demand</p></div>
    <div class="admin-card wide">
      <h3>Business approval and subscription moderation</h3>
      <div class="admin-list">
        ${data.businesses.map((biz) => `
          <div class="admin-row">
            <strong>${biz.name}</strong>
            <small>${biz.category} • ${biz.city} • business: ${biz.status} • subscription: ${biz.subscriptionPlan || "none"} ${biz.subscriptionStatus || "inactive"} • PRIME: ${biz.primeStatus} • docs: ${biz.verificationDocuments?.proofOfId && biz.verificationDocuments?.proofOfAddress ? "submitted" : "missing"}</small>
            <div class="admin-row-actions">
              <button class="secondary-btn admin-status" data-id="${biz.id}" data-status="approved">Approve</button>
              <button class="secondary-btn admin-status" data-id="${biz.id}" data-status="suspended">Suspend</button>
              <button class="secondary-btn admin-subscription" data-id="${biz.id}" data-plan="standard" data-status="active">Approve Standard</button>
              <button class="secondary-btn admin-subscription" data-id="${biz.id}" data-plan="prime" data-status="active">Approve PRIME</button>
              <button class="secondary-btn admin-subscription" data-id="${biz.id}" data-plan="${biz.subscriptionPlan === "prime" ? "prime" : "standard"}" data-status="suspended">Suspend subscription</button>
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
  events.addEventListener("subscription", async () => {
    toast("Subscription status updated");
    await Promise.all([loadBusinesses(), loadMyBusinesses()]);
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
      if (state.user.type === "admin") {
        $("#admin").classList.remove("hidden");
        await renderAdmin();
        location.hash = "admin";
        return;
      }
      if (state.user.type !== "business") return toast("Use a business account to create a company profile.");
      await openBusinessProfileDialog();
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
    if (target.classList.contains("remove-project-photo")) {
      state.businessGalleryDraft.splice(Number(target.dataset.index), 1);
      renderProjectGalleryEditor();
    }
    if (target.classList.contains("business-tab")) {
      setBusinessTab(target.dataset.businessTab);
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
    if (target.classList.contains("admin-subscription")) {
      await api("/api/admin/subscription-status", { method: "POST", body: JSON.stringify({ businessId: target.dataset.id, plan: target.dataset.plan, status: target.dataset.status }) });
      await renderAdmin();
      await Promise.all([loadBusinesses(), loadMyBusinesses()]);
      toast("Subscription status updated");
    }
  } catch (error) {
    toast(error.message);
  }
});

$("#heroSearch").addEventListener("submit", async (event) => {
  event.preventDefault();
  syncCityFilter("heroCityFilter");
  await loadBusinesses();
  location.hash = "discover";
});

["provinceFilter", "categoryFilter", "heroCityFilter", "cityFilter", "ratingFilter", "primeFilter", "priceFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => {
    if (id === "heroCityFilter" || id === "cityFilter") syncCityFilter(id);
    loadBusinesses().catch((error) => toast(error.message));
  });
});

$("#nearbyBtn").addEventListener("click", async () => {
  $("#provinceFilter").value = state.user?.province || "Gauteng";
  $("#cityFilter").value = state.user?.city || "Johannesburg";
  syncCityFilter("cityFilter");
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
    await loadMyBusinesses();
    toast(`Signed in as ${user.name}`);
  } catch (error) {
    $("#authMessage").textContent = error.message;
  }
});

$("#registerBtn").addEventListener("click", async () => {
  try {
    const { user } = await api("/api/auth/register", {
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
    $("#authMessage").textContent = "Account created. You are signed in.";
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
  const button = $("#saveBusinessBtn");
  const isEditing = Boolean(state.editingBusinessId);
  try {
    if (!state.user) return $("#authDialog").showModal();
    button.disabled = true;
    button.textContent = isEditing ? "Updating..." : "Submitting...";
    $("#businessMessage").textContent = "Uploading business details...";
    validateBusinessFiles();
    const uploadedGallery = (await fileInputsToDataUrls($("#bizGallery"))).map((file) => file.data);
    const proofOfId = (await fileInputsToDataUrls($("#bizProofId")))[0];
    const proofOfAddress = (await fileInputsToDataUrls($("#bizProofAddress")))[0];
    if (!isEditing && (!proofOfId || !proofOfAddress)) throw new Error("Please upload proof of ID and proof of address.");
    const verificationDocuments = {};
    if (proofOfId) verificationDocuments.proofOfId = proofOfId;
    if (proofOfAddress) verificationDocuments.proofOfAddress = proofOfAddress;
    if (proofOfId || proofOfAddress) verificationDocuments.submittedAt = new Date().toISOString();
    const payload = {
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
      gallery: [...state.businessGalleryDraft, ...uploadedGallery].slice(0, 12)
    };
    if (Object.keys(verificationDocuments).length) payload.verificationDocuments = verificationDocuments;
    const { business } = await api(isEditing ? `/api/businesses/${state.editingBusinessId}` : "/api/businesses", {
      method: isEditing ? "PATCH" : "POST",
      body: JSON.stringify(payload)
    });
    $("#businessMessage").textContent = isEditing ? `${business.name} profile updated.` : `${business.name} submitted for admin approval.`;
    state.myBusinesses = [business, ...state.myBusinesses.filter((item) => item.id !== business.id)];
    populateBusinessForm(business);
    renderPrimePanel();
    await loadBusinesses();
  } catch (error) {
    $("#businessMessage").textContent = error.message;
  } finally {
    button.disabled = false;
    button.textContent = state.editingBusinessId ? "Update profile" : "Submit for approval";
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

$("#startSubscription").addEventListener("click", async () => {
  try {
    if (!state.user) return $("#authDialog").showModal();
    if (state.user.type !== "business") throw new Error("Sign in as a business to start a subscription.");
    if (!state.myBusinesses.length) await loadMyBusinesses();
    const own = state.myBusinesses.find((biz) => biz.id === $("#primeBusinessSelect").value) || state.myBusinesses[0];
    if (!own) throw new Error("Create a business profile before starting a subscription.");
    const plan = $("#subscriptionPlan").value;
    const { redirectUrl, gateway, planLabel } = await api("/api/payments/subscription", {
      method: "POST",
      body: JSON.stringify({ businessId: own.id, plan, gateway: $("#primeGateway").value, autoRenew: $("#primeRenew").checked })
    });
    toast(`${gateway} ${planLabel} checkout created. Redirecting...`);
    setTimeout(() => { location.href = redirectUrl; }, 700);
  } catch (error) {
    toast(error.message);
  }
});

$("#primeBusinessSelect").addEventListener("input", renderPrimePanel);
$("#subscriptionPlan").addEventListener("input", renderPrimePanel);
$("#bizProfileSelect").addEventListener("input", () => {
  const business = state.myBusinesses.find((item) => item.id === $("#bizProfileSelect").value) || null;
  populateBusinessForm(business);
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
