const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const url = require("url");
const { Pool } = require("pg");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile();

function cleanEnvValue(name, fallback = "") {
  const raw = process.env[name] || fallback;
  let value = String(raw || "").trim().replace(/^["']|["']$/g, "");
  const prefix = `${name}=`;
  if (value.startsWith(prefix)) value = value.slice(prefix.length).trim().replace(/^["']|["']$/g, "");
  return value;
}

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY = 35 * 1024 * 1024;
const MAX_BODY_MB = Math.floor(MAX_BODY / 1024 / 1024);
const SUPABASE_URL = cleanEnvValue("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = cleanEnvValue("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_DATABASE_URL = cleanEnvValue("SUPABASE_DATABASE_URL", process.env.DATABASE_URL || "");
const SUPABASE_STATE_TABLE = cleanEnvValue("SUPABASE_STATE_TABLE", "connect_za_state");
const SUPABASE_STATE_ID = cleanEnvValue("SUPABASE_STATE_ID", "production");
const SUPABASE_STORAGE_BUCKET = cleanEnvValue("SUPABASE_STORAGE_BUCKET", "connect-za-media");
const SUPABASE_PRIVATE_STORAGE_BUCKET = cleanEnvValue("SUPABASE_PRIVATE_STORAGE_BUCKET", "connect-za-private");
const YOCO_SECRET_KEY = cleanEnvValue("YOCO_SECRET_KEY");
const YOCO_WEBHOOK_SECRET = cleanEnvValue("YOCO_WEBHOOK_SECRET");
const YOCO_CURRENCY = cleanEnvValue("YOCO_CURRENCY", "ZAR");
const YOCO_API_BASE = "https://payments.yoco.com/api";
function configured(value, placeholders) {
  return Boolean(value && !placeholders.some((placeholder) => value.includes(placeholder)));
}

const USE_SUPABASE_POSTGRES = configured(SUPABASE_DATABASE_URL, ["[YOUR-PASSWORD]", "your-password"]);
const USE_SUPABASE_REST = !USE_SUPABASE_POSTGRES
  && configured(SUPABASE_URL, ["your-project-ref"])
  && configured(SUPABASE_SERVICE_ROLE_KEY, ["your-service-role-key"]);
const USE_SUPABASE = USE_SUPABASE_POSTGRES || USE_SUPABASE_REST;
const REQUIRE_SUPABASE_DATABASE = process.env.REQUIRE_SUPABASE_DATABASE === "true";
const ALLOW_LOCAL_DB_FALLBACK = process.env.ALLOW_LOCAL_DB_FALLBACK === "true";
const ALLOW_INLINE_UPLOAD_FALLBACK = process.env.ALLOW_INLINE_UPLOAD_FALLBACK === "true";
const pgPool = USE_SUPABASE_POSTGRES
  ? new Pool({
      connectionString: SUPABASE_DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    })
  : null;
let pgReady = false;
let databaseFallbackReason = "";
let storageBucketsReady = false;
let storageBucketsReadyPromise = null;
let storageBucketsError = "";
const SUBSCRIPTION_PLANS = {
  standard: { label: "Standard", amount: 150 },
  prime: { label: "PRIME", amount: 250 }
};
const SUBSCRIPTION_STATUSES = ["active", "pending", "inactive", "suspended"];
const MAX_PROJECTS = 3;
const MAX_PROJECT_PHOTOS = 5;

const categories = [
  "Construction",
  "Plumbing",
  "Electrical",
  "Security",
  "Automotive",
  "Beauty",
  "Cleaning",
  "Logistics",
  "IT",
  "Solar",
  "Landscaping",
  "Catering",
  "Roofing",
  "Painting",
  "Tiling",
  "Carpentry",
  "Welding",
  "HVAC",
  "Pest Control",
  "Moving",
  "Events",
  "Education",
  "Healthcare",
  "Legal Services",
  "Accounting",
  "Real Estate",
  "Agriculture",
  "Manufacturing",
  "Retail",
  "Marketing",
  "Photography",
  "Pet Services",
  "Home Repairs",
  "Appliance Repairs",
  "CCTV",
  "Fibre Internet"
];

const provinces = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "Northern Cape",
  "North West",
  "Western Cape"
];

const cities = [
  "Alice",
  "Beaufort West",
  "Bethlehem",
  "Bhisho",
  "Bloemfontein",
  "Boksburg",
  "Brakpan",
  "Cape Town",
  "Carletonville",
  "Centurion",
  "Cradock",
  "De Aar",
  "Durban",
  "East London",
  "Emalahleni",
  "Empangeni",
  "Ermelo",
  "Gqeberha",
  "George",
  "Graaff-Reinet",
  "Grahamstown",
  "Harrismith",
  "Hermanus",
  "Johannesburg",
  "Kempton Park",
  "Kimberley",
  "Klerksdorp",
  "Knysna",
  "Komatipoort",
  "Kroonstad",
  "Krugersdorp",
  "Kuruman",
  "Ladysmith",
  "Lephalale",
  "Louis Trichardt",
  "Mafikeng",
  "Margate",
  "Mbombela",
  "Middelburg",
  "Midrand",
  "Mokopane",
  "Mossel Bay",
  "Mthatha",
  "Newcastle",
  "Paarl",
  "Phalaborwa",
  "Pietermaritzburg",
  "Pinetown",
  "Plettenberg Bay",
  "Polokwane",
  "Port Shepstone",
  "Potchefstroom",
  "Pretoria",
  "Queenstown",
  "Randburg",
  "Richards Bay",
  "Rustenburg",
  "Saldanha",
  "Sandton",
  "Sasolburg",
  "Secunda",
  "Somerset West",
  "Soweto",
  "Springs",
  "Stellenbosch",
  "Thohoyandou",
  "Tzaneen",
  "Uitenhage",
  "Ulundi",
  "Upington",
  "Vanderbijlpark",
  "Vereeniging",
  "Virginia",
  "Vryburg",
  "Vryheid",
  "Welkom",
  "Worcester"
];

function canonicalFromList(value, list) {
  return list.find((item) => item.toLowerCase() === String(value || "").trim().toLowerCase()) || "";
}

function normalizeBusinessProjects(projectsInput = [], galleryInput = []) {
  const projects = Array.isArray(projectsInput) ? projectsInput.map((project, index) => ({
    name: String(project?.name || `Project ${index + 1}`).trim(),
    photos: Array.isArray(project?.photos) ? project.photos.map(String).filter(Boolean).slice(0, MAX_PROJECT_PHOTOS) : []
  })).filter((project) => project.name || project.photos.length).slice(0, MAX_PROJECTS) : [];

  if (projects.length) {
    return projects.map((project, index) => ({
      name: project.name || `Project ${index + 1}`,
      photos: project.photos.slice(0, MAX_PROJECT_PHOTOS)
    })).filter((project) => project.photos.length);
  }

  const legacyPhotos = Array.isArray(galleryInput) ? galleryInput.map(String).filter(Boolean).slice(0, MAX_PROJECTS * MAX_PROJECT_PHOTOS) : [];
  const legacyProjects = [];
  for (let index = 0; index < legacyPhotos.length; index += MAX_PROJECT_PHOTOS) {
    legacyProjects.push({
      name: `Project ${legacyProjects.length + 1}`,
      photos: legacyPhotos.slice(index, index + MAX_PROJECT_PHOTOS)
    });
  }
  return legacyProjects.slice(0, MAX_PROJECTS);
}

function flattenBusinessProjects(projects) {
  return normalizeBusinessProjects(projects).flatMap((project) => project.photos).slice(0, MAX_PROJECTS * MAX_PROJECT_PHOTOS);
}

function uid(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

function makeSession(userId) {
  return {
    id: uid("ses"),
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 14
  };
}

const demoUserEmails = new Set(["admin@connect-za.local", "customer@connect-za.local", "business@connect-za.local"]);
const demoBusinessNames = new Set([
  "Mzansi Build & Renovate",
  "Cape Circuit Pros",
  "Durban Shield Security",
  "Pretoria Cloud Clinic"
]);

function subscriptionPlanKey(value, fallback = "standard") {
  const key = String(value || "").toLowerCase();
  return SUBSCRIPTION_PLANS[key] ? key : fallback;
}

function subscriptionPlanLabel(planKey) {
  return SUBSCRIPTION_PLANS[subscriptionPlanKey(planKey)].label;
}

function subscriptionPlanAmount(planKey) {
  return SUBSCRIPTION_PLANS[subscriptionPlanKey(planKey)].amount;
}

function amountToCents(amount) {
  return Math.round(Number(amount || 0) * 100);
}

function yocoConfigured() {
  return configured(YOCO_SECRET_KEY, ["your-yoco-secret-key", "sk_test_xxx", "sk_live_xxx"])
    && /^sk_(test|live)_/.test(YOCO_SECRET_KEY);
}

function yocoWebhookConfigured() {
  return configured(YOCO_WEBHOOK_SECRET, ["your-yoco-webhook-secret", "whsec_xxx"]);
}

function publicBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0] || (req.socket.encrypted ? "https" : "http");
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0];
  return `${proto}://${host}`.replace(/\/$/, "");
}

function parseJsonBody(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch (error) {
    const invalidJson = new Error("Invalid request data.");
    invalidJson.statusCode = 400;
    throw invalidJson;
  }
}

function paymentReference() {
  return `CZ${Date.now()}${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

async function yocoRequest(method, endpoint, body, idempotencyKey = "") {
  if (!yocoConfigured()) {
    const error = new Error("Yoco is not configured correctly. In Render, set YOCO_SECRET_KEY to the Yoco secret key that starts with sk_test_ or sk_live_. Do not use the webhook secret, public key, or include YOCO_SECRET_KEY= in the value.");
    error.statusCode = 503;
    throw error;
  }
  const headers = {
    Authorization: `Bearer ${YOCO_SECRET_KEY}`,
    "Content-Type": "application/json"
  };
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
  const response = await fetch(`${YOCO_API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { message: text };
  }
  if (!response.ok) {
    let message = payload.message || payload.error || payload.detail || `Yoco ${method} ${endpoint} failed.`;
    if (response.status === 401 || response.status === 403 || /^forbidden$/i.test(String(message))) {
      message = "Yoco rejected the checkout request. Check Render YOCO_SECRET_KEY: it must be the Yoco Checkout secret key from the Yoco App, starting with sk_test_ for testing or sk_live_ for production. Do not use YOCO_WEBHOOK_SECRET or paste quotes around the key.";
    }
    const error = new Error(message);
    error.statusCode = response.status >= 400 ? response.status : 502;
    throw error;
  }
  return payload;
}

async function initializeYocoCheckout(req, user, business, plan, autoRenew) {
  const amount = subscriptionPlanAmount(plan);
  const reference = paymentReference();
  const baseUrl = publicBaseUrl(req);
  const query = `gateway=Yoco&businessId=${encodeURIComponent(business.id)}&reference=${encodeURIComponent(reference)}&plan=${encodeURIComponent(plan)}`;
  const payload = {
    amount: amountToCents(amount),
    currency: YOCO_CURRENCY,
    successUrl: `${baseUrl}/payment-success.html?${query}`,
    cancelUrl: `${baseUrl}/payment-success.html?${query}&status=cancelled`,
    failureUrl: `${baseUrl}/payment-success.html?${query}&status=failed`,
    clientReferenceId: business.id,
    externalId: reference,
    metadata: {
      businessId: business.id,
      businessName: business.name,
      plan,
      planLabel: subscriptionPlanLabel(plan),
      autoRenew: Boolean(autoRenew),
      reference,
      source: "connect-za"
    }
  };
  const data = await yocoRequest("POST", "/checkouts", payload, reference);
  if (!data.redirectUrl || !data.id) {
    const error = new Error("Yoco did not return a checkout URL.");
    error.statusCode = 502;
    throw error;
  }
  return {
    checkoutId: data.id,
    reference,
    authorizationUrl: data.redirectUrl,
    processingMode: data.processingMode || "",
    merchantId: data.merchantId || ""
  };
}

function verifyYocoWebhookSignature(rawBody, headers) {
  const webhookId = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signatureHeader = headers["webhook-signature"];
  if (!yocoWebhookConfigured() || !webhookId || !timestamp || !signatureHeader) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 180) return false;
  const secret = YOCO_WEBHOOK_SECRET.replace(/^whsec_/, "");
  const secretBytes = Buffer.from(secret, "base64");
  const signedContent = `${webhookId}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", secretBytes).update(signedContent).digest("base64");
  return String(signatureHeader).split(" ").some((signature) => {
    const [, value] = signature.split(",");
    return value && value.length === expected.length && crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });
}

function findBusinessForYocoEvent(db, event, fallbackBusinessId = "") {
  const payload = event?.payload || {};
  const metadata = payload.metadata || event?.metadata || {};
  const identifiers = new Set([
    fallbackBusinessId,
    metadata.businessId,
    payload.clientReferenceId,
    metadata.checkoutId,
    metadata.reference,
    payload.externalId,
    event.externalId
  ].filter(Boolean).map(String));
  return db.businesses.find((business) => {
    if (identifiers.has(business.id)) return true;
    return [
      business.subscription?.checkoutId,
      business.subscription?.reference,
      business.subscription?.yocoCheckoutId
    ].some((value) => value && identifiers.has(String(value)));
  });
}

function applyVerifiedYocoPayment(db, business, event) {
  const payload = event?.payload || {};
  const metadata = payload.metadata || {};
  if (!business?.subscription) {
    const error = new Error("Yoco payment could not be matched to a business subscription.");
    error.statusCode = 404;
    throw error;
  }
  const checkoutId = metadata.checkoutId || business.subscription.checkoutId || business.subscription.yocoCheckoutId || "";
  const reference = metadata.reference || business.subscription.reference || "";
  const status = String(payload.status || "").toLowerCase();
  if (event.type !== "payment.succeeded" && status !== "succeeded") {
    const error = new Error(`Yoco payment is ${payload.status || event.type || "not successful"}.`);
    error.statusCode = 400;
    throw error;
  }
  const plan = subscriptionPlanKey(business.subscription.plan || metadata.plan || business.subscriptionPlan, "standard");
  const expectedAmount = amountToCents(subscriptionPlanAmount(plan));
  if (Number(payload.amount || 0) < expectedAmount) {
    const error = new Error("Yoco payment amount is lower than the selected subscription plan.");
    error.statusCode = 400;
    throw error;
  }
  setBusinessSubscriptionStatus(business, plan, "pending");
  business.subscription.gateway = "Yoco";
  business.subscription.reference = reference || business.subscription.reference;
  business.subscription.checkoutId = checkoutId || business.subscription.checkoutId;
  business.subscription.yocoCheckoutId = checkoutId || business.subscription.yocoCheckoutId;
  business.subscription.paymentStatus = "paid_pending_admin";
  business.subscription.paidAt = payload.createdDate || event.createdDate || new Date().toISOString();
  business.subscription.yocoPaymentId = payload.id || "";
  business.subscription.yocoMode = payload.mode || "";
  business.subscription.currency = payload.currency || YOCO_CURRENCY;
  business.subscription.nextBillingDate = null;
  refreshSubscriptionAnalytics(db);
  return plan;
}

function activeListing(business) {
  return business.subscriptionStatus === "active" || business.primeStatus === "active";
}

function refreshSubscriptionAnalytics(db) {
  db.analytics ||= {};
  const businesses = db.businesses || [];
  db.analytics.standardSubscribers = businesses.filter((business) => business.subscriptionPlan === "standard" && business.subscriptionStatus === "active").length;
  db.analytics.primeSubscribers = businesses.filter((business) => business.subscriptionPlan === "prime" && business.subscriptionStatus === "active").length;
  db.analytics.subscriptionRevenue = (db.analytics.standardSubscribers * SUBSCRIPTION_PLANS.standard.amount) + (db.analytics.primeSubscribers * SUBSCRIPTION_PLANS.prime.amount);
  db.analytics.revenue = db.analytics.subscriptionRevenue;
}

function normalizeBusinessSubscriptions(db) {
  let changed = false;
  db.settings ||= {};
  if (db.settings.standardMonthlyPrice !== SUBSCRIPTION_PLANS.standard.amount) {
    db.settings.standardMonthlyPrice = SUBSCRIPTION_PLANS.standard.amount;
    changed = true;
  }
  if (db.settings.primeMonthlyPrice !== SUBSCRIPTION_PLANS.prime.amount) {
    db.settings.primeMonthlyPrice = SUBSCRIPTION_PLANS.prime.amount;
    changed = true;
  }

  for (const business of db.businesses || []) {
    if (!business.subscriptionPlan) {
      business.subscriptionPlan = ["active", "pending", "suspended"].includes(business.primeStatus) ? "prime" : "none";
      changed = true;
    }
    if (!business.subscriptionStatus) {
      business.subscriptionStatus = ["active", "pending", "suspended"].includes(business.primeStatus) ? business.primeStatus : "inactive";
      changed = true;
    }
    if (business.subscriptionPlan === "prime" && business.subscriptionStatus === "active" && business.primeStatus !== "active") {
      business.primeStatus = "active";
      changed = true;
    }
    if (business.subscriptionPlan !== "prime" && business.primeStatus !== "inactive") {
      business.primeStatus = "inactive";
      changed = true;
    }
  }

  refreshSubscriptionAnalytics(db);
  return changed;
}

function removeDemoData(db) {
  let changed = false;
  const demoUserIds = new Set((db.users || [])
    .filter((user) => demoUserEmails.has(String(user.email || "").toLowerCase()))
    .map((user) => user.id));
  const demoBusinessIds = new Set((db.businesses || [])
    .filter((business) => demoBusinessNames.has(business.name))
    .map((business) => business.id));

  const filterList = (list, predicate) => {
    const originalLength = list.length;
    const filtered = list.filter(predicate);
    if (filtered.length !== originalLength) changed = true;
    return filtered;
  };

  db.users = filterList(db.users || [], (user) => !demoUserIds.has(user.id));
  db.businesses = filterList(db.businesses || [], (business) => !demoBusinessIds.has(business.id));
  db.reviews = filterList(db.reviews || [], (review) => !demoBusinessIds.has(review.businessId) && !demoUserIds.has(review.userId));
  db.quotes = filterList(db.quotes || [], (quote) => !demoBusinessIds.has(quote.businessId) && !demoUserIds.has(quote.customerId));
  db.conversations = filterList(db.conversations || [], (conversation) => !demoBusinessIds.has(conversation.businessId) && !demoUserIds.has(conversation.customerId));
  db.sessions = filterList(db.sessions || [], (session) => !demoUserIds.has(session.userId));
  db.ads = filterList(db.ads || [], (ad) => ad.title !== "Winter solar installation deals");
  db.notifications = filterList(db.notifications || [], (notification) => !demoUserIds.has(notification.userId) && !demoBusinessNames.has(String(notification.text || "").replace(" needs approval", "")));

  db.analytics ||= {};
  refreshSubscriptionAnalytics(db);
  db.analytics.quoteRequests = (db.quotes || []).length;
  db.analytics.monthlyVisitors ||= 0;
  return changed;
}

function bootstrapUsers() {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return [];
  const email = process.env.ADMIN_EMAIL.toLowerCase();
  return [
    {
      id: uid("usr"),
      type: "admin",
      name: process.env.ADMIN_NAME || "Connect-ZA Admin",
      email,
      phone: process.env.ADMIN_PHONE || "",
      passwordHash: hashPassword(process.env.ADMIN_PASSWORD),
      phoneVerified: true,
      createdAt: new Date().toISOString(),
      savedBusinesses: []
    }
  ];
}

function ensureBootstrapAdmin(db) {
  const users = bootstrapUsers();
  if (!users.length) return false;
  db.users ||= [];
  if (db.users.some((user) => String(user.email || "").toLowerCase() === users[0].email)) return false;
  db.users.push(users[0]);
  return true;
}

function seedDb() {
  return {
    users: bootstrapUsers(),
    sessions: [],
    businesses: [],
    reviews: [],
    quotes: [],
    conversations: [],
    notifications: [],
    ads: [],
    analytics: {
      revenue: 0,
      standardSubscribers: 0,
      primeSubscribers: 0,
      subscriptionRevenue: 0,
      quoteRequests: 0,
      monthlyVisitors: 0
    },
    settings: {
      slogan: "Connecting Professionals",
      standardMonthlyPrice: 150,
      primeMonthlyPrice: 250
    }
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(seedDb(), null, 2));
}

function sqlIdentifier(name) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid Supabase state table name.");
  return `"${name}"`;
}

async function ensurePostgresStateTable() {
  if (!pgPool || pgReady) return;
  const table = sqlIdentifier(SUPABASE_STATE_TABLE);
  await pgPool.query(`
    create table if not exists public.${table} (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  pgReady = true;
}

async function supabaseRequest(method, query, body) {
  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${SUPABASE_STATE_TABLE}${query}`;
  const response = await fetch(endpoint, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = data?.message || data?.hint || text || response.statusText;
    throw new Error(`Supabase ${method} failed: ${detail}`);
  }
  return data;
}

function supabaseStorageConfigured() {
  return configured(SUPABASE_URL, ["your-project-ref"]) && configured(SUPABASE_SERVICE_ROLE_KEY, ["your-service-role-key"]);
}

async function supabaseStorageRequest(method, endpoint, body) {
  const response = await fetch(`${SUPABASE_URL.replace(/\/$/, "")}/storage/v1${endpoint}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || text || response.statusText;
    const error = new Error(`Supabase Storage ${method} ${endpoint} failed: ${detail}`);
    error.statusCode = response.status;
    throw error;
  }
  return data;
}

async function ensureSupabaseBucket(id, isPublic) {
  const payload = {
    id,
    name: id,
    public: Boolean(isPublic),
    file_size_limit: 10 * 1024 * 1024
  };
  try {
    await supabaseStorageRequest("GET", `/bucket/${encodeURIComponent(id)}`);
    await supabaseStorageRequest("PUT", `/bucket/${encodeURIComponent(id)}`, {
      public: payload.public,
      file_size_limit: payload.file_size_limit
    });
  } catch (error) {
    const bucketMissing = error.statusCode === 404 || /bucket not found|not found/i.test(error.message);
    if (!bucketMissing) throw error;
    await supabaseStorageRequest("POST", "/bucket", payload);
  }
}

async function ensureSupabaseStorageBuckets() {
  if (!supabaseStorageConfigured()) {
    storageBucketsReady = false;
    storageBucketsError = "Supabase Storage is not configured.";
    return;
  }
  if (storageBucketsReady) return;
  if (storageBucketsReadyPromise) return storageBucketsReadyPromise;
  storageBucketsReadyPromise = (async () => {
    await ensureSupabaseBucket(SUPABASE_STORAGE_BUCKET, true);
    await ensureSupabaseBucket(SUPABASE_PRIVATE_STORAGE_BUCKET, false);
    storageBucketsReady = true;
    storageBucketsError = "";
  })();
  try {
    await storageBucketsReadyPromise;
  } catch (error) {
    storageBucketsReadyPromise = null;
    storageBucketsReady = false;
    storageBucketsError = error.message;
    throw error;
  }
}

function isDataUrl(value) {
  return typeof value === "string" && /^data:[^;,]+\/?[^;,]*;base64,/i.test(value);
}

function parseDataUrl(dataUrl, fallbackName = "upload") {
  const match = String(dataUrl || "").match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) return null;
  const contentType = match[1] || "application/octet-stream";
  return {
    contentType,
    buffer: Buffer.from(match[2], "base64"),
    name: fallbackName
  };
}

function extensionForMime(contentType, fallbackName = "") {
  const fromName = String(fallbackName || "").match(/\.([A-Za-z0-9]{2,8})$/)?.[1];
  if (fromName) return fromName.toLowerCase();
  const map = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "application/pdf": "pdf",
    "video/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/webm": "webm"
  };
  return map[String(contentType || "").toLowerCase()] || "bin";
}

function cleanStorageSegment(value, fallback = "file") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function encodeStoragePath(storagePath) {
  return String(storagePath).split("/").map(encodeURIComponent).join("/");
}

async function uploadSupabaseObject({ bucket, storagePath, buffer, contentType }) {
  if (!supabaseStorageConfigured()) {
    if (ALLOW_INLINE_UPLOAD_FALLBACK) return null;
    const error = new Error("Supabase Storage is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Render before uploading files.");
    error.statusCode = 503;
    throw error;
  }
  await ensureSupabaseStorageBuckets();
  const encodedPath = encodeStoragePath(storagePath);
  const endpoint = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": "3600",
      "x-upsert": "true"
    },
    body: buffer
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  if (!response.ok) {
    const detail = data?.message || data?.error || text || response.statusText;
    const error = new Error(`Supabase Storage upload failed: ${detail}`);
    error.statusCode = response.status >= 400 ? response.status : 502;
    throw error;
  }
  return {
    bucket,
    path: storagePath,
    publicUrl: `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`
  };
}

async function uploadPublicDataAsset(value, businessId, folder, fallbackName) {
  if (!value || (typeof value === "string" && !isDataUrl(value))) return value || "";
  const file = typeof value === "object" ? value : { data: value, name: fallbackName };
  if (!isDataUrl(file.data)) return file.url || file.publicUrl || file.path || "";
  const parsed = parseDataUrl(file.data, file.name || fallbackName);
  if (!parsed) return "";
  const ext = extensionForMime(file.type || parsed.contentType, file.name);
  const storagePath = [
    "businesses",
    cleanStorageSegment(businessId, "business"),
    cleanStorageSegment(folder, "media"),
    `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`
  ].join("/");
  const uploaded = await uploadSupabaseObject({
    bucket: SUPABASE_STORAGE_BUCKET,
    storagePath,
    buffer: parsed.buffer,
    contentType: file.type || parsed.contentType
  });
  return uploaded?.publicUrl || file.data;
}

async function uploadPrivateDataAsset(value, businessId, folder, fallbackName) {
  if (!value || (typeof value === "object" && value.path && value.bucket)) return value || null;
  const file = typeof value === "object" ? value : { data: value, name: fallbackName };
  if (!isDataUrl(file.data)) return file || null;
  const parsed = parseDataUrl(file.data, file.name || fallbackName);
  if (!parsed) return null;
  const ext = extensionForMime(file.type || parsed.contentType, file.name);
  const storagePath = [
    "businesses",
    cleanStorageSegment(businessId, "business"),
    cleanStorageSegment(folder, "private"),
    `${Date.now()}-${crypto.randomBytes(5).toString("hex")}.${ext}`
  ].join("/");
  const uploaded = await uploadSupabaseObject({
    bucket: SUPABASE_PRIVATE_STORAGE_BUCKET,
    storagePath,
    buffer: parsed.buffer,
    contentType: file.type || parsed.contentType
  });
  if (!uploaded) return file;
  return {
    name: file.name || fallbackName,
    type: file.type || parsed.contentType,
    size: parsed.buffer.length,
    bucket: uploaded.bucket,
    path: uploaded.path,
    uploadedAt: new Date().toISOString()
  };
}

async function prepareBusinessUploads(input, businessId) {
  const prepared = { ...input };
  prepared.logo = await uploadPublicDataAsset(prepared.logo, businessId, "profile", "logo");
  prepared.cover = await uploadPublicDataAsset(prepared.cover, businessId, "banner", "banner");
  const projects = normalizeBusinessProjects(prepared.projects, prepared.gallery);
  prepared.projects = [];
  for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
    const project = projects[projectIndex];
    const photos = [];
    for (let photoIndex = 0; photoIndex < project.photos.length; photoIndex += 1) {
      photos.push(await uploadPublicDataAsset(project.photos[photoIndex], businessId, `projects/project-${projectIndex + 1}`, `photo-${photoIndex + 1}`));
    }
    prepared.projects.push({ name: project.name, photos: photos.filter(Boolean).slice(0, MAX_PROJECT_PHOTOS) });
  }
  prepared.gallery = flattenBusinessProjects(prepared.projects);
  if (prepared.verificationDocuments) {
    prepared.verificationDocuments = {
      ...prepared.verificationDocuments,
      proofOfId: await uploadPrivateDataAsset(prepared.verificationDocuments.proofOfId, businessId, "verification", "proof-of-id"),
      proofOfAddress: await uploadPrivateDataAsset(prepared.verificationDocuments.proofOfAddress, businessId, "verification", "proof-of-address"),
      submittedAt: prepared.verificationDocuments.submittedAt || new Date().toISOString()
    };
  }
  return prepared;
}

async function prepareQuoteFiles(files, quoteId, businessId) {
  if (!Array.isArray(files)) return [];
  const uploaded = [];
  for (let index = 0; index < files.slice(0, 6).length; index += 1) {
    const file = files[index];
    uploaded.push(await uploadPrivateDataAsset(file, businessId || quoteId, `quotes/${quoteId}`, file?.name || `quote-file-${index + 1}`));
  }
  return uploaded.filter(Boolean);
}

async function readDb() {
  if (USE_SUPABASE_POSTGRES) {
    try {
      await ensurePostgresStateTable();
      const table = sqlIdentifier(SUPABASE_STATE_TABLE);
      const result = await pgPool.query(`select data from public.${table} where id = $1 limit 1`, [SUPABASE_STATE_ID]);
      databaseFallbackReason = "";
      if (result.rows[0]?.data) {
        const db = result.rows[0].data;
        const changed = [removeDemoData(db), normalizeBusinessSubscriptions(db), ensureBootstrapAdmin(db)].some(Boolean);
        if (changed) await writeDb(db);
        return db;
      }
      const seeded = seedDb();
      await writeDb(seeded);
      return seeded;
    } catch (error) {
      databaseFallbackReason = error.message;
    }
  }
  if (USE_SUPABASE_REST) {
    try {
      const rows = await supabaseRequest("GET", `?id=eq.${encodeURIComponent(SUPABASE_STATE_ID)}&select=data`, null);
      databaseFallbackReason = "";
      if (rows?.[0]?.data) {
        const db = rows[0].data;
        const changed = [removeDemoData(db), normalizeBusinessSubscriptions(db), ensureBootstrapAdmin(db)].some(Boolean);
        if (changed) await writeDb(db);
        return db;
      }
      const seeded = seedDb();
      await writeDb(seeded);
      return seeded;
    } catch (error) {
      databaseFallbackReason = error.message;
    }
  }
  if (USE_SUPABASE && !ALLOW_LOCAL_DB_FALLBACK) {
    const error = new Error(`Database connection failed: ${databaseFallbackReason || "Supabase is not available"}. Fix the Supabase environment variables before accepting registrations.`);
    error.statusCode = 503;
    throw error;
  }
  if (REQUIRE_SUPABASE_DATABASE) {
    const error = new Error("Supabase database is required in this environment. Add SUPABASE_DATABASE_URL or Supabase REST credentials before accepting registrations.");
    error.statusCode = 503;
    throw error;
  }
  ensureDb();
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  const changed = [removeDemoData(db), normalizeBusinessSubscriptions(db), ensureBootstrapAdmin(db)].some(Boolean);
  if (changed) await writeDb(db);
  return db;
}

async function writeDb(db) {
  if (USE_SUPABASE_POSTGRES) {
    try {
      await ensurePostgresStateTable();
      const table = sqlIdentifier(SUPABASE_STATE_TABLE);
      await pgPool.query(
        `insert into public.${table} (id, data, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (id)
         do update set data = excluded.data, updated_at = excluded.updated_at`,
        [SUPABASE_STATE_ID, JSON.stringify(db)]
      );
      databaseFallbackReason = "";
      return;
    } catch (error) {
      databaseFallbackReason = error.message;
    }
  }
  if (USE_SUPABASE_REST) {
    try {
      await supabaseRequest("POST", "?on_conflict=id", {
        id: SUPABASE_STATE_ID,
        data: db,
        updated_at: new Date().toISOString()
      });
      databaseFallbackReason = "";
      return;
    } catch (error) {
      databaseFallbackReason = error.message;
    }
  }
  if (USE_SUPABASE && !ALLOW_LOCAL_DB_FALLBACK) {
    const error = new Error(`Database write failed: ${databaseFallbackReason || "Supabase is not available"}. Nothing was saved to temporary Render storage.`);
    error.statusCode = 503;
    throw error;
  }
  if (REQUIRE_SUPABASE_DATABASE) {
    const error = new Error("Supabase database is required in this environment. Nothing was saved to local storage.");
    error.statusCode = 503;
    throw error;
  }
  ensureDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function databaseProvider() {
  if (databaseFallbackReason) return "local-json";
  if (USE_SUPABASE_POSTGRES) return "supabase-postgres";
  if (USE_SUPABASE_REST) return "supabase-rest";
  return "local-json";
}

function databaseStatus() {
  return {
    configuredProvider: USE_SUPABASE_POSTGRES ? "supabase-postgres" : USE_SUPABASE_REST ? "supabase-rest" : "local-json",
    fallbackReason: databaseFallbackReason,
    supabaseRequired: REQUIRE_SUPABASE_DATABASE,
    localFallbackAllowed: ALLOW_LOCAL_DB_FALLBACK
  };
}

function storageStatus() {
  return {
    provider: supabaseStorageConfigured() ? "supabase-storage" : "not-configured",
    publicBucket: SUPABASE_STORAGE_BUCKET,
    privateBucket: SUPABASE_PRIVATE_STORAGE_BUCKET,
    bucketsReady: storageBucketsReady,
    bucketError: storageBucketsError,
    inlineFallbackAllowed: ALLOW_INLINE_UPLOAD_FALLBACK
  };
}

function paymentStatus() {
  return {
    provider: "yoco",
    checkoutConfigured: yocoConfigured(),
    keyMode: YOCO_SECRET_KEY.startsWith("sk_live_") ? "live" : YOCO_SECRET_KEY.startsWith("sk_test_") ? "test" : "invalid-or-missing",
    webhookConfigured: yocoWebhookConfigured(),
    currency: YOCO_CURRENCY
  };
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function publicBusiness(business) {
  if (!business) return null;
  const { verificationDocuments, subscription, ...safe } = business;
  return {
    ...safe,
    verificationStatus: verificationDocuments?.proofOfId && verificationDocuments?.proofOfAddress ? "submitted" : "missing"
  };
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "").split(";").filter(Boolean).map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(payload);
}

function sendJson(res, body, status = 200, headers = {}) {
  send(res, status, body, headers);
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    let tooLarge = false;
    req.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (body.length > MAX_BODY) {
        tooLarge = true;
        body = "";
        const error = new Error(`Uploaded files are too large. Please keep the total upload below ${MAX_BODY_MB}MB.`);
        error.statusCode = 413;
        reject(error);
      }
    });
    req.on("end", () => {
      if (tooLarge) return;
      resolve(body);
    });
  });
}

async function readBody(req) {
  return parseJsonBody(await readRawBody(req));
}

function requireAuth(req, res, db, type) {
  const token = parseCookies(req).cz_session || req.headers.authorization?.replace("Bearer ", "");
  const session = db.sessions.find((item) => item.id === token && item.expiresAt > Date.now());
  const user = session && db.users.find((item) => item.id === session.userId);
  if (!user || (type && user.type !== type)) {
    sendJson(res, { error: "Unauthorized" }, 401);
    return null;
  }
  return user;
}

function sanitizeBusiness(input, ownerId) {
  const services = Array.isArray(input.services) ? input.services : String(input.services || "").split(",");
  const province = canonicalFromList(input.province, provinces);
  const city = canonicalFromList(input.city, cities);
  const projects = normalizeBusinessProjects(input.projects, input.gallery);
  return {
    ownerId,
    status: "pending",
    primeStatus: "inactive",
    subscriptionPlan: "none",
    subscriptionStatus: "inactive",
    subscription: null,
    verified: false,
    name: String(input.name || "").trim(),
    category: String(input.category || "Other").trim(),
    services: services.map((item) => String(item).trim()).filter(Boolean),
    description: String(input.description || "").trim(),
    province,
    city,
    address: String(input.address || "").trim(),
    phone: String(input.phone || "").trim(),
    email: String(input.email || "").trim(),
    website: String(input.website || "").trim(),
    socials: Array.isArray(input.socials) ? input.socials : [],
    logo: String(input.logo || ""),
    cover: String(input.cover || ""),
    hours: String(input.hours || ""),
    pricingMode: String(input.pricingMode || "Request quote"),
    priceRange: String(input.priceRange || "Request quote"),
    rating: 0,
    reviewCount: 0,
    lat: Number(input.lat || 0),
    lng: Number(input.lng || 0),
    projects,
    gallery: flattenBusinessProjects(projects),
    verificationDocuments: {
      proofOfId: input.verificationDocuments?.proofOfId || null,
      proofOfAddress: input.verificationDocuments?.proofOfAddress || null,
      submittedAt: input.verificationDocuments?.submittedAt || new Date().toISOString()
    },
    createdAt: new Date().toISOString()
  };
}

function updateBusinessProfile(business, input) {
  const services = Array.isArray(input.services) ? input.services : String(input.services || business.services?.join(",") || "").split(",");
  const province = canonicalFromList(input.province || business.province, provinces);
  const city = canonicalFromList(input.city || business.city, cities);
  const category = canonicalFromList(input.category || business.category, categories) || business.category;
  business.name = String(input.name || business.name || "").trim();
  business.category = category;
  business.services = services.map((item) => String(item).trim()).filter(Boolean);
  business.description = String(input.description ?? business.description ?? "").trim();
  business.province = province;
  business.city = city;
  business.address = String(input.address ?? business.address ?? "").trim();
  business.phone = String(input.phone ?? business.phone ?? "").trim();
  business.email = String(input.email ?? business.email ?? "").trim();
  business.website = String(input.website ?? business.website ?? "").trim();
  business.hours = String(input.hours ?? business.hours ?? "").trim();
  business.pricingMode = String(input.pricingMode ?? business.pricingMode ?? "Request quote");
  business.priceRange = String(input.priceRange ?? business.priceRange ?? "Request quote");
  if (input.projects !== undefined || Array.isArray(input.gallery)) {
    business.projects = normalizeBusinessProjects(input.projects, input.gallery || business.gallery);
    business.gallery = flattenBusinessProjects(business.projects);
  }
  if (input.cover !== undefined) business.cover = String(input.cover || "");
  if (input.logo !== undefined) business.logo = String(input.logo || "");
  if (input.verificationDocuments?.proofOfId || input.verificationDocuments?.proofOfAddress) {
    business.verificationDocuments ||= {};
    if (input.verificationDocuments.proofOfId) business.verificationDocuments.proofOfId = input.verificationDocuments.proofOfId;
    if (input.verificationDocuments.proofOfAddress) business.verificationDocuments.proofOfAddress = input.verificationDocuments.proofOfAddress;
    business.verificationDocuments.submittedAt = input.verificationDocuments.submittedAt || new Date().toISOString();
  }
  business.updatedAt = new Date().toISOString();
}

const sseClients = new Set();
function broadcast(event, payload) {
  const packet = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(packet);
}

function matchesSearch(biz, query) {
  const haystack = [biz.name, biz.category, biz.city, biz.province, biz.description, ...(biz.services || [])].join(" ").toLowerCase();
  return haystack.includes(String(query || "").toLowerCase());
}

function businessScore(biz) {
  return (biz.primeStatus === "active" ? 100 : 0) + Number(biz.rating || 0) * 10 + Number(biz.reviewCount || 0) / 10;
}

function refreshPrimeAnalytics(db) {
  refreshSubscriptionAnalytics(db);
}

function setBusinessSubscriptionStatus(business, planKey, status) {
  const plan = subscriptionPlanKey(planKey, business.subscriptionPlan === "prime" ? "prime" : "standard");
  const nextStatus = SUBSCRIPTION_STATUSES.includes(status) ? status : business.subscriptionStatus || "inactive";
  business.subscriptionPlan = plan;
  business.subscriptionStatus = nextStatus;
  business.subscription ||= {};
  business.subscription.plan = plan;
  business.subscription.planLabel = subscriptionPlanLabel(plan);
  business.subscription.amount = subscriptionPlanAmount(plan);

  if (plan === "prime") {
    business.primeStatus = nextStatus;
  } else {
    business.primeStatus = "inactive";
  }

  if (nextStatus === "active") {
    business.subscription.paymentStatus = "admin_approved";
    business.subscription.approvedAt = new Date().toISOString();
    business.subscription.nextBillingDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
  }

  if (["inactive", "suspended"].includes(nextStatus)) {
    business.subscription.paymentStatus = nextStatus;
    business.subscription.nextBillingDate = null;
  }
}

async function api(req, res, pathname, query) {
  const db = await readDb();

  if (req.method === "GET" && pathname === "/api/meta") {
    if (supabaseStorageConfigured()) {
      await ensureSupabaseStorageBuckets().catch(() => {});
    }
    return sendJson(res, { categories, provinces, cities, settings: db.settings, databaseProvider: databaseProvider(), databaseStatus: databaseStatus(), storageStatus: storageStatus(), paymentStatus: paymentStatus() });
  }

  if (req.method === "POST" && pathname === "/api/auth/register") {
    const body = await readBody(req);
    if (!body.email || !body.password || !body.phone) return sendJson(res, { error: "Email, phone, and password are required." }, 400);
    if (db.users.some((u) => u.email.toLowerCase() === String(body.email).toLowerCase())) return sendJson(res, { error: "Email already registered." }, 409);
    const province = body.province ? canonicalFromList(body.province, provinces) : "";
    const city = body.city ? canonicalFromList(body.city, cities) : "";
    if (body.province && !province) return sendJson(res, { error: "Please select a valid South African province." }, 400);
    if (body.city && !city) return sendJson(res, { error: "Please select a valid South African city or town." }, 400);
    const user = {
      id: uid("usr"),
      type: ["customer", "business"].includes(body.type) ? body.type : "customer",
      name: String(body.name || "New Connect-ZA User"),
      email: String(body.email).toLowerCase(),
      phone: String(body.phone),
      passwordHash: hashPassword(String(body.password)),
      phoneVerified: true,
      createdAt: new Date().toISOString(),
      savedBusinesses: [],
      city,
      province
    };
    db.users.push(user);
    const session = makeSession(user.id);
    db.sessions.push(session);
    await writeDb(db);
    return sendJson(res, { user: publicUser(user) }, 201, { "Set-Cookie": `cz_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600` });
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    const body = await readBody(req);
    const user = db.users.find((u) => u.email.toLowerCase() === String(body.email || "").toLowerCase());
    if (!user || !verifyPassword(String(body.password || ""), user.passwordHash)) return sendJson(res, { error: "Invalid login details." }, 401);
    const session = makeSession(user.id);
    db.sessions.push(session);
    await writeDb(db);
    return sendJson(res, { user: publicUser(user) }, 200, { "Set-Cookie": `cz_session=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600` });
  }

  if (req.method === "POST" && pathname === "/api/auth/logout") {
    const token = parseCookies(req).cz_session;
    db.sessions = db.sessions.filter((session) => session.id !== token);
    await writeDb(db);
    return sendJson(res, { ok: true }, 200, { "Set-Cookie": "cz_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0" });
  }

  if (req.method === "GET" && pathname === "/api/auth/me") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    return sendJson(res, { user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/auth/password-reset") {
    const body = await readBody(req);
    const user = db.users.find((u) => u.email.toLowerCase() === String(body.email || "").toLowerCase());
    const token = user ? uid("reset") : null;
    return sendJson(res, { ok: true, resetDevToken: token, message: "If the email exists, a reset link has been queued." });
  }

  if (req.method === "GET" && pathname === "/api/businesses") {
    const result = db.businesses
      .filter((biz) => query.admin === "true" || (biz.status === "approved" && activeListing(biz)))
      .filter((biz) => !query.q || matchesSearch(biz, query.q))
      .filter((biz) => !query.category || biz.category === query.category)
      .filter((biz) => !query.province || biz.province === query.province)
      .filter((biz) => !query.city || biz.city.toLowerCase().includes(String(query.city).toLowerCase()))
      .filter((biz) => !query.prime || biz.primeStatus === "active")
      .filter((biz) => !query.rating || Number(biz.rating) >= Number(query.rating))
      .sort((a, b) => businessScore(b) - businessScore(a));
    return sendJson(res, { businesses: result.map(publicBusiness) });
  }

  if (req.method === "GET" && pathname === "/api/businesses/mine") {
    const user = requireAuth(req, res, db, "business");
    if (!user) return;
    const businesses = db.businesses
      .filter((biz) => biz.ownerId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJson(res, { businesses: businesses.map(publicBusiness) });
  }

  const businessMatch = pathname.match(/^\/api\/businesses\/([^/]+)$/);
  if (req.method === "GET" && businessMatch) {
    const business = db.businesses.find((biz) => biz.id === businessMatch[1]);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    const reviews = db.reviews.filter((review) => review.businessId === business.id);
    return sendJson(res, { business: publicBusiness(business), reviews });
  }

  if (req.method === "PATCH" && businessMatch) {
    const user = requireAuth(req, res, db, "business");
    if (!user) return;
    const business = db.businesses.find((biz) => biz.id === businessMatch[1] && biz.ownerId === user.id);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    const body = await prepareBusinessUploads(await readBody(req), business.id);
    if (!canonicalFromList(body.province || business.province, provinces)) return sendJson(res, { error: "Please select one of South Africa's nine provinces." }, 400);
    if (!canonicalFromList(body.city || business.city, cities)) return sendJson(res, { error: "Please select a South African city or town from the list." }, 400);
    updateBusinessProfile(business, body);
    db.notifications.push({ id: uid("not"), type: "business_updated", text: `${business.name} updated profile`, createdAt: new Date().toISOString(), read: false });
    await writeDb(db);
    broadcast("business", publicBusiness(business));
    return sendJson(res, { business: publicBusiness(business) });
  }

  if (req.method === "POST" && pathname === "/api/businesses") {
    const user = requireAuth(req, res, db, "business");
    if (!user) return;
    const body = await readBody(req);
    if (!canonicalFromList(body.province, provinces)) return sendJson(res, { error: "Please select one of South Africa's nine provinces." }, 400);
    if (!canonicalFromList(body.city, cities)) return sendJson(res, { error: "Please select a South African city or town from the list." }, 400);
    if (!body.verificationDocuments?.proofOfId || !body.verificationDocuments?.proofOfAddress) return sendJson(res, { error: "Proof of ID and proof of address are required." }, 400);
    const businessId = uid("biz");
    const preparedBody = await prepareBusinessUploads(body, businessId);
    const business = { id: businessId, ...sanitizeBusiness(preparedBody, user.id) };
    db.businesses.push(business);
    db.notifications.push({ id: uid("not"), type: "business_pending", text: `${business.name} needs approval`, createdAt: new Date().toISOString(), read: false });
    await writeDb(db);
    broadcast("business", publicBusiness(business));
    return sendJson(res, { business }, 201);
  }

  if (req.method === "POST" && pathname === "/api/favorites") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const body = await readBody(req);
    user.savedBusinesses ||= [];
    if (user.savedBusinesses.includes(body.businessId)) user.savedBusinesses = user.savedBusinesses.filter((id) => id !== body.businessId);
    else user.savedBusinesses.push(body.businessId);
    await writeDb(db);
    return sendJson(res, { savedBusinesses: user.savedBusinesses });
  }

  if (req.method === "POST" && pathname === "/api/quotes") {
    const user = requireAuth(req, res, db, "customer");
    if (!user) return;
    const body = await readBody(req);
    const business = db.businesses.find((biz) => biz.id === body.businessId);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    const quoteId = uid("quo");
    const quote = {
      id: quoteId,
      customerId: user.id,
      businessId: business.id,
      title: String(body.title || "Quote request"),
      details: String(body.details || ""),
      budget: String(body.budget || ""),
      files: await prepareQuoteFiles(body.files, quoteId, business.id),
      status: "sent",
      responses: [],
      createdAt: new Date().toISOString()
    };
    db.quotes.push(quote);
    db.analytics.quoteRequests += 1;
    db.notifications.push({ id: uid("not"), userId: business.ownerId, type: "quote", text: `New quote request for ${business.name}`, createdAt: new Date().toISOString(), read: false });
    await writeDb(db);
    broadcast("quote", quote);
    return sendJson(res, { quote }, 201);
  }

  if (req.method === "GET" && pathname === "/api/quotes") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const businessIds = db.businesses.filter((biz) => biz.ownerId === user.id).map((biz) => biz.id);
    const quotes = db.quotes.filter((quote) => quote.customerId === user.id || businessIds.includes(quote.businessId) || user.type === "admin");
    return sendJson(res, { quotes });
  }

  if (req.method === "POST" && pathname === "/api/messages") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const body = await readBody(req);
    const business = db.businesses.find((biz) => biz.id === body.businessId);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    let conversation = db.conversations.find((con) => con.businessId === business.id && con.customerId === (body.customerId || user.id));
    if (!conversation) {
      conversation = { id: uid("con"), businessId: business.id, customerId: user.type === "customer" ? user.id : body.customerId, messages: [], updatedAt: new Date().toISOString() };
      db.conversations.push(conversation);
    }
    const message = {
      id: uid("msg"),
      senderId: user.id,
      type: ["image", "voice", "text"].includes(body.type) ? body.type : "text",
      text: String(body.text || ""),
      attachment: String(body.attachment || ""),
      createdAt: new Date().toISOString(),
      read: false
    };
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    db.notifications.push({ id: uid("not"), type: "message", userId: user.type === "customer" ? business.ownerId : conversation.customerId, text: `New message from ${user.name}`, createdAt: message.createdAt, read: false });
    await writeDb(db);
    broadcast("message", { conversationId: conversation.id, message, businessId: business.id });
    return sendJson(res, { conversation, message }, 201);
  }

  if (req.method === "GET" && pathname === "/api/messages") {
    const user = requireAuth(req, res, db);
    if (!user) return;
    const owned = db.businesses.filter((biz) => biz.ownerId === user.id).map((biz) => biz.id);
    const conversations = db.conversations.filter((con) => con.customerId === user.id || owned.includes(con.businessId) || user.type === "admin");
    return sendJson(res, { conversations });
  }

  if (req.method === "POST" && pathname === "/api/reviews") {
    const user = requireAuth(req, res, db, "customer");
    if (!user) return;
    const body = await readBody(req);
    const business = db.businesses.find((item) => item.id === body.businessId);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    const quote = db.quotes.find((item) => item.businessId === body.businessId && item.customerId === user.id);
    if (!quote) return sendJson(res, { error: "Only verified customers can review a business after a quote request." }, 403);
    const submittedRating = Number(body.rating);
    const rating = Number.isFinite(submittedRating) ? Math.max(1, Math.min(5, submittedRating)) : 5;
    const text = String(body.text || "").trim();
    if (!text) return sendJson(res, { error: "Please write a short review before submitting." }, 400);
    let review = db.reviews.find((item) => item.businessId === body.businessId && item.userId === user.id);
    if (review) {
      review.rating = rating;
      review.text = text;
      review.verified = true;
      review.updatedAt = new Date().toISOString();
    } else {
      review = { id: uid("rev"), businessId: body.businessId, userId: user.id, rating, text, verified: true, response: "", createdAt: new Date().toISOString() };
      db.reviews.push(review);
    }
    const reviews = db.reviews.filter((item) => item.businessId === body.businessId);
    business.rating = Number((reviews.reduce((sum, item) => sum + item.rating, 0) / reviews.length).toFixed(1));
    business.reviewCount = reviews.length;
    await writeDb(db);
    return sendJson(res, { review });
  }

  if (req.method === "POST" && (pathname === "/api/payments/subscription" || pathname === "/api/payments/prime")) {
    const user = requireAuth(req, res, db, "business");
    if (!user) return;
    const body = await readBody(req);
    const business = db.businesses.find((biz) => biz.id === body.businessId && biz.ownerId === user.id);
    if (!business) return sendJson(res, { error: "Business not found." }, 404);
    const plan = pathname === "/api/payments/prime" ? "prime" : subscriptionPlanKey(body.plan, "standard");
    if (business.subscriptionPlan === plan && business.subscriptionStatus === "active") {
      return sendJson(res, { error: `${subscriptionPlanLabel(plan)} is already active for this business.` }, 400);
    }
    const gateway = "Yoco";
    const gatewayCheckout = await initializeYocoCheckout(req, user, business, plan, body.autoRenew);
    setBusinessSubscriptionStatus(business, plan, "pending");
    const checkoutId = gatewayCheckout.checkoutId || gatewayCheckout.reference || uid("pay");
    business.subscription = {
      plan,
      planLabel: subscriptionPlanLabel(plan),
      gateway,
      amount: subscriptionPlanAmount(plan),
      currency: YOCO_CURRENCY,
      autoRenew: Boolean(body.autoRenew),
      paymentStatus: "checkout_created",
      requestedAt: new Date().toISOString(),
      nextBillingDate: null,
      checkoutId,
      reference: gatewayCheckout.reference || checkoutId
    };
    business.subscription.authorizationUrl = gatewayCheckout.authorizationUrl;
    if (gatewayCheckout.processingMode) business.subscription.yocoProcessingMode = gatewayCheckout.processingMode;
    if (gatewayCheckout.merchantId) business.subscription.yocoMerchantId = gatewayCheckout.merchantId;
    business.subscription.yocoCheckoutId = gatewayCheckout.checkoutId;
    await writeDb(db);
    const redirectUrl = gatewayCheckout.authorizationUrl;
    return sendJson(res, { checkoutId: business.subscription.checkoutId, gateway, plan, planLabel: subscriptionPlanLabel(plan), amount: business.subscription.amount, redirectUrl });
  }

  if (req.method === "GET" && pathname === "/api/payments/yoco/status") {
    const businessId = String(query.businessId || "");
    const checkoutId = String(query.checkoutId || "");
    const reference = String(query.reference || "");
    const business = db.businesses.find((biz) => {
      if (businessId && biz.id !== businessId) return false;
      return [biz.subscription?.checkoutId, biz.subscription?.reference, biz.subscription?.yocoCheckoutId].some((value) => value && [checkoutId, reference].includes(String(value)));
    });
    if (!business) return sendJson(res, { error: "Yoco checkout could not be found." }, 404);
    const paid = business.subscription?.gateway === "Yoco" && business.subscription?.paymentStatus === "paid_pending_admin";
    return sendJson(res, {
      ok: true,
      paid,
      gateway: "Yoco",
      businessId: business.id,
      plan: business.subscription?.plan || business.subscriptionPlan,
      status: business.subscriptionStatus,
      paymentStatus: business.subscription?.paymentStatus || "unknown"
    });
  }

  if (req.method === "POST" && (pathname === "/api/payments/webhook" || pathname === "/webhooks/yoco")) {
    if (req.headers["webhook-signature"]) {
      const rawBody = await readRawBody(req);
      if (!verifyYocoWebhookSignature(rawBody, req.headers)) {
        return sendJson(res, { error: "Invalid Yoco signature." }, 401);
      }
      const event = parseJsonBody(rawBody);
      if (event.type === "payment.succeeded" || event.payload?.status === "succeeded") {
        const business = findBusinessForYocoEvent(db, event, event.payload?.metadata?.businessId);
        if (business) {
          applyVerifiedYocoPayment(db, business, event);
          await writeDb(db);
          broadcast("subscription", publicBusiness(business));
        }
      }
      return sendJson(res, { received: true });
    }
    return sendJson(res, { error: "Yoco payments are confirmed by signed Yoco webhooks only." }, 401);
  }

  if (req.method === "GET" && pathname === "/api/admin") {
    const user = requireAuth(req, res, db, "admin");
    if (!user) return;
    return sendJson(res, {
      users: db.users.map(publicUser),
      businesses: db.businesses,
      quotes: db.quotes,
      notifications: db.notifications,
      ads: db.ads,
      analytics: {
        ...db.analytics,
        activeBusinesses: db.businesses.filter((biz) => biz.status === "approved").length,
        activeListings: db.businesses.filter((biz) => biz.status === "approved" && activeListing(biz)).length,
        pendingBusinesses: db.businesses.filter((biz) => biz.status === "pending").length,
        users: db.users.length
      }
    });
  }

  if (req.method === "POST" && pathname.startsWith("/api/admin/")) {
    const user = requireAuth(req, res, db, "admin");
    if (!user) return;
    const body = await readBody(req);
    if (pathname === "/api/admin/business-status") {
      const business = db.businesses.find((biz) => biz.id === body.businessId);
      if (!business) return sendJson(res, { error: "Business not found." }, 404);
      business.status = ["approved", "pending", "suspended"].includes(body.status) ? body.status : business.status;
      await writeDb(db);
      return sendJson(res, { business });
    }
    if (pathname === "/api/admin/subscription-status" || pathname === "/api/admin/prime-status") {
      const business = db.businesses.find((biz) => biz.id === body.businessId);
      if (!business) return sendJson(res, { error: "Business not found." }, 404);
      const plan = pathname === "/api/admin/prime-status" ? "prime" : subscriptionPlanKey(body.plan || business.subscriptionPlan, "standard");
      setBusinessSubscriptionStatus(business, plan, body.status);
      refreshSubscriptionAnalytics(db);
      await writeDb(db);
      return sendJson(res, { business });
    }
    if (pathname === "/api/admin/ads") {
      const ad = { id: uid("ad"), title: String(body.title || "Sponsored listing"), placement: String(body.placement || "homepage"), active: true, clicks: 0, impressions: 0 };
      db.ads.push(ad);
      await writeDb(db);
      return sendJson(res, { ad });
    }
  }

  if (req.method === "GET" && pathname === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    res.write("event: ready\ndata: {\"ok\":true}\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
    return;
  }

  sendJson(res, { error: "Not found" }, 404);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json"
  }[ext] || "application/octet-stream";
}

function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) filePath = path.join(PUBLIC_DIR, "index.html");
  fs.readFile(filePath, (error, data) => {
    if (error) return send(res, 404, "Not found");
    const isHtml = path.extname(filePath).toLowerCase() === ".html";
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": isHtml ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = url.parse(req.url, true);
    const apiRoute = parsed.pathname.startsWith("/api/") || parsed.pathname === "/webhooks/yoco";
    if (parsed.pathname === "/health") return sendJson(res, { ok: true, service: "connect-za", databaseProvider: databaseProvider() });
    if (apiRoute && Number(req.headers["content-length"] || 0) > MAX_BODY) {
      return sendJson(res, { error: `Uploaded files are too large. Please keep the total upload below ${MAX_BODY_MB}MB.` }, 413);
    }
    if (apiRoute) return await api(req, res, parsed.pathname, parsed.query);
    return serveStatic(req, res, decodeURIComponent(parsed.pathname));
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(res, { error: error.message || "Server error" }, status);
  }
});

if (!USE_SUPABASE) ensureDb();
server.listen(PORT, () => {
  console.log(`Connect-ZA running at http://localhost:${PORT} using ${databaseProvider()}`);
});
