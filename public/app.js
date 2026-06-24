const state = {
  user: null,
  businesses: [],
  myBusinesses: [],
  editingBusinessId: "",
  businessLogoDraft: "",
  businessCoverDraft: "",
  businessProjectsDraft: [],
  currentBusiness: null,
  opportunities: [],
  selectedOpportunity: null,
  applicationStep: "details",
  adminData: null,
  conversations: [],
  activeConversation: null,
  activePage: "home",
  meta: { categories: [], provinces: [], cities: [], opportunityTypes: [], applicationStatuses: [] }
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

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[char]);
}

const subscriptionPlans = {
  standard: { label: "Standard", amount: 150 },
  prime: { label: "PRIME", amount: 250 }
};
const MAX_PROJECTS = 3;
const MAX_PROJECT_PHOTOS = 5;
const MAX_BUSINESS_FILE_BYTES = 8 * 1024 * 1024;
const MAX_BUSINESS_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_APPLICATION_FILE_BYTES = 10 * 1024 * 1024;
const MAX_APPLICATION_UPLOAD_BYTES = 24 * 1024 * 1024;

function subscriptionPlanLabel(plan) {
  const data = subscriptionPlans[plan] || subscriptionPlans.standard;
  return `${data.label} R${data.amount}/month`;
}

function subscriptionBadge(business) {
  if (business.primeStatus === "active") return `<span class="prime-badge">PRIME</span>`;
  if (business.subscriptionPlan === "standard" && business.subscriptionStatus === "active") return `<span class="standard-badge">STANDARD</span>`;
  return "";
}

function normalizeProjects(projects = [], fallbackGallery = []) {
  const normalized = Array.isArray(projects) ? projects.map((project, index) => ({
    name: String(project?.name || `Project ${index + 1}`).trim(),
    photos: Array.isArray(project?.photos) ? project.photos.map(String).filter(Boolean).slice(0, MAX_PROJECT_PHOTOS) : []
  })).filter((project) => project.name || project.photos.length).slice(0, MAX_PROJECTS) : [];

  if (normalized.length) return normalized.map((project, index) => ({
    name: project.name || `Project ${index + 1}`,
    photos: project.photos.slice(0, MAX_PROJECT_PHOTOS)
  }));

  const legacyPhotos = Array.isArray(fallbackGallery) ? fallbackGallery.map(String).filter(Boolean).slice(0, MAX_PROJECTS * MAX_PROJECT_PHOTOS) : [];
  const legacyProjects = [];
  for (let index = 0; index < legacyPhotos.length; index += MAX_PROJECT_PHOTOS) {
    legacyProjects.push({
      name: `Project ${legacyProjects.length + 1}`,
      photos: legacyPhotos.slice(index, index + MAX_PROJECT_PHOTOS)
    });
  }
  return legacyProjects.slice(0, MAX_PROJECTS);
}

function projectPhotos(business) {
  return normalizeProjects(business?.projects, business?.gallery).flatMap((project) => project.photos).slice(0, MAX_PROJECTS * MAX_PROJECT_PHOTOS);
}

function firstBusinessPhoto(business) {
  return business?.cover || projectPhotos(business)[0] || business?.gallery?.[0] || business?.logo || "";
}

function fillSelect(node, values, placeholder) {
  node.innerHTML = `<option value="">${placeholder}</option>` + values.map((value) => `<option value="${value}">${value}</option>`).join("");
}

function fillOptionSelect(node, values, placeholder) {
  node.innerHTML = `<option value="">${placeholder}</option>` + values.map((item) => `<option value="${item.value}">${item.label}</option>`).join("");
}

function opportunityTypeLabel(value) {
  return state.meta.opportunityTypes.find((item) => item.value === value)?.label || "Opportunity";
}

function compactDate(value) {
  if (!value) return "No closing date";
  return new Date(`${value}T12:00:00`).toLocaleDateString("en-ZA", { year: "numeric", month: "short", day: "numeric" });
}

function syncCityFilter(sourceId) {
  const heroCity = $("#heroCityFilter");
  const discoverCity = $("#cityFilter");
  if (!heroCity || !discoverCity) return;
  if (sourceId === "heroCityFilter") discoverCity.value = heroCity.value;
  if (sourceId === "cityFilter") heroCity.value = discoverCity.value;
}

function syncSearchFilter(sourceId) {
  const pairs = [
    ["searchInput", "discoverSearchInput"],
    ["provinceFilter", "discoverProvinceFilter"],
    ["categoryFilter", "discoverCategoryFilter"]
  ];
  for (const [primaryId, secondaryId] of pairs) {
    const primary = $(`#${primaryId}`);
    const secondary = $(`#${secondaryId}`);
    if (!primary || !secondary) continue;
    if (sourceId === primaryId) secondary.value = primary.value;
    if (sourceId === secondaryId) primary.value = secondary.value;
  }
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
    const gatewaySelect = $("#primeGateway");
    if (gatewaySelect) gatewaySelect.value = "Yoco";
    fillSelect($("#provinceFilter"), state.meta.provinces, "All provinces");
    fillSelect($("#heroCityFilter"), state.meta.cities, "All cities/towns");
    fillSelect($("#cityFilter"), state.meta.cities, "All South African cities/towns");
    fillSelect($("#categoryFilter"), state.meta.categories, "All categories");
    fillSelect($("#discoverProvinceFilter"), state.meta.provinces, "All provinces");
    fillSelect($("#discoverCategoryFilter"), state.meta.categories, "All categories");
    fillOptionSelect($("#opportunityTypeFilter"), state.meta.opportunityTypes, "All opportunity types");
    fillSelect($("#opportunityProvinceFilter"), state.meta.provinces, "All provinces");
    fillSelect($("#opportunityCityFilter"), state.meta.cities, "All cities/towns");
    fillSelect($("#applicantProvince"), state.meta.provinces, "Province");
    fillSelect($("#applicantCity"), state.meta.cities, "City or town");
    fillSelect($("#bizProvince"), state.meta.provinces, "Province");
    fillSelect($("#bizCity"), state.meta.cities, "City or town");
    fillSelect($("#bizCategory"), state.meta.categories, "Business category");
    renderCategories();
    await loadMe();
    await loadMyBusinesses();
    await loadOpportunities();
    await loadBusinesses();
    await loadConversations();
    await loadQuotes();
    connectEvents();
    await applyRoute();
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
  $("#openAuth").textContent = state.user ? state.user.name.split(" ")[0] : "Staff sign in";
  $("#openBusiness").disabled = false;
  $("#openBusiness").textContent = state.user?.type === "admin" ? "Applicant hub" : "Admin hub";
  const themeToggle = $("#themeToggle");
  if (themeToggle) themeToggle.textContent = "Mode";
  renderPrimePanel();
}

const routeSections = {
  home: "#home",
  opportunities: "#opportunities",
  discover: "#discover",
  plans: "#prime",
  profile: "#profileSection",
  chat: "#chat",
  admin: "#admin"
};

const legacyHashRoutes = {
  "#home": "/opportunities",
  "#opportunities": "/opportunities",
  "#discover": "/discover",
  "#prime": "/plans",
  "#chat": "/chat",
  "#admin": "/admin",
  "#profileSection": "/profile"
};

function normalizeRoutePath(pathname = location.pathname) {
  const clean = pathname.replace(/\/+$/, "") || "/";
  if (clean === "/index.html") return "/";
  return clean;
}

function routeFromLocation() {
  if (legacyHashRoutes[location.hash]) {
    history.replaceState({}, "", legacyHashRoutes[location.hash]);
  }
  const path = normalizeRoutePath();
  if (path === "/") return { page: "opportunities" };
  if (path === "/opportunities") return { page: "opportunities" };
  if (path === "/admin") return { page: "admin" };
  return { page: "opportunities" };
}

function updateNav(page) {
  $$("[data-route]").forEach((link) => link.classList.toggle("active", link.dataset.route === page));
}

function showOnlyPage(page) {
  Object.entries(routeSections).forEach(([key, selector]) => {
    const node = $(selector);
    if (node) node.classList.toggle("hidden", key !== page);
  });
  state.activePage = page;
  document.body.dataset.page = page;
  updateNav(page);
}

async function applyRoute({ scroll = false } = {}) {
  const route = routeFromLocation();
  showOnlyPage(route.page);
  if (route.page === "opportunities") await loadOpportunities();
  if (route.page === "admin") await renderAdmin();
  if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
}

async function navigateTo(path, options = {}) {
  const next = normalizeRoutePath(path);
  if (normalizeRoutePath() !== next || location.search || location.hash) {
    history.pushState({}, "", next);
  }
  await applyRoute({ scroll: options.scroll !== false });
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

async function loadOpportunities() {
  const params = new URLSearchParams({
    q: $("#opportunitySearchInput")?.value || "",
    type: $("#opportunityTypeFilter")?.value || "",
    province: $("#opportunityProvinceFilter")?.value || "",
    city: $("#opportunityCityFilter")?.value || ""
  });
  const { opportunities } = await api(`/api/opportunities?${params}`);
  state.opportunities = opportunities;
  renderOpportunities();
}

function renderOpportunities() {
  const grid = $("#opportunityGrid");
  if (!grid) return;
  grid.innerHTML = state.opportunities.map((opportunity) => {
    const place = [opportunity.city, opportunity.province].filter(Boolean).join(", ") || "National";
    const certificates = opportunity.type === "supplier" || opportunity.type === "enterprise" ? "CV or company profile accepted" : "CV required";
    return `
      <article class="opportunity-card">
        <div class="opportunity-card-head">
          <span class="status-pill">${escapeHtml(opportunity.typeLabel || opportunityTypeLabel(opportunity.type))}</span>
          <small>${escapeHtml(compactDate(opportunity.closingDate))}</small>
        </div>
        <h3>${escapeHtml(opportunity.title)}</h3>
        <p>${escapeHtml(opportunity.summary || "")}</p>
        <div class="meta-line"><span>${escapeHtml(place)}</span><span>${escapeHtml(certificates)}</span><span>${Number(opportunity.applicationCount || 0)} applicants</span></div>
        <button class="primary-btn apply-opportunity" data-id="${opportunity.id}">Apply</button>
      </article>
    `;
  }).join("") || `<div class="admin-card wide"><h3>No open opportunities</h3><p>New intakes will appear here when they are opened by the admin team.</p></div>`;
}

function setApplicationStep(step) {
  state.applicationStep = step;
  $("#applicationDetailsStep").classList.toggle("hidden", step !== "details");
  $("#applicationFilesStep").classList.toggle("hidden", step !== "files");
  $("#applicationStepOne").classList.toggle("active", step === "details");
  $("#applicationStepTwo").classList.toggle("active", step === "files");
}

function openApplicationDialog(opportunityId) {
  const opportunity = state.opportunities.find((item) => item.id === opportunityId);
  if (!opportunity) return toast("Opportunity could not be found.");
  state.selectedOpportunity = opportunity;
  $("#applicationTypeLabel").textContent = opportunity.typeLabel || opportunityTypeLabel(opportunity.type);
  $("#applicationTitle").textContent = opportunity.title;
  $("#applicationMessage").textContent = "";
  $("#applicantFirstName").value = "";
  $("#applicantSurname").value = "";
  $("#applicantEmail").value = "";
  $("#applicantPhone").value = "";
  $("#applicantProvince").value = "";
  $("#applicantCity").value = "";
  $("#applicantNotes").value = "";
  $("#applicantCv").value = "";
  $("#applicantCertificates").value = "";
  setApplicationStep("details");
  $("#applicationDialog").showModal();
}

function validateApplicationDetails() {
  if (!$("#applicantFirstName").value.trim() || !$("#applicantSurname").value.trim()) throw new Error("Name and surname are required.");
  if (!$("#applicantEmail").value.trim()) throw new Error("Email is required.");
  if (!$("#applicantPhone").value.trim()) throw new Error("Phone number is required.");
  if (!$("#applicantProvince").value) throw new Error("Province is required.");
  if (!$("#applicantCity").value) throw new Error("City is required.");
}

function validateApplicationFiles() {
  const files = [$("#applicantCv"), $("#applicantCertificates")].flatMap((input) => Array.from(input.files || []));
  if (!$("#applicantCv").files.length) throw new Error("Please upload your CV.");
  const oversized = files.find((file) => file.size > MAX_APPLICATION_FILE_BYTES);
  if (oversized) throw new Error(`${oversized.name} is too large. Please use files smaller than 10MB each.`);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  if (totalSize > MAX_APPLICATION_UPLOAD_BYTES) throw new Error("Application uploads are too large. Please keep the total below 24MB.");
}

async function submitApplication() {
  if (!state.selectedOpportunity) throw new Error("Select an opportunity first.");
  validateApplicationDetails();
  validateApplicationFiles();
  const cv = (await fileInputsToDataUrls($("#applicantCv")))[0];
  const certificates = await fileInputsToDataUrls($("#applicantCertificates"));
  const { application } = await api("/api/applications", {
    method: "POST",
    body: JSON.stringify({
      opportunityId: state.selectedOpportunity.id,
      firstName: $("#applicantFirstName").value,
      surname: $("#applicantSurname").value,
      email: $("#applicantEmail").value,
      phone: $("#applicantPhone").value,
      province: $("#applicantProvince").value,
      city: $("#applicantCity").value,
      notes: $("#applicantNotes").value,
      cv,
      certificates
    })
  });
  $("#applicationDialog").close();
  await loadOpportunities();
  toast(`${application.fullName} application submitted`);
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

function renderBusinessLogoEditor() {
  const node = $("#businessLogoEditor");
  if (!node) return;
  node.innerHTML = state.businessLogoDraft ? `
    <div class="business-logo-preview">
      <img alt="Business profile picture preview" src="${state.businessLogoDraft}">
      <button type="button" class="icon-btn remove-business-logo" title="Remove profile picture">x</button>
    </div>
  ` : `
    <div class="business-logo-placeholder">
      <span>${initials($("#bizName")?.value || "CZ")}</span>
      <strong>No profile picture yet</strong>
      <small>Upload a logo, owner portrait, shopfront, or brand image.</small>
    </div>
  `;
}

function renderBusinessCoverEditor() {
  const node = $("#businessCoverEditor");
  if (!node) return;
  node.innerHTML = state.businessCoverDraft ? `
    <div class="business-cover-preview">
      <img alt="Business banner picture preview" src="${state.businessCoverDraft}">
      <button type="button" class="icon-btn remove-business-cover" title="Remove banner picture">x</button>
    </div>
  ` : `
    <div class="business-cover-placeholder">
      <strong>No banner picture yet</strong>
      <small>Upload a wide project, storefront, team, or brand image.</small>
    </div>
  `;
}

function ensureProjectDrafts() {
  if (!state.businessProjectsDraft.length) {
    state.businessProjectsDraft = [{ name: "Project 1", photos: [] }];
  }
}

function renderProjectGalleryEditor() {
  const node = $("#projectGalleryEditor");
  if (!node) return;
  ensureProjectDrafts();
  node.innerHTML = state.businessProjectsDraft.map((project, projectIndex) => `
    <article class="project-editor">
      <div class="project-editor-head">
        <input class="project-name-input" data-project-index="${projectIndex}" value="${escapeHtml(project.name || `Project ${projectIndex + 1}`)}" placeholder="Project name">
        <button type="button" class="secondary-btn remove-project" data-project-index="${projectIndex}" ${state.businessProjectsDraft.length <= 1 ? "disabled" : ""}>Remove project</button>
      </div>
      <div class="project-photo-grid">
        ${(project.photos || []).map((item, photoIndex) => `
          <article class="project-photo-tile">
            <img alt="${escapeHtml(project.name || `Project ${projectIndex + 1}`)} photo ${photoIndex + 1}" src="${item}">
            <button type="button" class="icon-btn remove-project-photo" data-project-index="${projectIndex}" data-photo-index="${photoIndex}" title="Remove project photo">x</button>
          </article>
        `).join("") || `<p class="empty-gallery-note">No photos for this project yet.</p>`}
      </div>
      <label class="project-upload">
        <span>Add photos</span>
        <input class="project-photo-input" data-project-index="${projectIndex}" type="file" multiple accept="image/*">
      </label>
      <small class="upload-note">${(project.photos || []).length}/${MAX_PROJECT_PHOTOS} photos used</small>
    </article>
  `).join("") + `
    <button type="button" class="secondary-btn add-project" ${state.businessProjectsDraft.length >= MAX_PROJECTS ? "disabled" : ""}>Add project</button>
  `;
}

function populateBusinessForm(business = null) {
  state.editingBusinessId = business?.id || "";
  state.businessLogoDraft = business?.logo || "";
  state.businessCoverDraft = business?.cover || "";
  state.businessProjectsDraft = normalizeProjects(business?.projects, business?.gallery);
  ensureProjectDrafts();
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
  $("#bizLogo").value = "";
  $("#bizCover").value = "";
  $("#bizProofId").value = "";
  $("#bizProofAddress").value = "";
  renderBusinessProfileSelect();
  renderBusinessLogoEditor();
  renderBusinessCoverEditor();
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
      <div class="card-media" style="background-image:url('${firstBusinessPhoto(biz)}')"></div>
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
          <a class="secondary-btn view-profile" href="/profile/${encodeURIComponent(biz.id)}" data-id="${biz.id}">Profile</a>
          <a class="secondary-btn" target="_blank" rel="noopener" href="${whatsappUrl(biz.phone, biz.name)}">WhatsApp</a>
          <a class="primary-btn chat-business" href="/chat" data-id="${biz.id}">Chat</a>
        </div>
      </div>
    </article>
  `).join("") || `<p>No businesses match your filters yet.</p>`;
}

async function renderProfile(id) {
  const { business, reviews } = await api(`/api/businesses/${id}`);
  state.currentBusiness = business;
  const projects = normalizeProjects(business.projects, business.gallery);
  const galleryItems = projectPhotos(business);
  const profileLogo = business.logo
    ? `<div class="profile-logo has-image"><img alt="${escapeHtml(business.name)} profile picture" src="${business.logo}"></div>`
    : `<div class="profile-logo">${initials(business.name)}</div>`;
  const reviewHelp = !state.user
    ? "Sign in as a customer to leave a verified review."
    : state.user.type === "customer"
      ? "Reviews are verified through quote requests with this business."
      : "Only customer accounts can leave business reviews.";
  const reviewItems = reviews.map((review) => `
    <div class="quote-item">
      <strong>${"★".repeat(review.rating)}</strong>
      <p>${escapeHtml(review.text)}</p>
      ${review.response ? `<small>Business response: ${escapeHtml(review.response)}</small>` : ""}
    </div>
  `).join("") || "<p>No reviews yet.</p>";
  $("#profileSection").innerHTML = `
    <div class="profile-toolbar">
      <a class="secondary-btn" href="/discover" data-route="discover">Back to Discover</a>
    </div>
    <article class="profile-hero">
      <div class="profile-cover" style="background-image:url('${business.cover || galleryItems[0] || ""}')"></div>
      <div class="profile-content">
        <div>
          ${profileLogo}
          <div class="meta-line">
            ${subscriptionBadge(business)}
            ${business.verified ? `<span class="verified-badge">Verified business</span>` : ""}
            <span>★ ${business.rating || "New"} rating</span>
          </div>
          <h2>${business.name}</h2>
          <p>${business.description}</p>
          <div class="service-tags">${business.services.map((service) => `<span>${service}</span>`).join("")}</div>
          <section class="profile-gallery">
            <h3>Project photo gallery</h3>
            <div class="project-gallery-groups">${projects.map((project) => `
              <article class="profile-project-group">
                <h4>${escapeHtml(project.name)}</h4>
                <div class="gallery-grid">${project.photos.map((item) => `<img alt="${escapeHtml(project.name)} project photo" src="${item}">`).join("") || `<p class="empty-gallery-note">No photos uploaded for this project yet.</p>`}</div>
              </article>
            `).join("") || `<p class="empty-gallery-note">No project photos uploaded yet.</p>`}</div>
          </section>
          <section class="profile-reviews">
            <div class="review-heading">
              <div>
                <h3>Customer reviews</h3>
                <p>${business.reviewCount || 0} verified review(s)</p>
              </div>
              <span class="status-pill">${business.rating || "New"} rating</span>
            </div>
            <div class="quote-list">${reviewItems}</div>
            <form id="reviewForm" class="review-form" data-business-id="${business.id}">
              <h3>Leave a review</h3>
              <p>${reviewHelp}</p>
              <select id="reviewRating" aria-label="Review rating">
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3">3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
              <textarea id="reviewText" placeholder="Share your experience with this business" required></textarea>
              <button class="primary-btn" type="submit">Submit review</button>
              <p id="reviewMessage" class="form-message"></p>
            </form>
          </section>
        </div>
        <aside class="profile-card">
          <div class="admin-card">
            <h3>Contact</h3>
            <p>${business.address}</p>
            <p>${business.hours}</p>
            <p>${business.email}</p>
            <div class="card-actions">
              <a class="primary-btn" target="_blank" rel="noopener" href="${whatsappUrl(business.phone, business.name)}">WhatsApp</a>
              <a class="secondary-btn chat-business" href="/chat" data-id="${business.id}">Chat</a>
              <a class="secondary-btn request-quote" href="/chat" data-id="${business.id}">Quote</a>
              <a class="secondary-btn" href="tel:${business.phone}">Call Now</a>
              <a class="secondary-btn" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${business.address} ${business.city} South Africa`)}">Map</a>
              <a class="secondary-btn" target="_blank" rel="noopener" href="${business.website}">Website</a>
            </div>
          </div>
        </aside>
      </div>
    </article>
  `;
}

async function showProfile(id) {
  await renderProfile(id);
  await navigateTo(`/profile/${encodeURIComponent(id)}`);
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
  const inputs = [$("#bizLogo"), $("#bizCover"), $("#bizProofId"), $("#bizProofAddress"), ...$$(".project-photo-input")].filter(Boolean);
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

function renderPaymentEvents(events = []) {
  if (!events.length) return "<p>No Yoco payment events recorded yet.</p>";
  return events.map((event) => `
    <div class="quote-item">
      <strong>${escapeHtml(event.status || event.type || "payment")}</strong>
      <p>${escapeHtml(event.message || event.type || "Yoco event received.")}</p>
      <small>${escapeHtml(event.businessName || event.businessId || "No matched business")} • ${money(Number(event.amount || 0) / 100)} ${escapeHtml(event.currency || "ZAR")} • ${escapeHtml(event.createdAt || "")}</small>
    </div>
  `).join("");
}

async function loadYocoDiagnostics() {
  const panel = $("#yocoDiagnostics");
  if (!panel) return;
  panel.innerHTML = "<p>Checking Yoco webhook registration...</p>";
  try {
    const data = await api("/api/admin/yoco-diagnostics");
    const diagnostics = data.diagnostics || {};
    const webhooks = diagnostics.webhooks || [];
    const status = data.paymentStatus || {};
    const createAction = diagnostics.reachable && !diagnostics.connectZaWebhookRegistered
      ? `<button id="createYocoWebhook" class="primary-btn">Create Connect-ZA webhook</button>`
      : "";
    panel.innerHTML = `
      <p>Yoco API: ${diagnostics.reachable ? "reachable" : "not reachable"} • Connect-ZA webhook: ${diagnostics.connectZaWebhookRegistered ? "registered" : "not found"}</p>
      <p>Webhook secret source: ${escapeHtml(status.webhookSecretSource || "missing")}</p>
      ${diagnostics.error ? `<p>${escapeHtml(diagnostics.error)}</p>` : ""}
      ${createAction}
      <div class="quote-item yoco-secret-box">
        <strong>Save webhook secret without Render redeploy</strong>
        <textarea id="yocoWebhookSecretInput" rows="3" placeholder="Paste whsec_... from Yoco"></textarea>
        <button id="saveYocoWebhookSecret" class="secondary-btn">Save secret in Connect-ZA</button>
      </div>
      <div class="quote-list">
        ${webhooks.map((hook) => `<div class="quote-item"><strong>${escapeHtml(hook.name || hook.id)}</strong><small>${escapeHtml(hook.mode || "")} • ${escapeHtml(hook.url || "")}</small></div>`).join("") || "<p>No Yoco webhooks returned.</p>"}
      </div>
    `;
  } catch (error) {
    panel.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function createYocoWebhook() {
  const panel = $("#yocoDiagnostics");
  if (!panel) return;
  panel.innerHTML = "<p>Creating Connect-ZA webhook in Yoco...</p>";
  try {
    const data = await api("/api/admin/yoco-webhook", {
      method: "POST",
      body: JSON.stringify({ url: "https://connect-za.com/webhooks/yoco" })
    });
    const secret = data.webhook?.secret || "";
    const secretBlock = secret ? `
      <div class="quote-item yoco-secret-box">
        <strong>Webhook secret - copy this now</strong>
        <textarea readonly rows="3">${escapeHtml(secret)}</textarea>
        <small>This was also saved in Connect-ZA. Save it in Render as YOCO_WEBHOOK_SECRET later when Render redeploy works.</small>
      </div>
    ` : "";
    panel.innerHTML = `
      <p>${escapeHtml(data.message || "Yoco webhook checked.")}</p>
      ${secretBlock}
      <button id="checkYocoDiagnostics" class="secondary-btn">Check again</button>
    `;
    toast(data.created ? "Yoco webhook created" : "Yoco webhook already exists");
  } catch (error) {
    panel.innerHTML = `<p>${escapeHtml(error.message)}</p><button id="checkYocoDiagnostics" class="secondary-btn">Check again</button>`;
  }
}

async function saveYocoWebhookSecret() {
  const panel = $("#yocoDiagnostics");
  const input = $("#yocoWebhookSecretInput");
  if (!panel || !input) return;
  const secret = input.value.trim();
  if (!secret) return toast("Paste the Yoco whsec_ secret first");
  try {
    const data = await api("/api/admin/yoco-webhook-secret", {
      method: "POST",
      body: JSON.stringify({ secret })
    });
    toast(data.message || "Yoco webhook secret saved");
    await loadYocoDiagnostics();
  } catch (error) {
    toast(error.message);
  }
}

function adminFilterValue(id) {
  return $(`#${id}`)?.value || "";
}

function filteredAdminApplications() {
  const data = state.adminData || {};
  const q = adminFilterValue("adminApplicantSearch").trim().toLowerCase();
  const province = adminFilterValue("adminApplicantProvince");
  const type = adminFilterValue("adminApplicantType");
  const status = adminFilterValue("adminApplicantStatus");
  const opportunityId = adminFilterValue("adminApplicantOpportunity");
  const sort = adminFilterValue("adminApplicantSort") || "newest";
  const applications = (data.applications || [])
    .filter((application) => !q || [
      application.fullName,
      application.email,
      application.phone,
      application.city,
      application.province,
      application.opportunityTitle,
      application.opportunityTypeLabel
    ].join(" ").toLowerCase().includes(q))
    .filter((application) => !province || application.province === province)
    .filter((application) => !type || application.opportunityType === type)
    .filter((application) => !status || application.status === status)
    .filter((application) => !opportunityId || application.opportunityId === opportunityId);

  const sorters = {
    newest: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    oldest: (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    province: (a, b) => a.province.localeCompare(b.province) || a.fullName.localeCompare(b.fullName),
    opportunity: (a, b) => a.opportunityTitle.localeCompare(b.opportunityTitle) || a.fullName.localeCompare(b.fullName),
    status: (a, b) => a.status.localeCompare(b.status) || new Date(b.createdAt) - new Date(a.createdAt)
  };
  return applications.sort(sorters[sort] || sorters.newest);
}

function adminApplicationExportQuery() {
  const params = new URLSearchParams({
    q: adminFilterValue("adminApplicantSearch"),
    province: adminFilterValue("adminApplicantProvince"),
    type: adminFilterValue("adminApplicantType"),
    status: adminFilterValue("adminApplicantStatus"),
    opportunityId: adminFilterValue("adminApplicantOpportunity")
  });
  return params.toString();
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Not set";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function provinceBreakdownHtml(applications) {
  const counts = countBy(applications, "province");
  const total = applications.length || 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([province, count]) => `
    <div class="province-meter">
      <span>${escapeHtml(province)}</span>
      <strong>${count}</strong>
      <i style="--meter:${Math.max(6, Math.round((count / total) * 100))}%"></i>
    </div>
  `).join("") || `<p>No applicants match the current filters.</p>`;
}

function applicantFileLinks(application) {
  const cv = application.documents?.cv;
  const certs = application.documents?.certificates || [];
  return `
    ${cv?.downloadUrl ? `<a class="secondary-btn" href="${cv.downloadUrl}" target="_blank" rel="noreferrer">CV</a>` : ""}
    ${certs.map((file, index) => file.downloadUrl ? `<a class="secondary-btn" href="${file.downloadUrl}" target="_blank" rel="noreferrer">Cert ${index + 1}</a>` : "").join("")}
  `;
}

function applicantRowsHtml(applications) {
  return applications.map((application) => `
    <div class="admin-row applicant-row">
      <div>
        <strong>${escapeHtml(application.fullName)}</strong>
        <small>${escapeHtml(application.opportunityTypeLabel)} - ${escapeHtml(application.opportunityTitle)}</small>
      </div>
      <small>${escapeHtml(application.city)}, ${escapeHtml(application.province)} - ${escapeHtml(application.phone)} - ${escapeHtml(application.email)}</small>
      ${application.notes ? `<p>${escapeHtml(application.notes)}</p>` : ""}
      <div class="applicant-row-foot">
        <span class="status-pill">${escapeHtml(application.status)}</span>
        <span>${new Date(application.createdAt).toLocaleDateString("en-ZA")}</span>
        <div class="admin-row-actions">${applicantFileLinks(application)}</div>
      </div>
      <div class="admin-row-actions">
        <button class="secondary-btn admin-application-status" data-id="${application.id}" data-status="reviewed">Reviewed</button>
        <button class="secondary-btn admin-application-status" data-id="${application.id}" data-status="shortlisted">Shortlist</button>
        <button class="secondary-btn admin-application-status" data-id="${application.id}" data-status="contacted">Contacted</button>
        <button class="secondary-btn admin-application-status" data-id="${application.id}" data-status="declined">Decline</button>
      </div>
    </div>
  `).join("") || `<p>No applicants match the current filters.</p>`;
}

function renderAdminApplications() {
  const body = $("#applicantHubBody");
  if (!body) return;
  const applications = filteredAdminApplications();
  const query = adminApplicationExportQuery();
  const xlsxLink = $("#applicationsExportLink");
  const csvLink = $("#applicationsCsvLink");
  if (xlsxLink) xlsxLink.href = `/api/admin/applications.xlsx?${query}`;
  if (csvLink) csvLink.href = `/api/admin/applications.csv?${query}`;
  const countLabel = $("#applicantCountLabel");
  if (countLabel) countLabel.textContent = `${applications.length} applicant${applications.length === 1 ? "" : "s"}`;
  body.innerHTML = `
    <div class="province-breakdown">${provinceBreakdownHtml(applications)}</div>
    <div class="admin-list applicant-list">${applicantRowsHtml(applications)}</div>
  `;
}

function renderApplicantHub(data) {
  const statusOptions = (state.meta.applicationStatuses || []).map((status) => `<option value="${status}">${status}</option>`).join("");
  const typeOptions = (state.meta.opportunityTypes || []).map((type) => `<option value="${type.value}">${type.label}</option>`).join("");
  const opportunityOptions = (data.opportunities || []).map((opportunity) => `<option value="${opportunity.id}">${escapeHtml(opportunity.title)}</option>`).join("");
  return `
    <div class="admin-card wide applicant-hub-card">
      <div class="admin-card-head">
        <div>
          <h3>Applicant hub</h3>
          <p id="applicantCountLabel">${(data.applications || []).length} applicants</p>
        </div>
        <div class="admin-row-actions">
          <a id="applicationsExportLink" class="primary-btn" href="/api/admin/applications.xlsx" target="_blank" rel="noreferrer">Export Excel</a>
          <a id="applicationsCsvLink" class="secondary-btn" href="/api/admin/applications.csv" target="_blank" rel="noreferrer">CSV</a>
        </div>
      </div>
      <div class="applicant-filter-grid">
        <input id="adminApplicantSearch" class="admin-applicant-filter" placeholder="Search applicants">
        <select id="adminApplicantProvince" class="admin-applicant-filter" aria-label="Applicant province">
          <option value="">All provinces</option>
          ${state.meta.provinces.map((province) => `<option value="${province}">${province}</option>`).join("")}
        </select>
        <select id="adminApplicantType" class="admin-applicant-filter" aria-label="Opportunity type">
          <option value="">All types</option>
          ${typeOptions}
        </select>
        <select id="adminApplicantOpportunity" class="admin-applicant-filter" aria-label="Opportunity">
          <option value="">All opportunities</option>
          ${opportunityOptions}
        </select>
        <select id="adminApplicantStatus" class="admin-applicant-filter" aria-label="Application status">
          <option value="">All statuses</option>
          ${statusOptions}
        </select>
        <select id="adminApplicantSort" class="admin-applicant-filter" aria-label="Sort applicants">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="province">Province</option>
          <option value="opportunity">Opportunity</option>
          <option value="status">Status</option>
        </select>
      </div>
      <div id="applicantHubBody"></div>
    </div>
  `;
}

function renderOpportunityManager(data) {
  const opportunityRows = (data.opportunities || []).map((opportunity) => `
    <div class="admin-row">
      <strong>${escapeHtml(opportunity.title)}</strong>
      <small>${escapeHtml(opportunity.typeLabel)} - ${escapeHtml([opportunity.city, opportunity.province].filter(Boolean).join(", ") || "National")} - ${escapeHtml(opportunity.status)} - ${Number(opportunity.applicationCount || 0)} applicants</small>
      <div class="admin-row-actions">
        <button class="secondary-btn admin-opportunity-status" data-id="${opportunity.id}" data-status="open">Open</button>
        <button class="secondary-btn admin-opportunity-status" data-id="${opportunity.id}" data-status="closed">Close</button>
        <button class="secondary-btn admin-opportunity-status" data-id="${opportunity.id}" data-status="archived">Archive</button>
      </div>
    </div>
  `).join("") || `<p>No opportunities created yet.</p>`;
  return `
    <div class="admin-card wide">
      <h3>Opportunity listings</h3>
      <form id="opportunityForm" class="opportunity-admin-form">
        <input id="newOpportunityTitle" placeholder="Opportunity title" required>
        <select id="newOpportunityType" required>
          ${state.meta.opportunityTypes.map((type) => `<option value="${type.value}">${type.label}</option>`).join("")}
        </select>
        <select id="newOpportunityProvince">
          <option value="">National</option>
          ${state.meta.provinces.map((province) => `<option value="${province}">${province}</option>`).join("")}
        </select>
        <select id="newOpportunityCity">
          <option value="">All cities/towns</option>
          ${state.meta.cities.map((city) => `<option value="${city}">${city}</option>`).join("")}
        </select>
        <input id="newOpportunityClosingDate" type="date">
        <textarea id="newOpportunitySummary" placeholder="Short description"></textarea>
        <button class="primary-btn">Create opportunity</button>
      </form>
      <div class="admin-list">${opportunityRows}</div>
    </div>
  `;
}

async function renderAdmin() {
  if (state.user?.type !== "admin") {
    $("#adminDashboard").innerHTML = `<div class="admin-card wide"><h3>Staff access</h3><p>Sign in with an administrator account to manage applicant records, opportunity listings, document downloads, and Excel exports.</p></div>`;
    return;
  }
  const data = await api("/api/admin");
  state.adminData = data;
  const yocoStatus = data.paymentStatus || {};
  const appStats = data.applicationStats || {};
  $("#adminDashboard").innerHTML = `
    <div class="admin-card"><h3>Applications</h3><h2>${appStats.total || 0}</h2><p>${appStats.byStatus?.new || 0} new applicants</p></div>
    <div class="admin-card"><h3>Open opportunities</h3><h2>${data.analytics.opportunities || 0}</h2><p>${Object.keys(appStats.byProvince || {}).length} provinces represented</p></div>
    <div class="admin-card"><h3>Shortlisted</h3><h2>${appStats.byStatus?.shortlisted || 0}</h2><p>Ready for next-stage review</p></div>
    <div class="admin-card"><h3>Contacted</h3><h2>${appStats.byStatus?.contacted || 0}</h2><p>Applicants already contacted</p></div>
    ${renderApplicantHub(data)}
    ${renderOpportunityManager(data)}
  `;
  renderAdminApplications();
  return;
  $("#adminDashboard").innerHTML = `
    <div class="admin-card"><h3>Revenue</h3><h2>${money(data.analytics.revenue)}</h2><p>${data.analytics.standardSubscribers || 0} Standard and ${data.analytics.primeSubscribers || 0} PRIME</p></div>
    <div class="admin-card"><h3>Listings</h3><h2>${data.analytics.activeListings || 0}</h2><p>${data.analytics.pendingBusinesses} businesses pending approval</p></div>
    <div class="admin-card"><h3>Users</h3><h2>${data.analytics.users}</h2><p>Customers, businesses, admins</p></div>
    <div class="admin-card"><h3>Quote requests</h3><h2>${data.analytics.quoteRequests}</h2><p>Tracked marketplace demand</p></div>
    <div class="admin-card"><h3>Applications</h3><h2>${appStats.total || 0}</h2><p>${appStats.byStatus?.new || 0} new applicants</p></div>
    <div class="admin-card"><h3>Open opportunities</h3><h2>${data.analytics.opportunities || 0}</h2><p>${Object.keys(appStats.byProvince || {}).length} provinces represented</p></div>
    ${renderApplicantHub(data)}
    ${renderOpportunityManager(data)}
    <div class="admin-card wide">
      <h3>Yoco payment health</h3>
      <p>Checkout: ${yocoStatus.checkoutConfigured ? "configured" : "not configured"} • Mode: ${escapeHtml(yocoStatus.keyMode || "unknown")} • Webhook secret: ${yocoStatus.webhookConfigured ? "configured" : "missing"} • Currency: ${escapeHtml(yocoStatus.currency || "ZAR")}</p>
      <button id="checkYocoDiagnostics" class="secondary-btn">Check Yoco webhook</button>
      <div id="yocoDiagnostics" class="quote-list">${renderPaymentEvents(data.paymentEvents || [])}</div>
    </div>
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
  renderAdminApplications();
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
  events.addEventListener("application", async () => {
    toast("New application received");
    await loadOpportunities();
    if (state.activePage === "admin" && state.user?.type === "admin") await renderAdmin();
  });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button, a");
  if (!target) return;
  try {
    if (target.matches("a[data-route]")) {
      event.preventDefault();
      await navigateTo(target.getAttribute("href") || "/");
      return;
    }
    if (target.id === "themeToggle") {
      document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "" : "dark";
    }
    if (target.id === "openAuth") $("#authDialog").showModal();
    if (target.id === "openBusiness") {
      if (!state.user) return $("#authDialog").showModal();
      if (state.user.type === "admin") {
        await renderAdmin();
        await navigateTo("/admin");
        return;
      }
      return toast("Admin access is required for the applicant hub.");
    }
    if (target.matches("[data-category]")) {
      $("#categoryFilter").value = target.dataset.category;
      syncSearchFilter("categoryFilter");
      await loadBusinesses();
      await navigateTo("/discover");
    }
    if (target.classList.contains("apply-opportunity")) {
      openApplicationDialog(target.dataset.id);
    }
    if (target.id === "applicationNextBtn") {
      validateApplicationDetails();
      $("#applicationMessage").textContent = "";
      setApplicationStep("files");
    }
    if (target.id === "applicationBackBtn") {
      $("#applicationMessage").textContent = "";
      setApplicationStep("details");
    }
    if (target.id === "submitApplicationBtn") {
      target.disabled = true;
      target.textContent = "Submitting...";
      $("#applicationMessage").textContent = "Uploading application...";
      try {
        await submitApplication();
      } finally {
        target.disabled = false;
        target.textContent = "Submit application";
      }
    }
    if (target.classList.contains("view-profile")) {
      event.preventDefault();
      await showProfile(target.dataset.id);
    }
    if (target.classList.contains("request-quote")) {
      event.preventDefault();
      state.currentBusiness = state.businesses.find((biz) => biz.id === target.dataset.id) || state.currentBusiness;
      await navigateTo("/chat");
      $("#quoteTitle").focus();
    }
    if (target.classList.contains("chat-business")) {
      event.preventDefault();
      if (!state.user) return $("#authDialog").showModal();
      state.currentBusiness = state.businesses.find((biz) => biz.id === target.dataset.id);
      state.activeConversation = state.conversations.find((con) => con.businessId === state.currentBusiness.id) || null;
      renderConversations();
      renderChat();
      await navigateTo("/chat");
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
      const projectIndex = Number(target.dataset.projectIndex);
      const photoIndex = Number(target.dataset.photoIndex);
      state.businessProjectsDraft[projectIndex]?.photos.splice(photoIndex, 1);
      renderProjectGalleryEditor();
    }
    if (target.classList.contains("remove-project")) {
      state.businessProjectsDraft.splice(Number(target.dataset.projectIndex), 1);
      ensureProjectDrafts();
      renderProjectGalleryEditor();
    }
    if (target.classList.contains("add-project")) {
      if (state.businessProjectsDraft.length >= MAX_PROJECTS) return toast("Each business can have up to 3 projects.");
      state.businessProjectsDraft.push({ name: `Project ${state.businessProjectsDraft.length + 1}`, photos: [] });
      renderProjectGalleryEditor();
    }
    if (target.classList.contains("remove-business-logo")) {
      state.businessLogoDraft = "";
      $("#bizLogo").value = "";
      renderBusinessLogoEditor();
    }
    if (target.classList.contains("remove-business-cover")) {
      state.businessCoverDraft = "";
      $("#bizCover").value = "";
      renderBusinessCoverEditor();
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
    if (target.classList.contains("admin-application-status")) {
      await api("/api/admin/applications/status", { method: "POST", body: JSON.stringify({ applicationId: target.dataset.id, status: target.dataset.status }) });
      await renderAdmin();
      toast("Application status updated");
    }
    if (target.classList.contains("admin-opportunity-status")) {
      await api("/api/admin/opportunities/status", { method: "POST", body: JSON.stringify({ opportunityId: target.dataset.id, status: target.dataset.status }) });
      await Promise.all([renderAdmin(), loadOpportunities()]);
      toast("Opportunity status updated");
    }
    if (target.id === "checkYocoDiagnostics") {
      await loadYocoDiagnostics();
    }
    if (target.id === "createYocoWebhook") {
      await createYocoWebhook();
    }
    if (target.id === "saveYocoWebhookSecret") {
      await saveYocoWebhookSecret();
    }
  } catch (error) {
    toast(error.message);
  }
});

$("#heroSearch").addEventListener("submit", async (event) => {
  event.preventDefault();
  syncSearchFilter("searchInput");
  syncSearchFilter("provinceFilter");
  syncSearchFilter("categoryFilter");
  syncCityFilter("heroCityFilter");
  await loadBusinesses();
  await navigateTo("/discover");
});

$("#discoverSearch").addEventListener("submit", async (event) => {
  event.preventDefault();
  syncSearchFilter("discoverSearchInput");
  syncSearchFilter("discoverProvinceFilter");
  syncSearchFilter("discoverCategoryFilter");
  await loadBusinesses();
  await navigateTo("/discover");
});

$("#opportunitySearch").addEventListener("submit", async (event) => {
  event.preventDefault();
  await loadOpportunities();
  await navigateTo("/opportunities");
});

["searchInput", "discoverSearchInput", "provinceFilter", "discoverProvinceFilter", "categoryFilter", "discoverCategoryFilter", "heroCityFilter", "cityFilter", "ratingFilter", "primeFilter", "priceFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => {
    if (["searchInput", "discoverSearchInput", "provinceFilter", "discoverProvinceFilter", "categoryFilter", "discoverCategoryFilter"].includes(id)) syncSearchFilter(id);
    if (id === "heroCityFilter" || id === "cityFilter") syncCityFilter(id);
    loadBusinesses().catch((error) => toast(error.message));
  });
});

["opportunitySearchInput", "opportunityTypeFilter", "opportunityProvinceFilter", "opportunityCityFilter"].forEach((id) => {
  $(`#${id}`).addEventListener("input", () => {
    loadOpportunities().catch((error) => toast(error.message));
  });
});

document.addEventListener("input", (event) => {
  if (event.target.classList.contains("admin-applicant-filter")) {
    renderAdminApplications();
  }
});

$("#nearbyBtn").addEventListener("click", async () => {
  $("#provinceFilter").value = state.user?.province || "Gauteng";
  syncSearchFilter("provinceFilter");
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
    const uploadedLogo = (await fileInputsToDataUrls($("#bizLogo")))[0];
    const uploadedCover = (await fileInputsToDataUrls($("#bizCover")))[0];
    const proofOfId = (await fileInputsToDataUrls($("#bizProofId")))[0];
    const proofOfAddress = (await fileInputsToDataUrls($("#bizProofAddress")))[0];
    if (!isEditing && (!proofOfId || !proofOfAddress)) throw new Error("Please upload proof of ID and proof of address.");
    const verificationDocuments = {};
    if (proofOfId) verificationDocuments.proofOfId = proofOfId;
    if (proofOfAddress) verificationDocuments.proofOfAddress = proofOfAddress;
    if (proofOfId || proofOfAddress) verificationDocuments.submittedAt = new Date().toISOString();
    const projects = normalizeProjects(state.businessProjectsDraft).filter((project) => project.photos.length).map((project, index) => ({
      name: project.name || `Project ${index + 1}`,
      photos: project.photos.slice(0, MAX_PROJECT_PHOTOS)
    })).slice(0, MAX_PROJECTS);
    const gallery = projects.flatMap((project) => project.photos).slice(0, MAX_PROJECTS * MAX_PROJECT_PHOTOS);
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
      logo: uploadedLogo?.data || state.businessLogoDraft || "",
      cover: uploadedCover?.data || state.businessCoverDraft || "",
      projects,
      gallery
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
    const gateway = "Yoco";
    const { redirectUrl, gateway: checkoutGateway, planLabel } = await api("/api/payments/subscription", {
      method: "POST",
      body: JSON.stringify({ businessId: own.id, plan, gateway, autoRenew: $("#primeRenew").checked })
    });
    toast(`${checkoutGateway} ${planLabel} checkout created. Redirecting...`);
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

$("#bizName").addEventListener("input", () => {
  if (!state.businessLogoDraft) renderBusinessLogoEditor();
});

document.addEventListener("input", (event) => {
  if (event.target.classList.contains("project-name-input")) {
    const project = state.businessProjectsDraft[Number(event.target.dataset.projectIndex)];
    if (project) project.name = event.target.value;
  }
});

$("#bizLogo").addEventListener("change", async () => {
  try {
    validateBusinessFiles();
    const uploadedLogo = (await fileInputsToDataUrls($("#bizLogo")))[0];
    if (uploadedLogo?.data) state.businessLogoDraft = uploadedLogo.data;
    renderBusinessLogoEditor();
  } catch (error) {
    $("#businessMessage").textContent = error.message;
    $("#bizLogo").value = "";
  }
});

$("#bizCover").addEventListener("change", async () => {
  try {
    validateBusinessFiles();
    const uploadedCover = (await fileInputsToDataUrls($("#bizCover")))[0];
    if (uploadedCover?.data) state.businessCoverDraft = uploadedCover.data;
    renderBusinessCoverEditor();
  } catch (error) {
    $("#businessMessage").textContent = error.message;
    $("#bizCover").value = "";
  }
});

document.addEventListener("change", async (event) => {
  if (!event.target.classList.contains("project-photo-input")) return;
  const projectIndex = Number(event.target.dataset.projectIndex);
  const project = state.businessProjectsDraft[projectIndex];
  if (!project) return;
  try {
    validateBusinessFiles();
    const slotsAvailable = MAX_PROJECT_PHOTOS - project.photos.length;
    if (slotsAvailable <= 0) throw new Error("This project already has the maximum of 5 photos.");
    const selectedCount = event.target.files.length;
    const uploadedPhotos = (await fileInputsToDataUrls(event.target)).map((file) => file.data).slice(0, slotsAvailable);
    project.photos = [...project.photos, ...uploadedPhotos].slice(0, MAX_PROJECT_PHOTOS);
    event.target.value = "";
    renderProjectGalleryEditor();
    if (uploadedPhotos.length < selectedCount) toast("Only 5 photos are allowed per project.");
  } catch (error) {
    $("#businessMessage").textContent = error.message;
    event.target.value = "";
  }
});

$("#refreshAdmin").addEventListener("click", () => renderAdmin().catch((error) => toast(error.message)));

document.addEventListener("submit", async (event) => {
  if (event.target.id === "reviewForm") {
    event.preventDefault();
    const businessId = event.target.dataset.businessId;
    try {
      if (!state.user) {
        $("#authDialog").showModal();
        return;
      }
      if (state.user.type !== "customer") throw new Error("Only customer accounts can leave business reviews.");
      await api("/api/reviews", {
        method: "POST",
        body: JSON.stringify({
          businessId,
          rating: $("#reviewRating").value,
          text: $("#reviewText").value
        })
      });
      $("#reviewText").value = "";
      await Promise.all([renderProfile(businessId), loadBusinesses()]);
      toast("Review submitted");
    } catch (error) {
      $("#reviewMessage").textContent = error.message;
    }
    return;
  }

  if (event.target.id === "adForm") {
    event.preventDefault();
    await api("/api/admin/ads", {
      method: "POST",
      body: JSON.stringify({ title: $("#adTitle").value, placement: $("#adPlacement").value })
    });
    await renderAdmin();
    toast("Advertisement created");
  }

  if (event.target.id === "opportunityForm") {
    event.preventDefault();
    await api("/api/admin/opportunities", {
      method: "POST",
      body: JSON.stringify({
        title: $("#newOpportunityTitle").value,
        type: $("#newOpportunityType").value,
        province: $("#newOpportunityProvince").value,
        city: $("#newOpportunityCity").value,
        closingDate: $("#newOpportunityClosingDate").value,
        summary: $("#newOpportunitySummary").value,
        status: "open"
      })
    });
    await Promise.all([renderAdmin(), loadOpportunities()]);
    toast("Opportunity created");
  }
});

function initLinearInteractions() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const spotlightSelector = [
    ".opportunity-card",
    ".business-card",
    ".admin-card",
    ".modal-card",
    ".quote-item",
    ".admin-row",
    ".conversation-list",
    ".chat-panel",
    ".quote-panel",
    ".profile-card",
    ".hero-image-placeholder",
    ".hero-search",
    ".page-search",
    ".success-card"
  ].join(",");

  function attachSpotlights(root = document) {
    root.querySelectorAll(spotlightSelector).forEach((node) => {
      if (node.dataset.linearSpotlight === "true") return;
      node.dataset.linearSpotlight = "true";
      node.classList.add("linear-spotlight");
      node.addEventListener("pointermove", (event) => {
        const rect = node.getBoundingClientRect();
        node.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
        node.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
      });
    });
  }

  attachSpotlights();
  new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) attachSpotlights(node);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });

  if (!reduceMotion) {
    const updateHeroProgress = () => {
      const progress = Math.min(1, Math.max(0, window.scrollY / 520));
      document.documentElement.style.setProperty("--hero-progress", progress.toFixed(3));
    };
    updateHeroProgress();
    window.addEventListener("scroll", updateHeroProgress, { passive: true });
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

window.addEventListener("popstate", () => applyRoute().catch((error) => toast(error.message)));

initLinearInteractions();
boot();
