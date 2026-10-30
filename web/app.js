(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "").slice(0, 20);
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOST = "host:claude_browser";

/* ---------------- Dates ---------------- */
const pad = n => String(n).padStart(2, "0");
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOf(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const wd = (x.getDay() + 6) % 7; x.setDate(x.getDate() - wd); return x; }
function parseIso(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
const fmtShort = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

/* ---------------- Ingredient parsing ---------------- */
const FRAC = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅓": "1/3", "⅔": "2/3", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⅕": "1/5" };
const UNITS = {
  tsp: ["tsp", "tsps", "teaspoon", "teaspoons", "tspn"], tbsp: ["tbsp", "tbsps", "tbs", "tbl", "tblsp", "tablespoon", "tablespoons"],
  cup: ["cup", "cups"], floz: ["fl oz", "fl. oz", "fluid ounce", "fluid ounces"], ml: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"],
  l: ["l", "liter", "liters", "litre", "litres", "ltr"], pint: ["pint", "pints", "pt"], quart: ["quart", "quarts", "qt"],
  g: ["g", "gram", "grams", "gr", "grms"], kg: ["kg", "kgs", "kilogram", "kilograms", "kilo", "kilos"],
  oz: ["oz", "ounce", "ounces"], lb: ["lb", "lbs", "pound", "pounds"],
  clove: ["clove", "cloves"], can: ["can", "cans", "tin", "tins"], pinch: ["pinch", "pinches"], dash: ["dash", "dashes"],
  slice: ["slice", "slices"], bunch: ["bunch", "bunches"], sprig: ["sprig", "sprigs"], stick: ["stick", "sticks"],
  package: ["package", "packages", "pkg", "packet", "packets", "pack", "packs"], jar: ["jar", "jars"], head: ["head", "heads"],
  handful: ["handful", "handfuls"], bottle: ["bottle", "bottles"], bag: ["bag", "bags"], box: ["box", "boxes"], stalk: ["stalk", "stalks"], fillet: ["fillet", "fillets"]
};
const VOL = { tsp: 4.929, tbsp: 14.787, cup: 236.59, floz: 29.574, ml: 1, l: 1000, pint: 473.18, quart: 946.35 };
const MASS = { g: 1, kg: 1000, oz: 28.35, lb: 453.59 };
const ALIAS = {};
Object.entries(UNITS).forEach(([u, a]) => a.forEach(x => ALIAS[x] = u));
const unitRe = new RegExp("^(" + Object.keys(ALIAS).sort((a, b) => b.length - a.length).map(a => a.replace(/[.]/g, "\\.").replace(/ /g, "\\s+")).join("|") + ")\\.?(?=[\\s,)]|$)", "i");
const numPat = "(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)";
const qtyRe = new RegExp("^" + numPat + "(?:\\s*(?:-|–|to)\\s*" + numPat + ")?");
function num(s) { s = s.trim(); if (s.includes(" ")) { const [w, f] = s.split(/\s+/); return Number(w) + num(f); } if (s.includes("/")) { const [a, b] = s.split("/").map(Number); return b ? a / b : 0; } return Number(s); }

function parseIngredient(raw) {
  let s = String(raw || "").trim();
  Object.entries(FRAC).forEach(([k, v]) => { s = s.split(k).join(" " + v); });
  s = s.replace(/^[\s•\-*–·]+/, "").replace(/\s+/g, " ").trim();
  s = s.replace(/^(\d+)\s+(\d+\/\d+)/, "$1 $2");
  let qty = null, unit = null, note = "";
  const m = s.match(qtyRe);
  if (m) { qty = num(m[2] || m[1]); s = s.slice(m[0].length).trim(); }
  if (s.startsWith("(")) { const end = s.indexOf(")"); if (end > 0) { note = s.slice(1, end); s = s.slice(end + 1).trim(); } }
  const u = s.match(unitRe);
  if (u && (qty !== null || /^(pinch|dash|handful|bunch)/i.test(u[1]))) { unit = ALIAS[u[1].toLowerCase().replace(/\s+/g, " ")] || null; s = s.slice(u[0].length).trim(); if (qty === null) qty = 1; }
  s = s.replace(/^of\s+/i, "").trim();
  return { raw: String(raw || "").trim(), qty, unit, name: s || String(raw || "").trim(), note };
}

const DROP = new Set("fresh freshly chopped diced minced sliced thinly thickly finely roughly coarsely grated shredded peeled seeded cored crushed large small medium extra virgin organic boneless skinless halved quartered cubed packed softened melted divided optional ripe trimmed rinsed drained cooked uncooked dry dried whole raw lean plus more about approx approximately good quality to taste for serving garnish".split(" "));
const SYN = { "scallion": "green onion", "spring onion": "green onion", "chilli": "chili", "chile": "chili", "chilli flake": "red pepper flake", "red chilli flake": "red pepper flake", "red chili flake": "red pepper flake", "crushed red pepper": "red pepper flake", "garlic clove": "garlic", "clove garlic": "garlic", "egg yolk": "egg yolk", "all purpose flour": "flour", "plain flour": "flour", "caster sugar": "sugar", "granulated sugar": "sugar", "white sugar": "sugar", "kosher salt": "salt", "sea salt": "salt", "black pepper": "pepper", "ground black pepper": "pepper", "olive oil": "olive oil", "chopped tomato": "canned tomato", "tinned tomato": "canned tomato", "coriander leaf": "cilantro", "parmigiano reggiano": "parmesan", "parmesan cheese": "parmesan" };
function singular(w) {
  if (w.length <= 3 || /ss$|us$|is$/.test(w)) return w;
  if (/(tomato|potato|mango|avocado)es$/.test(w)) return w.slice(0, -2);
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (/oes$/.test(w)) return w.slice(0, -1);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}
function cleanName(name) {
  return String(name).replace(/\([^)]*\)/g, " ").split(",")[0].replace(/\b(to taste|for serving|for garnish|or more|as needed)\b.*$/i, "").replace(/\s+/g, " ").trim();
}
function nameKey(name) {
  let s = cleanName(name).toLowerCase().replace(/[^a-z\s-]/g, " ").replace(/-/g, " ");
  let words = s.split(/\s+/).filter(w => w && !DROP.has(w) && w !== "and" && w !== "or");
  if (!words.length) words = s.split(/\s+/).filter(Boolean);
  if (words.length) words[words.length - 1] = singular(words[words.length - 1]);
  let k = words.join(" ");
  if (SYN[k]) k = SYN[k];
  return k || s.trim();
}
const AISLES = [
  ["Produce", /\b(onion|garlic|shallot|tomato|potato|carrot|celery|lettuce|spinach|kale|arugula|cabbage|pepper(?! flake)|bell|chili|jalape|zucchini|squash|cucumber|broccoli|cauliflower|mushroom|lemon|lime|orange|apple|banana|berr|grape|avocado|cilantro|parsley|basil|mint|thyme|rosemary|dill|ginger|scallion|green onion|leek|corn|pea|bean sprout|eggplant|aubergine|herb|fruit|mango|pear|peach|radish|beet|sweet potato|asparagus|green bean|chive|lemongrass|bok choy|salad)\b/],
  ["Meat & seafood", /\b(chicken|beef|pork|lamb|turkey|bacon|sausage|ham|steak|mince|ground (beef|pork|turkey|chicken)|shrimp|prawn|salmon|tuna|cod|fish|crab|mussel|clam|scallop|anchov|chorizo|prosciutto|pancetta|veal|duck|thigh|breast|fillet)\b/],
  ["Dairy & eggs", /\b(milk|cream|butter|cheese|cheddar|mozzarella|parmesan|feta|ricotta|yogurt|yoghurt|egg|sour cream|creme|crème|ghee|half and half|buttermilk|mascarpone|gruyere|goat cheese)\b/],
  ["Bakery", /\b(bread|bun|roll|tortilla|pita|naan|baguette|croissant|bagel|brioche|wrap|flatbread|sourdough)\b/],
  ["Spices & seasonings", /\b(salt|pepper|cumin|paprika|oregano|cinnamon|nutmeg|turmeric|curry powder|garam|chili powder|cayenne|clove|bay leaf|seasoning|spice|coriander|cardamom|allspice|flake|vanilla|saffron|fennel seed|mustard seed|sesame seed|five spice)\b/],
  ["Pantry", /\b(flour|sugar|rice|pasta|spaghetti|penne|noodle|oil|vinegar|soy sauce|sauce|stock|broth|bean|lentil|chickpea|oat|honey|syrup|maple|baking|yeast|cornstarch|cocoa|chocolate|nut|almond|walnut|peanut|cashew|pecan|raisin|canned|paste|ketchup|mustard|mayo|mayonnaise|sriracha|tahini|coconut milk|breadcrumb|panko|quinoa|couscous|cracker|wine|jam|stock cube|bouillon|worcestershire|fish sauce|hoisin|miso|olive|caper)\b/],
  ["Frozen", /\b(frozen|ice cream)\b/]
];
function aisleFor(key) { if (/^(salt|pepper|salt pepper|pepper salt|peppercorn)$/.test(key)) return "Spices & seasonings"; if (/^canned /.test(key)) return "Pantry"; for (const [a, re] of AISLES) if (re.test(key)) return a; return "Other"; }
const AISLE_ORDER = ["Produce", "Meat & seafood", "Dairy & eggs", "Bakery", "Pantry", "Spices & seasonings", "Frozen", "Other", "Added by you"];

function fmtNum(n) {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n + 1e-9), frac = n - whole;
  const opts = [[0, ""], [0.125, "1/8"], [0.25, "1/4"], [1 / 3, "1/3"], [0.5, "1/2"], [2 / 3, "2/3"], [0.75, "3/4"], [1, ""]];
  let best = opts[0];
  for (const o of opts) if (Math.abs(frac - o[0]) < Math.abs(frac - best[0])) best = o;
  const w = best[0] === 1 ? whole + 1 : whole;
  if (!best[1]) return String(w || (n > 0 ? "1/8" : "0"));
  return w ? `${w} ${best[1]}` : best[1];
}
function plural(u, n) {
  if (["g", "kg", "ml", "l", "oz", "lb", "tsp", "tbsp", "floz"].includes(u) || n <= 1) return u === "floz" ? "fl oz" : u;
  if (/(ch|sh|x)$/.test(u)) return u + "es";
  return u + "s";
}
function fmtVol(ml, metric) {
  if (metric) return ml < 1000 ? `${Math.round(ml / 5) * 5 || Math.round(ml)} ml` : `${(ml / 1000).toFixed(ml % 1000 ? 1 : 0)} l`;
  const tsp = ml / 4.929;
  if (tsp < 3) return `${fmtNum(tsp)} tsp`;
  if (tsp < 11.9) return `${fmtNum(tsp / 3)} tbsp`;
  const c = ml / 236.59; return `${fmtNum(c)} ${c > 1 ? "cups" : "cup"}`;
}
function fmtMass(g, metric) {
  if (metric) return g < 1000 ? `${Math.round(g)} g` : `${(g / 1000).toFixed(1).replace(/\.0$/, "")} kg`;
  const oz = g / 28.35; return oz < 15.95 ? `${fmtNum(oz)} oz` : `${fmtNum(oz / 16)} lb`;
}
function fmtQty(qty, unit) {
  if (qty == null) return "";
  return unit ? `${fmtNum(qty)} ${plural(unit, qty)}` : fmtNum(qty);
}

/* ---------------- State ---------------- */
const state = {
  recipes: new Map(), recipesLoaded: false,
  weekOf: isoDate(mondayOf(new Date())),
  plan: { slots: [] }, planLoaded: false,
  shop: { status: {}, extras: [] },
  shopFilter: "need",
  lib: { q: "", sort: "rating", min: 0, tag: "" },
  disc: { results: [], loading: false },
};
let unsubPlan = null, unsubShop = null;

/* ---------------- Storage ----------------
   A backend keeps docs by path ("recipes/<id>", "plans/<week>", "shopping/<week>") and image blobs by id:
   ready(), getAll(col) -> [[path, doc]], get(path), set(path, doc), del(path), putImage(blob) -> id, getImage(id), delImage(id).
   localBackend uses this browser's IndexedDB and is always the working copy; Google Drive sync (below) merges it with
   the copy in Drive. For that, every write also stamps "meta" (path -> {ts, deleted?}), so deletes survive as tombstones. */
function idbReq(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function txDone(t) { return new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); }); }
const localBackend = {
  label: "this browser", db: null,
  async ready() {
    if (this.db) return;
    const open = indexedDB.open("larder", 2);
    open.onupgradeneeded = () => { for (const s of ["docs", "images", "meta", "kv"]) if (!open.result.objectStoreNames.contains(s)) open.result.createObjectStore(s); };
    this.db = await idbReq(open);
  },
  os(name, mode = "readonly") { return this.db.transaction(name, mode).objectStore(name); },
  async getAll(col) {
    const os = this.os("docs"), range = IDBKeyRange.bound(col + "/", col + "/￿");
    const [keys, vals] = await Promise.all([idbReq(os.getAllKeys(range)), idbReq(os.getAll(range))]);
    return keys.map((k, i) => [k, vals[i]]);
  },
  async get(path) { return (await idbReq(this.os("docs").get(path))) ?? null; },
  async set(path, doc) { await this.write(path, doc, { ts: Date.now() }); sync.changed(); },
  async del(path) { await this.write(path, null, { ts: Date.now(), deleted: true }); sync.changed(); },
  async write(path, doc, meta) {
    const t = this.db.transaction(["docs", "meta"], "readwrite");
    if (doc) t.objectStore("docs").put(doc, path); else t.objectStore("docs").delete(path);
    t.objectStore("meta").put(meta, path);
    await txDone(t);
  },
  async putImage(blob, id = uid()) { await idbReq(this.os("images", "readwrite").put(blob, id)); return id; },
  async getImage(id) { return (await idbReq(this.os("images").get(id))) || null; },
  async delImage(id) { await idbReq(this.os("images", "readwrite").delete(id)); },
  // For sync: every doc as {ts, deleted?, data?}. Docs saved before meta existed count as their updatedAt.
  async snapshot() {
    const t = this.db.transaction(["docs", "meta"]), d = t.objectStore("docs"), m = t.objectStore("meta");
    const [dk, dv, mk, mv] = await Promise.all([idbReq(d.getAllKeys()), idbReq(d.getAll()), idbReq(m.getAllKeys()), idbReq(m.getAll())]);
    const out = {};
    mk.forEach((k, i) => { out[k] = mv[i].deleted ? { ts: mv[i].ts, deleted: true } : { ts: mv[i].ts }; });
    dk.forEach((k, i) => { out[k] = { ts: (out[k] && out[k].ts) || dv[i].updatedAt || 1, data: dv[i] }; });
    return out;
  },
  // Applies a doc from Drive unless this device changed it more recently (e.g. while the sync was running).
  async applyRemote(path, e) {
    const t = this.db.transaction(["docs", "meta"], "readwrite"), m = t.objectStore("meta");
    const cur = await idbReq(m.get(path));
    if (cur && cur.ts > e.ts) return false;
    if (e.deleted) t.objectStore("docs").delete(path); else t.objectStore("docs").put(e.data, path);
    m.put(e.deleted ? { ts: e.ts, deleted: true } : { ts: e.ts }, path);
    await txDone(t);
    return true;
  },
  async kvGet(k) { return (await idbReq(this.os("kv").get(k))) ?? null; },
  async kvSet(k, v) { await idbReq(this.os("kv", "readwrite").put(v, k)); },
};
const memoryBackend = {
  label: "memory only", docs: new Map(), imgs: new Map(),
  async ready() {},
  async getAll(col) { return [...this.docs].filter(([k]) => k.startsWith(col + "/")); },
  async get(path) { return this.docs.get(path) ?? null; },
  async set(path, doc) { this.docs.set(path, doc); },
  async del(path) { this.docs.delete(path); },
  async putImage(blob) { const id = uid(); this.imgs.set(id, blob); return id; },
  async getImage(id) { return this.imgs.get(id) || null; },
  async delImage(id) { this.imgs.delete(id); },
};
let backend = localBackend;

const watchers = new Set();
function loadWatch(w) {
  if (w.doc) return backend.get(w.doc).then(d => watchers.has(w) && w.cb(d)).catch(e => { console.warn(e); w.cb(null); });
  return backend.getAll(w.col).then(rows => watchers.has(w) && w.cb(rows.map(([k, v]) => ({ id: k.slice(w.col.length + 1), ...v }))))
    .catch(e => { console.warn(e); showStoreBanner("Couldn't load your saved recipes: " + (e.message || e)); w.cb([]); });
}
const store = {
  set(path, data) { return backend.set(path, data); },
  del(path) { return backend.del(path); },
  watchDoc(path, cb) { const w = { doc: path, cb }; watchers.add(w); loadWatch(w); return () => watchers.delete(w); },
  watchCol(col, cb) { const w = { col, cb }; watchers.add(w); loadWatch(w); return () => watchers.delete(w); },
  refresh() { watchers.forEach(loadWatch); },
};

/* Image blobs are shown through object URLs, loaded once per id. */
const imgUrls = new Map();
let imgRenderQueued = false;
function loadImages() {
  for (const r of state.recipes.values()) for (const id of r.imageIds || []) {
    if (imgUrls.has(id)) continue;
    imgUrls.set(id, "");
    backend.getImage(id).then(b => b || (backend === localBackend ? fetchDriveImage(id) : null)).then(b => {
      if (!b) { imgUrls.delete(id); return; }
      imgUrls.set(id, URL.createObjectURL(b));
      if (!imgRenderQueued) { imgRenderQueued = true; setTimeout(() => { imgRenderQueued = false; renderAll(); }, 30); }
    }).catch(() => {});
  }
}

/* ---------------- Google Drive sync ----------------
   IndexedDB stays the working copy, so the app works offline; Drive holds a merged copy for the other devices.
   The "Forkast" folder in Drive (drive.file scope: the app sees only files it made) holds one file per photo and
   forkast-data.json = {format: "forkast-sync", version: 1, docs: {path: {ts, deleted?, data?}}, images: {imageId: {fileId, ts}}}.
   A sync downloads that file, keeps the newer side of every doc, uploads photos Drive lacks and writes the merge back.
   The merge is a union, so two devices syncing at once can't lose edits: whatever one overwrote in Drive is still local
   on the other and goes back up on its next sync. */
const GOOGLE_CLIENT_ID = ""; // OAuth web client from Google Cloud; public by design, not a secret
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE = "https://www.googleapis.com/drive/v3/files", UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const TOMBSTONE_DAYS = 90;
const sync = {
  status: "off", // off | idle | syncing | offline | reconnect | error
  email: "", lastSync: 0, error: "", images: {},
  token: "", tokenExp: 0, timer: null, running: null, again: false, imgTried: new Set(),
  changed() { scheduleSync(); },
};
const driveOn = () => !!GOOGLE_CLIENT_ID && backend === localBackend;
const hasToken = () => !!sync.token && Date.now() < sync.tokenExp - 60000;
function saveToken() { try { localStorage.setItem("forkast-drive-token", JSON.stringify({ t: sync.token, e: sync.tokenExp })); } catch {} }
function loadToken() { try { const j = JSON.parse(localStorage.getItem("forkast-drive-token")); if (j) { sync.token = j.t || ""; sync.tokenExp = j.e || 0; } } catch {} }

let gisLoading = null;
function loadGis() {
  return gisLoading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client"; s.async = true;
    s.onload = () => res(); s.onerror = () => { gisLoading = null; rej(new Error("Couldn't load Google sign-in. Check your connection.")); };
    document.head.appendChild(s);
  });
}
// Must run inside a click handler: Google opens its sign-in window from here.
function requestToken() {
  return new Promise((res, rej) => {
    google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: DRIVE_FILE_SCOPE + " openid email", login_hint: sync.email || undefined,
      callback: r => r.error ? rej(new Error(r.error_description || r.error)) : res(r),
      error_callback: e => rej(new Error(e && e.type === "popup_closed" ? "The Google sign-in window was closed." : e && e.type === "popup_failed_to_open" ? "Allow pop-ups for this site, then try again." : "Google sign-in failed.")),
    }).requestAccessToken({ prompt: sync.email ? "" : "consent" });
  });
}
async function connectDrive() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) { loadGis().catch(() => {}); toast("Google sign-in is still loading. Try again in a moment."); return; }
  try {
    const r = await requestToken();
    if (!google.accounts.oauth2.hasGrantedAllScopes(r, DRIVE_FILE_SCOPE)) throw new Error("Forkast needs permission to keep its files in your Google Drive. Tick that box when Google asks.");
    sync.token = r.access_token; sync.tokenExp = Date.now() + (Number(r.expires_in) || 3600) * 1000; saveToken();
    if (!sync.email) {
      const u = await (await gfetch("https://www.googleapis.com/oauth2/v3/userinfo")).json();
      sync.email = u.email || "your Google account";
      await localBackend.kvSet("drive", { ...((await localBackend.kvGet("drive")) || {}), email: sync.email });
    }
    await syncNow();
    if (sync.status === "idle") toast("Synced with Google Drive");
  } catch (e) { toast(e.message || "Couldn't connect to Google Drive"); }
  drawDriveBox();
}
async function disconnectDrive() {
  try { if (sync.token && window.google) google.accounts.oauth2.revoke(sync.token, () => {}); } catch {}
  Object.assign(sync, { email: "", token: "", tokenExp: 0, lastSync: 0, images: {}, error: "" });
  saveToken(); await localBackend.kvSet("drive", null);
  setSyncStatus("off"); drawDriveBox(); toast("Disconnected. Your data stays on this device and in Drive.");
}

async function gfetch(url, opts = {}) {
  if (!hasToken()) throw Object.assign(new Error("Google sign-in expired"), { code: "reconnect" });
  const res = await fetch(url, { ...opts, headers: { Authorization: "Bearer " + sync.token, ...(opts.headers || {}) } });
  if (res.status === 401) { sync.token = ""; saveToken(); throw Object.assign(new Error("Google sign-in expired"), { code: "reconnect" }); }
  if (!res.ok) {
    let msg = String(res.status); try { msg = (await res.json()).error.message || msg; } catch {}
    throw Object.assign(new Error("Google Drive: " + msg), { status: res.status });
  }
  return res;
}
async function driveFind(name, parent, folder) {
  const q = [`name = '${name}'`, "trashed = false", parent && `'${parent}' in parents`, folder && "mimeType = 'application/vnd.google-apps.folder'"].filter(Boolean).join(" and ");
  const j = await (await gfetch(`${DRIVE}?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)&pageSize=1`)).json();
  return j.files && j.files[0] ? j.files[0].id : null;
}
async function driveCreate(meta, body) {
  if (body == null) return (await (await gfetch(`${DRIVE}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(meta) })).json()).id;
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify(meta)], { type: "application/json" }));
  fd.append("file", body instanceof Blob ? body : new Blob([body], { type: meta.mimeType || "application/json" }));
  return (await (await gfetch(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", body: fd })).json()).id;
}
async function driveDelete(id) { try { await gfetch(`${DRIVE}/${id}`, { method: "DELETE" }); } catch (e) { if (e.status !== 404) throw e; } }

async function runSync() {
  const st = (await localBackend.kvGet("drive")) || { email: sync.email };
  if (!st.folderId) st.folderId = (await driveFind("Forkast", null, true)) || (await driveCreate({ name: "Forkast", mimeType: "application/vnd.google-apps.folder" }));
  if (!st.fileId) st.fileId = await driveFind("forkast-data.json", st.folderId);
  let remote = { docs: {}, images: {} }, raw = "";
  if (st.fileId) {
    try { raw = await (await gfetch(`${DRIVE}/${st.fileId}?alt=media`)).text(); const j = JSON.parse(raw); if (j && j.format === "forkast-sync") remote = { docs: j.docs || {}, images: j.images || {} }; }
    catch (e) {
      if (e.status !== 404) { if (e instanceof SyntaxError) raw = ""; else throw e; }
      // The file or folder was deleted in Drive: forget both and start a fresh copy there.
      else if (!st.retried) { await localBackend.kvSet("drive", { email: st.email, retried: true }); return runSync(); }
    }
  }
  delete st.retried;
  // Merge: newer timestamp wins per doc; old tombstones are dropped.
  const local = await localBackend.snapshot(), merged = {}, cutoff = Date.now() - TOMBSTONE_DAYS * 864e5;
  let pulled = 0;
  for (const path of new Set([...Object.keys(local), ...Object.keys(remote.docs)])) {
    const l = local[path], r = remote.docs[path];
    const win = r && (!l || r.ts > l.ts) ? r : l;
    if (win === r && (!l || !!l.deleted !== !!r.deleted || JSON.stringify(l.data) !== JSON.stringify(r.data))) { if (await localBackend.applyRemote(path, r)) pulled++; }
    if (!(win.deleted && win.ts < cutoff)) merged[path] = win;
  }
  // Photos: upload the ones Drive lacks; remove ones no recipe has used for a day.
  const images = { ...remote.images }, used = new Set();
  for (const e of Object.values(merged)) if (!e.deleted && e.data && Array.isArray(e.data.imageIds)) e.data.imageIds.forEach(id => used.add(id));
  for (const id of used) {
    if (images[id]) continue;
    const blob = await localBackend.getImage(id); if (!blob) continue;
    images[id] = { fileId: await driveCreate({ name: id + ".jpg", parents: [st.folderId], mimeType: blob.type || "image/jpeg" }, blob), ts: Date.now() };
  }
  for (const [id, im] of Object.entries(images)) if (!used.has(id) && Date.now() - (im.ts || 0) > 864e5) { await driveDelete(im.fileId); delete images[id]; }
  const out = JSON.stringify({ format: "forkast-sync", version: 1, docs: merged, images });
  if (out !== raw) {
    if (st.fileId) await gfetch(`${UPLOAD}/${st.fileId}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: out });
    else st.fileId = await driveCreate({ name: "forkast-data.json", parents: [st.folderId], mimeType: "application/json" }, out);
  }
  st.lastSync = Date.now(); st.images = images;
  await localBackend.kvSet("drive", st);
  Object.assign(sync, { lastSync: st.lastSync, images, error: "" });
  sync.imgTried.clear();
  if (pulled) store.refresh();
}
async function fetchDriveImage(id) {
  const im = sync.images[id];
  if (!im || !hasToken() || sync.imgTried.has(id)) return null;
  sync.imgTried.add(id);
  try { const b = await (await gfetch(`${DRIVE}/${im.fileId}?alt=media`)).blob(); await localBackend.putImage(b, id); return b; }
  catch (e) { console.warn(e); return null; }
}
function scheduleSync(delay = 2500) { if (!sync.email || !driveOn()) return; clearTimeout(sync.timer); sync.timer = setTimeout(syncNow, delay); }
function syncNow() {
  if (!sync.email || !driveOn()) return Promise.resolve();
  if (sync.running) { sync.again = true; return sync.running; }
  if (navigator.onLine === false) { setSyncStatus("offline"); return Promise.resolve(); }
  if (!hasToken()) { setSyncStatus("reconnect"); return Promise.resolve(); }
  setSyncStatus("syncing");
  sync.running = runSync().then(() => setSyncStatus("idle")).catch(e => {
    console.warn(e);
    if (e.code === "reconnect") setSyncStatus("reconnect"); else { sync.error = e.message || String(e); setSyncStatus("error"); }
  }).finally(() => { sync.running = null; if (sync.again) { sync.again = false; scheduleSync(300); } });
  return sync.running;
}
function agoText(t) {
  if (!t) return "never"; const s = (Date.now() - t) / 1000;
  return s < 60 ? "just now" : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : new Date(t).toLocaleDateString();
}
const SYNC_LABEL = { idle: "Synced", syncing: "Syncing…", offline: "Offline", reconnect: "Reconnect Drive", error: "Sync problem" };
function setSyncStatus(s) {
  sync.status = s;
  const b = $("#syncBtn");
  b.hidden = s === "off";
  b.dataset.state = s;
  b.textContent = SYNC_LABEL[s] || "";
  b.title = s === "idle" ? `Synced with Google Drive ${agoText(sync.lastSync)}` : s === "error" ? sync.error : s === "reconnect" ? "Sign in to Google again to keep syncing" : "";
  drawDriveBox();
}
function drawDriveBox() {
  const box = $("#driveBox"); if (!box) return;
  if (!GOOGLE_CLIENT_ID) { box.innerHTML = `<span class="hint">Google Drive sync isn't set up in this copy of Forkast yet.</span>`; return; }
  if (backend !== localBackend) { box.innerHTML = `<span class="hint">This browser can't save data, so sync is off.</span>`; return; }
  if (!sync.email) {
    box.innerHTML = `<div><button class="btn primary" type="button" id="driveConnect">Connect Google Drive</button></div>
      <span class="hint">Keeps your recipes, plans and shopping lists in a Forkast folder in your Google Drive, so every device you sign in on shares them. Forkast can only see the files it creates.</span>`;
    return;
  }
  const s = sync.status;
  box.innerHTML = `<div>Connected to <b>${esc(sync.email)}</b>. ${s === "syncing" ? "Syncing now…" : s === "error" ? `<span class="status err" style="display:inline">Last sync failed: ${esc(sync.error)}</span>` : s === "reconnect" ? "Google sign-in has expired." : s === "offline" ? "You're offline; changes sync when you reconnect." : `Last synced ${agoText(sync.lastSync)}.`}</div>
    <div class="row">${s === "reconnect" ? `<button class="btn primary" type="button" id="driveConnect">Reconnect</button>` : `<button class="btn" type="button" id="driveSync" ${s === "syncing" ? "disabled" : ""}>Sync now</button>`}<button class="btn ghost danger" type="button" id="driveOff">Disconnect</button></div>`;
}
async function startSync() {
  if (!driveOn()) return;
  loadToken();
  const st = await localBackend.kvGet("drive");
  if (st && st.email) Object.assign(sync, { email: st.email, lastSync: st.lastSync || 0, images: st.images || {} });
  loadGis().catch(() => {});
  if (sync.email) syncNow();
  setInterval(() => { if (document.visibilityState === "visible") scheduleSync(0); }, 5 * 60 * 1000);
  window.addEventListener("online", () => scheduleSync(0));
}

function showStoreBanner(msg) { const b = $("#storeBanner"); b.textContent = msg; b.hidden = false; }

/* ---------------- Toast & helpers ---------------- */
let toastT;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2600); }
function hueOf(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
function initials(t) { return String(t || "?").split(/\s+/).filter(w => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("") || "?"; }
function allImgs(r) { const a = (r.imageIds || []).map(id => imgUrls.get(id)).filter(Boolean); if (!a.length && (r.thumbData || r.thumbUrl)) a.push(r.thumbData || r.thumbUrl); return a; }
function imgSrc(r) { return allImgs(r)[0] || null; }
function domainOf(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function starsHtml(val, id, cls = "") {
  if (cls.includes("ro")) { let o = `<span class="stars ro" aria-label="${val || 0} of 5 stars">`; for (let i = 1; i <= 5; i++) o += `<span class="${i <= (val || 0) ? "on" : ""}">★</span>`; return o + "</span>"; }
  let h = `<span class="stars ${cls}" role="group" aria-label="Rating">`;
  for (let i = 1; i <= 5; i++) h += `<button type="button" class="${i <= (val || 0) ? "on" : ""}" data-rate="${i}" data-id="${esc(id || "")}" aria-label="${i} star${i > 1 ? "s" : ""}">★</button>`;
  return h + "</span>";
}
function thumbHtml(r, cls = "thumb") {
  const src = imgSrc(r);
  return `<button type="button" class="${cls}" style="--h:${hueOf(r.title)}" data-open="${esc(r.id)}" aria-label="Open ${esc(r.title)}">${src ? `<img src="${esc(src)}" alt="" loading="lazy">` : `<span class="ini">${esc(initials(r.title))}</span>`}</button>`;
}
function recipeIngredients(r) { return (r.ingredients || []).map(x => typeof x === "string" ? parseIngredient(x) : x); }

/* ---------------- Recipes data ops ---------------- */
async function saveRecipe(r) {
  r.updatedAt = Date.now();
  if (!r.createdAt) r.createdAt = Date.now();
  state.recipes.set(r.id, r); renderAll();
  try { await store.set("recipes/" + r.id, stripId(r)); } catch (e) { toast("Couldn't save: " + (e.message || e.code)); }
}
function stripId(r) { const { id, ...rest } = r; return JSON.parse(JSON.stringify(rest)); }
async function rateRecipe(id, n) {
  const r = state.recipes.get(id); if (!r) return;
  r.rating = r.rating === n ? 0 : n;
  await saveRecipe(r);
}
async function deleteRecipe(id) {
  const r = state.recipes.get(id);
  state.recipes.delete(id);
  if (state.plan.slots.some(s => s.recipeId === id)) { state.plan.slots = state.plan.slots.filter(s => s.recipeId !== id); savePlan(); }
  renderAll();
  try { await store.del("recipes/" + id); } catch (e) { toast("Couldn't delete: " + (e.message || e.code)); }
  if (r && r.imageIds) for (const a of r.imageIds) { backend.delImage(a).catch(() => {}); if (imgUrls.get(a)) URL.revokeObjectURL(imgUrls.get(a)); imgUrls.delete(a); }
}

/* ---------------- Plan & shopping ops ---------------- */
let planTimer, shopTimer, planDirty = false, shopDirty = false;
function savePlan() {
  clearTimeout(planTimer); planDirty = true;
  const wk = state.weekOf, data = JSON.parse(JSON.stringify({ weekOf: wk, slots: state.plan.slots }));
  planTimer = setTimeout(() => store.set("plans/" + wk, data).catch(e => toast("Couldn't save plan: " + (e.message || e.code))).finally(() => { planDirty = false; }), 350);
}
function saveShop() {
  clearTimeout(shopTimer); shopDirty = true;
  const wk = state.weekOf, data = JSON.parse(JSON.stringify({ weekOf: wk, status: state.shop.status, extras: state.shop.extras }));
  shopTimer = setTimeout(() => store.set("shopping/" + wk, data).catch(e => toast("Couldn't save list: " + (e.message || e.code))).finally(() => { shopDirty = false; }), 350);
}
function addToPlan(recipeId, day) {
  const r = state.recipes.get(recipeId); if (!r) return;
  state.plan.slots.push({ id: uid(), recipeId, day, servings: r.servings || 4 });
  savePlan();
  r.timesPlanned = (r.timesPlanned || 0) + 1; r.lastPlanned = state.weekOf; saveRecipe(r);
  renderAll();
  toast(`Added ${r.title} to ${DAYS[day]}`);
}
function watchWeek() {
  unsubPlan && unsubPlan(); unsubShop && unsubShop();
  state.planLoaded = false; state.plan = { slots: [] }; state.shop = { status: {}, extras: [] };
  const wk = state.weekOf;
  unsubPlan = store.watchDoc("plans/" + wk, d => { if (wk !== state.weekOf || planDirty) return; state.plan = { slots: (d && d.slots) || [] }; state.planLoaded = true; renderAll(); });
  unsubShop = store.watchDoc("shopping/" + wk, d => { if (wk !== state.weekOf || shopDirty) return; state.shop = { status: (d && d.status) || {}, extras: (d && d.extras) || [] }; renderAll(); });
  renderAll();
}

function buildShopping() {
  const map = new Map();
  for (const slot of state.plan.slots) {
    const r = state.recipes.get(slot.recipeId); if (!r) continue;
    const factor = r.servings ? (slot.servings || r.servings) / r.servings : 1;
    for (const ing of recipeIngredients(r)) {
      let key = nameKey(ing.name); if (!key) continue; if (["can", "jar"].includes(ing.unit) && !/^canned /.test(key)) key = "canned " + key;
      let e = map.get(key);
      if (!e) { e = { key, name: cleanName(ing.name).toLowerCase() || key, vol: 0, volMetric: true, mass: 0, massMetric: true, units: {}, none: false, sources: new Set(), aisle: aisleFor(key) }; map.set(key, e); }
      e.sources.add(r.title);
      if (ing.qty == null) { e.none = true; continue; }
      const q = ing.qty * factor;
      if (ing.unit && VOL[ing.unit]) { e.vol += q * VOL[ing.unit]; if (!["ml", "l"].includes(ing.unit)) e.volMetric = false; }
      else if (ing.unit && MASS[ing.unit]) { e.mass += q * MASS[ing.unit]; if (!["g", "kg"].includes(ing.unit)) e.massMetric = false; }
      else { const u = ing.unit || ""; e.units[u] = (e.units[u] || 0) + q; }
    }
  }
  const items = [...map.values()].map(e => {
    const parts = [];
    if (e.mass) parts.push(fmtMass(e.mass, e.massMetric));
    if (e.vol) parts.push(fmtVol(e.vol, e.volMetric));
    for (const [u, q] of Object.entries(e.units)) parts.push(u ? `${fmtNum(q)} ${plural(u, q)}` : fmtNum(Math.ceil(q * 4) / 4));
    return { key: e.key, name: e.name, qty: parts.join(" + "), sources: [...e.sources], aisle: e.aisle, manual: false };
  });
  for (const x of state.shop.extras) items.push({ key: "x_" + x.id, id: x.id, name: x.name, qty: x.qty || "", sources: [], aisle: "Added by you", manual: true });
  for (const it of items) it.status = state.shop.status[it.key] || "need";
  return items;
}

/* ---------------- Rendering ---------------- */
function currentView() { const h = location.hash.replace("#", ""); return ["plan", "shopping", "recipes", "discover"].includes(h) ? h : "plan"; }
function renderAll() {
  loadImages();
  const v = currentView();
  $$("nav.tabs a").forEach(a => a.setAttribute("aria-current", a.dataset.view === v ? "page" : "false"));
  ["plan", "shopping", "recipes", "discover"].forEach(x => $("#view-" + x).hidden = x !== v);
  const items = buildShopping();
  const need = items.filter(i => i.status === "need").length;
  $("#tabShopCount").textContent = need ? need : "";
  if (v === "plan") renderPlan(items);
  if (v === "shopping") renderShop(items);
  if (v === "recipes") renderLib();
  if (v === "discover") renderDisc();
}

function renderPlan(items) {
  const start = parseIso(state.weekOf), end = addDays(start, 6);
  const isThis = state.weekOf === isoDate(mondayOf(new Date()));
  $("#weekTitle").textContent = isThis ? "This week" : (start < new Date() ? "Past week" : "Upcoming week");
  $("#weekLbl").textContent = `${fmtShort(start)} – ${fmtShort(end)}`;
  $("#thisWeek").hidden = isThis;
  const todayIso = isoDate(new Date());
  let h = "";
  for (let d = 0; d < 7; d++) {
    const date = addDays(start, d);
    const slots = state.plan.slots.filter(s => s.day === d);
    h += `<div class="day ${isoDate(date) === todayIso ? "today" : ""}"><div class="day-h"><b>${DAYS[d]}</b><span>${fmtShort(date)}</span></div>`;
    for (const s of slots) {
      const r = state.recipes.get(s.recipeId);
      const title = r ? r.title : "Recipe removed";
      h += `<div class="meal"><div class="t" data-open="${esc(s.recipeId)}">${esc(title)}</div>
        <div class="ctl"><button class="icon-btn" data-serv="${s.id}" data-delta="-1" aria-label="Fewer servings">−</button><span class="mono">${s.servings || "–"}</span><button class="icon-btn" data-serv="${s.id}" data-delta="1" aria-label="More servings">+</button><span>servings</span>
        <button class="icon-btn sp" data-unslot="${s.id}" aria-label="Remove ${esc(title)} from ${DAYS[d]}">×</button></div></div>`;
    }
    h += `<button class="add-meal" type="button" data-addday="${d}">+ Add meal</button></div>`;
  }
  $("#week").innerHTML = h;
  const need = items.filter(i => i.status === "need").length, have = items.filter(i => i.status === "have").length;
  $("#planSummary").innerHTML = `
    <div><div class="k">Meals planned</div><div class="v mono">${state.plan.slots.length}</div></div>
    <div><div class="k">To buy</div><div class="v mono">${need}</div></div>
    <div><div class="k">Already have</div><div class="v mono">${have}</div></div>
    <div class="sp row">${state.plan.slots.length ? `<span id="clearWrap"><button class="btn sm ghost danger" type="button" id="clearWeek">Clear week</button></span>` : ""}<a class="btn primary" href="#shopping">Open shopping list</a></div>`;
}

function renderShop(items) {
  const start = parseIso(state.weekOf);
  const counts = { need: 0, have: 0, got: 0 };
  items.forEach(i => counts[i.status]++);
  $("#shopSub").textContent = items.length ? `Week of ${fmtShort(start)} · ${state.plan.slots.length} meals · ${counts.got} in cart` : `Week of ${fmtShort(start)}`;
  $("#nNeed").textContent = counts.need + counts.got; $("#nHave").textContent = counts.have; $("#nAll").textContent = items.length;
  $$("#shopSeg button").forEach(b => b.setAttribute("aria-pressed", b.dataset.f === state.shopFilter));
  const f = state.shopFilter;
  const shown = items.filter(i => f === "all" || (f === "need" ? i.status !== "have" : i.status === "have"));
  if (!items.length) {
    $("#shopBody").innerHTML = `<div class="empty"><h2>Nothing on the list yet</h2><p>Add meals to this week's plan and their ingredients show up here, grouped by aisle. You can also add one-off items above.</p><div class="row"><a class="btn primary" href="#plan">Plan meals</a></div></div>`;
    return;
  }
  if (!shown.length) {
    $("#shopBody").innerHTML = `<div class="empty"><h2>${f === "have" ? "Nothing marked as on hand" : "All covered"}</h2><p>${f === "have" ? "Tap “Have it” on any item you already have at home and it moves here." : "Everything on the list is marked as already at home."}</p></div>`;
    return;
  }
  const groups = {};
  shown.forEach(i => (groups[i.aisle] ||= []).push(i));
  let h = `<div class="aisles">`;
  for (const a of AISLE_ORDER) {
    const g = groups[a]; if (!g) continue;
    g.sort((x, y) => (x.status === "got") - (y.status === "got") || x.name.localeCompare(y.name));
    h += `<div class="aisle"><h3>${esc(a)}</h3>`;
    for (const i of g) {
      const cid = "c_" + hueOf(i.key) + "_" + i.key.replace(/[^a-z0-9]/gi, "");
      h += `<div class="item ${i.status}">
        <input type="checkbox" id="${esc(cid)}" data-got="${esc(i.key)}" ${i.status === "got" ? "checked" : ""} ${i.status === "have" ? "disabled" : ""} aria-label="In cart: ${esc(i.name)}">
        <label for="${esc(cid)}" style="min-width:0"><div><span class="q">${esc(i.qty)}</span><span class="nm">${esc(i.name)}</span></div>${i.sources.length ? `<div class="src">for ${esc(i.sources.join(", "))}</div>` : ""}</label>
        <span class="row" style="gap:4px;flex-wrap:nowrap">${i.manual ? `<button class="icon-btn" data-rmx="${esc(i.id)}" aria-label="Remove ${esc(i.name)}">×</button>` : ""}<button type="button" class="pill ${i.status === "have" ? "have" : ""}" data-have="${esc(i.key)}">${i.status === "have" ? "Have it ✓" : "Have it"}</button></span>
      </div>`;
    }
    h += `</div>`;
  }
  $("#shopBody").innerHTML = h + `</div>`;
}

function filteredRecipes() {
  const { q, sort, min, tag } = state.lib;
  const ql = q.trim().toLowerCase();
  let list = [...state.recipes.values()];
  if (ql) list = list.filter(r => (r.title + " " + (r.tags || []).join(" ") + " " + (r.ingredients || []).map(x => typeof x === "string" ? x : x.raw).join(" ")).toLowerCase().includes(ql));
  if (min) list = list.filter(r => (r.rating || 0) >= min);
  if (tag) list = list.filter(r => (r.tags || []).includes(tag));
  const by = { rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.createdAt || 0) - (a.createdAt || 0), recent: (a, b) => (b.createdAt || 0) - (a.createdAt || 0), cooked: (a, b) => (b.timesCooked || 0) - (a.timesCooked || 0) || (b.rating || 0) - (a.rating || 0), az: (a, b) => a.title.localeCompare(b.title) };
  return list.sort(by[sort] || by.rating);
}
function renderLib() {
  const all = [...state.recipes.values()];
  const rated = all.filter(r => r.rating).length;
  $("#libSub").textContent = all.length ? `${all.length} recipe${all.length > 1 ? "s" : ""} · ${rated} rated` : "";
  const tags = {}; all.forEach(r => (r.tags || []).forEach(t => tags[t] = (tags[t] || 0) + 1));
  const tl = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 16);
  $("#libTags").innerHTML = tl.length ? `<button class="chip" type="button" data-tag="" aria-pressed="${!state.lib.tag}">All</button>` + tl.map(([t]) => `<button class="chip" type="button" data-tag="${esc(t)}" aria-pressed="${state.lib.tag === t}">${esc(t)}</button>`).join("") : "";
  if (!state.recipesLoaded) { $("#libBody").innerHTML = `<div class="status"><span class="spin"></span>Loading your recipes…</div>`; return; }
  if (!all.length) {
    $("#libBody").innerHTML = `<div class="empty"><h2>Your recipe box is empty</h2><p>Paste a recipe from a website, type one in, or import the recipes you saved in Forkast on claude.ai. Or browse the open recipe database in Discover.</p><div class="row"><button class="btn primary" type="button" data-addmode="paste">Paste a recipe</button><button class="btn" type="button" data-addmode="manual">Type it in</button><button class="btn" type="button" data-addmode="import">Import</button><a class="btn ghost" href="#discover">Discover</a></div></div>`;
    return;
  }
  const list = filteredRecipes();
  if (!list.length) { $("#libBody").innerHTML = `<div class="empty"><h2>No matches</h2><p>Try a different search or rating filter.</p></div>`; return; }
  $("#libBody").innerHTML = `<div class="grid">` + list.map(cardHtml).join("") + `</div>`;
}
function cardHtml(r) {
  const meta = [];
  if (r.totalTime) meta.push(esc(r.totalTime));
  if (r.servings) meta.push(`serves ${r.servings}`);
  if (r.sourceUrl) meta.push(esc(domainOf(r.sourceUrl)));
  else if (r.source === "photo") meta.push("from photo");
  if (r.timesCooked) meta.push(`cooked ${r.timesCooked}×`);
  const ex = (r.tags || []).includes("example");
  return `<article class="card">${thumbHtml(r)}<div class="body">
    ${ex ? `<span class="tag ex">Example recipe</span>` : (r.tags && r.tags[0] ? `<span class="tag">${esc(r.tags[0])}</span>` : "")}
    <div class="ttl" data-open="${esc(r.id)}">${esc(r.title)}</div>
    <div class="meta">${meta.map(m => `<span>${m}</span>`).join("")}</div>
    <div class="foot">${starsHtml(r.rating, r.id)}<button class="btn sm sp" type="button" data-planpick="${esc(r.id)}">Add to week</button></div>
  </div></article>`;
}

/* ---------------- Modals ---------------- */
const overlay = $("#overlay");
let modalCleanup = null;
function openModal(html, opts = {}) {
  closeModal();
  overlay.innerHTML = `<div class="modal ${opts.narrow ? "narrow" : ""}" role="dialog" aria-modal="true">${html}</div>`;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  const f = overlay.querySelector("[autofocus], input, textarea, button.primary");
  setTimeout(() => f && f.focus(), 30);
  return overlay.firstElementChild;
}
function closeModal() {
  if (modalCleanup) { try { modalCleanup(); } catch {} modalCleanup = null; }
  overlay.hidden = true; overlay.innerHTML = ""; document.body.style.overflow = "";
}
overlay.addEventListener("mousedown", e => { if (e.target === overlay) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#lightbox").hidden) $("#lightbox").hidden = true; else if (!overlay.hidden) closeModal(); } });
$("#lightbox").addEventListener("click", () => $("#lightbox").hidden = true);
const closeBtn = `<button class="icon-btn" type="button" data-close aria-label="Close">×</button>`;

function openPicker(day) {
  const m = openModal(`<div class="m-head"><h2>Add a meal to ${DAYS[day]}</h2>${closeBtn}</div>
    <div class="m-body"><input type="search" id="pickQ" placeholder="Search your recipes" aria-label="Search your recipes" autofocus><div class="pick-list" id="pickList"></div>
    <div class="row muted" style="font-size:13px">Not in your box yet? <button class="btn sm" type="button" data-addmode="paste">Paste a recipe</button><button class="btn sm" type="button" data-addmode="manual">Type it in</button><a class="btn sm ghost" href="#discover" data-close>Discover</a></div></div>`, { narrow: true });
  const draw = () => {
    const q = $("#pickQ", m).value.toLowerCase();
    const list = [...state.recipes.values()].filter(r => !q || r.title.toLowerCase().includes(q)).sort((a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title));
    $("#pickList", m).innerHTML = list.length ? list.map(r => {
      const src = imgSrc(r);
      return `<button class="pick" type="button" data-pickadd="${esc(r.id)}" data-day="${day}"><span class="mini" style="--h:${hueOf(r.title)}">${src ? `<img src="${esc(src)}" alt="">` : esc(initials(r.title))}</span><span class="nm">${esc(r.title)}</span><span class="sp">${starsHtml(r.rating, "", "ro")}</span></button>`;
    }).join("") : `<div class="muted" style="padding:12px">${state.recipes.size ? "No matching recipes." : "Your recipe box is empty. Add a recipe first."}</div>`;
  };
  $("#pickQ", m).addEventListener("input", draw); draw();
}
function openDayPick(recipeId) {
  const r = state.recipes.get(recipeId); if (!r) return;
  const start = parseIso(state.weekOf);
  openModal(`<div class="m-head"><h2>Add “${esc(r.title)}” to…</h2>${closeBtn}</div>
    <div class="m-body"><div class="muted" style="font-size:13px">Week of ${fmtShort(start)}</div><div class="day-pick">${DAYS.map((d, i) => `<button type="button" data-dayadd="${i}" data-rid="${esc(recipeId)}">${d}<br><span class="mono muted" style="font-size:11px">${addDays(start, i).getDate()}</span></button>`).join("")}</div></div>`, { narrow: true });
}

function openDetail(id) {
  const r = state.recipes.get(id); if (!r) return;
  const imgs = allImgs(r);
  const ings = recipeIngredients(r);
  const m = openModal(`<div class="m-head"><h2>${esc(r.title)}</h2>${closeBtn}</div>
    <div class="m-body">
      ${imgs.length ? `<img class="hero-img" src="${esc(imgs[0])}" alt="" data-zoom="${esc(imgs[0])}" style="cursor:zoom-in">` : ""}
      ${imgs.length > 1 ? `<div class="gallery">${imgs.slice(1).map(s => `<img src="${esc(s)}" alt="" data-zoom="${esc(s)}">`).join("")}</div>` : ""}
      <div class="det-meta">${starsHtml(r.rating, r.id, "lg")}
        ${r.servings ? `<span>Serves <b class="mono">${r.servings}</b></span>` : ""}${r.totalTime ? `<span>${esc(r.totalTime)}</span>` : ""}
        ${r.timesCooked ? `<span>Cooked ${r.timesCooked}×</span>` : ""}
        ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(domainOf(r.sourceUrl) || "Source")} ↗</a>` : ""}</div>
      ${(r.tags || []).length ? `<div class="chips">${r.tags.map(t => `<span class="chip">${esc(t)}</span>`).join("")}</div>` : ""}
      <div class="cols">
        <div><h3 class="sec">Ingredients</h3><ul class="ing">${ings.map(i => `<li>${i.qty != null ? `<span class="q">${esc(fmtQty(i.qty, i.unit))}</span>${esc(i.note ? `(${i.note}) ` : "")}${esc(i.name)}` : esc(i.raw)}</li>`).join("") || `<li class="muted">No ingredients listed</li>`}</ul></div>
        <div><h3 class="sec">Method</h3>${(r.steps || []).length ? `<ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>` : `<p class="muted">No steps saved.</p>`}
        ${r.notes ? `<h3 class="sec" style="margin-top:18px">Notes</h3><p style="white-space:pre-wrap;margin:0">${esc(r.notes)}</p>` : ""}</div>
      </div>
    </div>
    <div class="m-foot"><span id="delWrap" style="margin-right:auto"><button class="btn ghost danger" type="button" id="delBtn">Delete</button></span>
      <button class="btn" type="button" id="cookedBtn">Cooked it</button>
      <button class="btn" type="button" id="editBtn">Edit</button>
      <button class="btn primary" type="button" data-planpick="${esc(r.id)}">Add to week</button></div>`);
  $("#editBtn", m).onclick = () => openEditor(r);
  $("#cookedBtn", m).onclick = () => { r.timesCooked = (r.timesCooked || 0) + 1; r.lastCooked = Date.now(); saveRecipe(r); toast(`Logged: cooked ${r.timesCooked}×`); openDetail(id); };
  $("#delBtn", m).onclick = () => {
    $("#delWrap", m).innerHTML = `<span class="confirm">Delete this recipe? <button class="btn sm danger" type="button" id="delYes">Delete</button><button class="btn sm ghost" type="button" id="delNo">Keep</button></span>`;
    $("#delYes", m).onclick = () => { deleteRecipe(id); closeModal(); toast("Recipe deleted"); };
    $("#delNo", m).onclick = () => openDetail(id);
  };
}

/* ---------- Add recipe flow ---------- */
let pendingImages = []; // {blob, url}
function clearPending() { pendingImages.forEach(p => URL.revokeObjectURL(p.url)); pendingImages = []; }

async function resizeImage(file, max = 1600, q = 0.85) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const s = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", q));
  } catch { return file; } finally { URL.revokeObjectURL(url); }
}
async function blobToDataUrl(blob) { return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); }); }
async function dataUrlToBlob(u) { return (await fetch(u)).blob(); }

/* Photo and link reading need Claude, so they stay in the claude.ai version of Forkast; recipes come across through Export / Import. */
const ARTIFACT_URL = "https://claude.ai/artifact/MAHqYJJTxErbmnriGsY1MN";
const aiTip = `<div class="banner" style="margin:0"><span>Want a recipe read for you from a photo or a web link? Open <a href="${ARTIFACT_URL}" target="_blank" rel="noopener">Forkast on claude.ai ↗</a>, add it there, tap <b>Export</b>, then bring it in with <b>Import</b> here.</span></div>`;

function addModalShell(mode) {
  return openModal(`<div class="m-head"><h2>Add a recipe</h2>${closeBtn}</div>
    <div class="tabs2" role="tablist">
      <button role="tab" type="button" data-amode="paste" aria-selected="${mode === "paste"}">Paste text</button>
      <button role="tab" type="button" data-amode="manual" aria-selected="false">Type it in</button>
      <button role="tab" type="button" data-amode="photo" aria-selected="${mode === "photo"}">Photo</button>
      <button role="tab" type="button" data-amode="import" aria-selected="${mode === "import"}">Import</button>
    </div><div class="m-body" id="addBody"></div><div class="m-foot" id="addFoot"></div>`);
}
function openAdd(mode = "paste") {
  if (mode === "manual") { clearPending(); return openEditor(null); }
  if (!["paste", "photo", "import"].includes(mode)) mode = "paste";
  const m = addModalShell(mode);
  ({ paste: drawPasteAdd, photo: drawPhotoAdd, import: drawImportAdd })[mode](m);
}

function drawPasteAdd(m) {
  const body = $("#addBody", m), foot = $("#addFoot", m);
  body.innerHTML = `
    <div class="field"><label for="pasteTxt">Recipe text</label><textarea id="pasteTxt" rows="10" placeholder="Paste a recipe copied from a website, email or note: the title, ingredients and steps."></textarea>
    <span class="hint">Forkast splits it into title, ingredients and steps. You check everything before saving.</span></div>
    <div class="field"><label for="pasteUrl">Source link (optional)</label><input type="url" id="pasteUrl" placeholder="https://"></div>
    <div class="status" id="pasteStatus"></div>${aiTip}`;
  foot.innerHTML = `<button class="btn primary" type="button" id="pasteGo">Continue</button>`;
  setTimeout(() => $("#pasteTxt", m)?.focus(), 40);
  $("#pasteGo", m).onclick = () => {
    const txt = $("#pasteTxt", m).value.trim(), url = $("#pasteUrl", m).value.trim();
    if (!txt) { const st = $("#pasteStatus", m); st.className = "status err"; st.textContent = "Paste the recipe text first."; return; }
    const exp = parseExport(txt);
    if (exp) { runImport(exp, $("#pasteStatus", m)); return; }
    openEditor({ ...parseRecipeText(txt), source: url ? "link" : "manual", sourceUrl: url }, true);
  };
}

const BULLET = /^[•\-*–·▢□☐◦]\s*/;
const H_ING = /^(ingredients?|you(?:'|’)ll need|you will need|what you(?:'|’)ll need|what you need)\b\s*:?$/i;
const H_STEP = /^(instructions?|directions?|method|steps|preparation|how to make(?: it)?)\b\s*:?$/i;
const H_NOTE = /^((?:recipe |cook'?s )?notes?|tips?)\b\s*:?$/i;
const stripStepNo = s => s.replace(/^\s*(step\s*)?\d+[.):\s-]+/i, "").trim();
function parseRecipeText(text) {
  const out = { title: "", servings: null, totalTime: "", ingredients: [], steps: [], tags: [], notes: "" };
  const intro = [], notes = [];
  let sec = "intro", newStep = false;
  for (let l of String(text).replace(/\r/g, "").split("\n")) {
    l = l.replace(/\s+/g, " ").replace(/^#+\s*/, "").trim();
    if (!l) continue;
    if (H_ING.test(l)) { sec = "ing"; continue; }
    if (H_STEP.test(l)) { sec = "step"; continue; }
    if (H_NOTE.test(l)) { sec = "note"; continue; }
    const sv = l.match(/^(?:serves|servings|yield|yields|makes)\s*:?\s*(\d+)/i);
    if (sv && !out.servings) { out.servings = +sv[1]; continue; }
    const tm = l.match(/^total(?: time)?\s*:?\s*(.+)$/i);
    if (tm && !out.totalTime) { out.totalTime = tm[1]; continue; }
    if (sec === "intro") intro.push(l);
    else if (sec === "ing") { if (!/:$/.test(l)) out.ingredients.push(l.replace(BULLET, "")); }
    else if (sec === "step") {
      if (/^(step\s*)?\d+[.):]?$/i.test(l)) { newStep = true; continue; }
      // Lines wrapped by a photo or a narrow page continue the previous step until it ends a sentence.
      const marked = /^\s*(step\s*)?\d+[.):\s-]+/i.test(l) || BULLET.test(l), s = stripStepNo(l.replace(BULLET, "")), prev = out.steps.length - 1;
      if (!s) continue;
      if (prev >= 0 && !marked && !newStep && !/[.!?:)]$/.test(out.steps[prev])) out.steps[prev] += " " + s; else out.steps.push(s);
      newStep = false;
    }
    else notes.push(l);
  }
  out.title = intro.shift() || "";
  if (!out.ingredients.length && !out.steps.length) {
    // No headings: short or quantity-first lines are ingredients, sentences are steps.
    for (const l of intro) {
      const b = l.replace(BULLET, "");
      if (BULLET.test(l) || /^[\d¼½¾⅓⅔⅛⅜⅝⅞⅕]/.test(b) && !/^\d+[.)]\s/.test(b) || (b.length < 60 && !/[.!]$/.test(b))) out.ingredients.push(b);
      else out.steps.push(stripStepNo(b));
    }
  } else if (intro.length) notes.unshift(intro.join(" ").slice(0, 1000));
  out.notes = notes.join("\n");
  return out;
}

function drawPhotoAdd(m) {
  const body = $("#addBody", m), foot = $("#addFoot", m);
  body.innerHTML = `
    <div class="drop" id="drop"><b>Take or choose photos of the recipe</b>Cookbook pages, printed recipe cards or screenshots, in page order. You can also paste a screenshot with Ctrl/Cmd+V.<div style="margin-top:12px"><button class="btn" type="button" id="pickFiles">Take or choose photos</button></div></div>
    <div class="thumbs" id="pendThumbs"></div>
    <div class="status" id="photoStatus"></div>
    <div class="muted" style="font-size:14px">Forkast reads printed text right on this device, and the photos are saved with the recipe. Handwriting usually doesn't read well; use “Fill in by hand” for that.</div>${aiTip}`;
  foot.innerHTML = `<button class="btn ghost" type="button" id="photoNext" disabled>Fill in by hand</button><button class="btn primary" type="button" id="photoRead" disabled>Read recipe from photos</button>`;
  const drawThumbs = () => {
    $("#pendThumbs", m).innerHTML = pendingImages.map((p, i) => `<figure><img src="${p.url}" alt="Recipe image ${i + 1}"><button type="button" data-rmimg="${i}" aria-label="Remove image">×</button></figure>`).join("");
    $("#photoNext", m).disabled = $("#photoRead", m).disabled = !pendingImages.length;
  };
  const addFiles = async files => {
    for (const f of files) { if (!f.type.startsWith("image/")) continue; const b = await resizeImage(f); pendingImages.push({ blob: b, url: URL.createObjectURL(b) }); }
    drawThumbs();
  };
  drawThumbs();
  $("#pickFiles", m).onclick = () => { $("#fileInput").onchange = e => { addFiles([...e.target.files]); e.target.value = ""; }; $("#fileInput").click(); };
  const drop = $("#drop", m);
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
  const onPaste = e => { const fs = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith("image/")); if (fs.length) { e.preventDefault(); addFiles(fs); } };
  document.addEventListener("paste", onPaste);
  modalCleanup = () => document.removeEventListener("paste", onPaste);
  $("#pendThumbs", m).addEventListener("click", e => { const b = e.target.closest("[data-rmimg]"); if (!b) return; const [p] = pendingImages.splice(+b.dataset.rmimg, 1); URL.revokeObjectURL(p.url); drawThumbs(); });
  $("#photoNext", m).onclick = () => openEditor({ source: "photo" }, true);
  $("#photoRead", m).onclick = async () => {
    const st = $("#photoStatus", m), btn = $("#photoRead", m);
    const say = t => { st.className = "status"; st.innerHTML = `<span class="spin"></span>${esc(t)}`; };
    btn.disabled = true;
    say("Loading the text reader… the first time takes a little while.");
    try {
      const text = await ocrImages(pendingImages.map(p => p.blob), p => say(`Reading the photos… ${Math.round(p * 100)}%`));
      if (overlay.firstElementChild !== m) return;
      if (text.replace(/\s/g, "").length < 20) { st.className = "status err"; st.textContent = "Couldn't find readable text. Try a sharper, well-lit photo taken straight on, or fill it in by hand."; btn.disabled = false; return; }
      openEditor({ ...parseRecipeText(text), source: "photo" }, true);
    } catch (e) { st.className = "status err"; st.textContent = e.message || "Couldn't read the photos."; btn.disabled = false; }
  };
}

/* On-device text recognition with Tesseract.js, loaded on first use. Its English data downloads once, then the browser caches it. */
let tessLoading = null;
function loadTesseract() {
  return tessLoading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract); s.onerror = () => { tessLoading = null; rej(new Error("Couldn't load the text reader. Check your internet connection.")); };
    document.head.appendChild(s);
  });
}
async function ocrImages(blobs, onProgress) {
  const T = await loadTesseract();
  let i = 0;
  const worker = await T.createWorker("eng", 1, { logger: x => { if (x.status === "recognizing text") onProgress((i + x.progress) / blobs.length); } });
  try {
    const pages = [];
    for (; i < blobs.length; i++) pages.push((await worker.recognize(blobs[i])).data.text);
    return pages.join("\n");
  } finally { worker.terminate(); }
}

function drawImportAdd(m) {
  const body = $("#addBody", m), foot = $("#addFoot", m);
  body.innerHTML = `
    <div class="drop" id="impDrop"><b>Import from Forkast</b>Choose a file exported from Forkast on claude.ai, or a backup from another device.<div style="margin-top:12px"><button class="btn" type="button" id="impPick">Choose file</button></div></div>
    <div class="field"><label for="impTxt">Or paste exported text</label><textarea id="impTxt" rows="5" placeholder='{"format": "larder-export", …}'></textarea></div>
    <div class="status" id="impStatus"></div>`;
  foot.innerHTML = `<button class="btn primary" type="button" id="impGo">Import</button>`;
  const st = $("#impStatus", m);
  const fromText = txt => { const data = parseExport(txt); if (data) runImport(data, st); else { st.className = "status err"; st.textContent = "That isn't a Forkast export. Use Export in Forkast on claude.ai, or Download backup on another device."; } };
  const fromFile = async f => { if (f) fromText(await f.text()); };
  $("#impPick", m).onclick = () => { const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json,application/json,text/plain"; inp.onchange = () => fromFile(inp.files[0]); inp.click(); };
  const drop = $("#impDrop", m);
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); fromFile(e.dataTransfer.files[0]); });
  $("#impGo", m).onclick = () => { const t = $("#impTxt", m).value.trim(); if (t) fromText(t); else { st.className = "status err"; st.textContent = "Choose a file or paste the exported text."; } };
}

/* ---------------- Export & import ----------------
   {format: "larder-export", version: 1, exportedAt, recipes: [{id, ...recipe, images: [dataURL]}], plans?: {week: doc}, shopping?: {week: doc}}
   Forkast on claude.ai writes the same format with recipes only. */
async function recipeForExport(r) {
  const out = JSON.parse(JSON.stringify(r));
  delete out.imageIds; out.images = [];
  for (const id of r.imageIds || []) { try { const b = await backend.getImage(id); if (b) out.images.push(await blobToDataUrl(b)); } catch (e) { console.warn(e); } }
  return out;
}
async function buildExport() {
  const recipes = [];
  for (const r of state.recipes.values()) recipes.push(await recipeForExport(r));
  const weeks = async col => Object.fromEntries((await backend.getAll(col)).map(([k, v]) => [k.slice(col.length + 1), v]));
  return { format: "larder-export", version: 1, exportedAt: new Date().toISOString(), recipes, plans: await weeks("plans"), shopping: await weeks("shopping") };
}
function parseExport(txt) {
  try { const j = JSON.parse(String(txt).trim()); if (j && j.format === "larder-export" && Array.isArray(j.recipes)) return j; } catch {}
  return null;
}
async function importData(data) {
  let added = 0, updated = 0, weeks = 0;
  for (const src of data.recipes) {
    if (!src || !src.title) continue;
    const { images, ...rec } = src;
    rec.id = String(rec.id || "").replace(/[^\w-]/g, "").slice(0, 40) || uid();
    rec.imageIds = [];
    for (const u of images || []) { try { rec.imageIds.push(await backend.putImage(await dataUrlToBlob(u))); } catch (e) { console.warn(e); } }
    const prev = state.recipes.get(rec.id);
    if (prev) { (prev.imageIds || []).forEach(id => backend.delImage(id).catch(() => {})); updated++; } else added++;
    state.recipes.set(rec.id, rec);
    await store.set("recipes/" + rec.id, stripId(rec));
  }
  for (const col of ["plans", "shopping"]) for (const [wk, doc] of Object.entries(data[col] || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(wk) || !doc) continue;
    await store.set(col + "/" + wk, doc); if (col === "plans") weeks++;
  }
  store.refresh(); renderAll();
  return { added, updated, weeks };
}
async function runImport(data, st) {
  st.className = "status"; st.innerHTML = `<span class="spin"></span>Importing…`;
  try {
    const { added, updated, weeks } = await importData(data);
    const parts = [added && `${added} new recipe${added > 1 ? "s" : ""}`, updated && `${updated} updated`, weeks && `${weeks} week${weeks > 1 ? "s" : ""} of plans`].filter(Boolean);
    closeModal(); toast(parts.length ? "Imported " + parts.join(", ") : "Nothing new to import");
    if (added + updated && currentView() !== "plan") location.hash = "#recipes";
  } catch (e) { st.className = "status err"; st.textContent = "Import failed: " + (e.message || e); }
}
async function downloadJson(data, name) {
  const file = new File([JSON.stringify(data)], name, { type: "application/json" });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function openData() {
  const n = state.recipes.size;
  const m = openModal(`<div class="m-head"><h2>Your data</h2>${closeBtn}</div>
    <div class="m-body">
      <p style="margin:0">Your recipes, plans and shopping lists are saved in <b>${esc(backend.label)}</b>${backend === localBackend ? " on this device, so Forkast works offline." : "."}</p>
      <div class="field"><span class="lbl-s">Google Drive sync</span><div class="field" id="driveBox"></div></div>
      <div class="field"><span class="lbl-s">Back up</span><div><button class="btn" type="button" id="expAll">Download backup</button></div><span class="hint">${n} recipe${n === 1 ? "" : "s"} with photos, plus every week's plan and shopping list, in one .json file you can import on another device.</span></div>
      <div class="field"><span class="lbl-s">Import</span><div><button class="btn" type="button" data-addmode="import">Import recipes…</button></div><span class="hint">From a backup, or recipes exported from <a href="${ARTIFACT_URL}" target="_blank" rel="noopener">Forkast on claude.ai</a>.</span></div>
      <div class="status" id="dataStatus"></div>
    </div>`, { narrow: true });
  drawDriveBox();
  $("#expAll", m).onclick = async () => {
    const st = $("#dataStatus", m); st.className = "status"; st.innerHTML = `<span class="spin"></span>Preparing backup…`;
    try { await downloadJson(await buildExport(), `forkast-backup-${isoDate(new Date())}.json`); st.textContent = ""; }
    catch (e) { st.className = "status err"; st.textContent = "Couldn't make the backup: " + (e.message || e); }
  };
}

function openEditor(r, keepImages = false) {
  if (!keepImages) clearPending();
  const isNew = !r || !r.id;
  r = r || {};
  const existing = allImgs(r);
  const m = openModal(`<div class="m-head"><h2>${isNew ? "Review & save recipe" : "Edit recipe"}</h2>${closeBtn}</div>
    <form class="m-body" id="edForm">
      <div class="field"><label for="edTitle">Title</label><input type="text" id="edTitle" required value="${esc(r.title || "")}" placeholder="e.g. Weeknight chicken tacos"></div>
      <div class="f-row">
        <div class="field"><label for="edServ">Servings</label><input type="number" id="edServ" min="1" max="99" value="${esc(r.servings || "")}" placeholder="4"></div>
        <div class="field"><label for="edTime">Total time</label><input type="text" id="edTime" value="${esc(r.totalTime || "")}" placeholder="40 min"></div>
        <div class="field"><label>Rating</label><div id="edStars">${starsHtml(r.rating || 0, "__ed", "lg")}</div></div>
      </div>
      <div class="field"><label for="edIng">Ingredients</label><textarea id="edIng" rows="8" placeholder="One per line, e.g.&#10;1 lb ground beef&#10;2 cloves garlic, minced&#10;1 (14 oz) can diced tomatoes">${esc((r.ingredients || []).map(x => typeof x === "string" ? x : x.raw).join("\n"))}</textarea><span class="hint">One per line, quantity first. These feed the shopping list.</span></div>
      <div class="field"><label for="edSteps">Steps</label><textarea id="edSteps" rows="7" placeholder="One step per line">${esc((r.steps || []).join("\n"))}</textarea></div>
      <div class="f-row">
        <div class="field"><label for="edTags">Tags</label><input type="text" id="edTags" value="${esc((r.tags || []).join(", "))}" placeholder="chicken, quick, kid-friendly"></div>
        <div class="field"><label for="edUrl">Source link</label><input type="url" id="edUrl" value="${esc(r.sourceUrl || "")}" placeholder="https://"></div>
      </div>
      <div class="field"><label for="edNotes">Notes</label><textarea id="edNotes" rows="3" placeholder="Tweaks, substitutions, what the family thought">${esc(r.notes || "")}</textarea></div>
      <div class="field"><span class="lbl-s">Photos</span><div class="thumbs" id="edThumbs"></div><div><button class="btn sm" type="button" id="edAddImg">Add photo</button></div></div>
    </form>
    <div class="m-foot"><span class="status" id="edStatus" style="margin-right:auto"></span><button class="btn ghost" type="button" data-close>Cancel</button><button class="btn primary" type="button" id="edSave">Save recipe</button></div>`);
  let rating = r.rating || 0;
  let keptIds = [...(r.imageIds || [])];
  let keepThumb = !!r.thumbData;
  const drawThumbs = () => {
    $("#edThumbs", m).innerHTML =
      keptIds.map(id => `<figure><img src="${esc(imgUrls.get(id) || "")}" alt=""><button type="button" data-rmkept="${esc(id)}" aria-label="Remove photo">×</button></figure>`).join("") +
      (keepThumb && !keptIds.length ? `<figure><img src="${esc(r.thumbData)}" alt=""><button type="button" data-rmthumb aria-label="Remove photo">×</button></figure>` : "") +
      pendingImages.map((p, i) => `<figure><img src="${p.url}" alt=""><button type="button" data-rmpend="${i}" aria-label="Remove photo">×</button></figure>`).join("");
  };
  drawThumbs();
  $("#edThumbs", m).addEventListener("click", e => {
    const a = e.target.closest("[data-rmkept]"), b = e.target.closest("[data-rmpend]"), c = e.target.closest("[data-rmthumb]");
    if (a) keptIds = keptIds.filter(x => x !== a.dataset.rmkept);
    if (b) { const [p] = pendingImages.splice(+b.dataset.rmpend, 1); URL.revokeObjectURL(p.url); }
    if (c) keepThumb = false;
    drawThumbs();
  });
  $("#edAddImg", m).onclick = () => { $("#fileInput").onchange = async e => { for (const f of e.target.files) { const bl = await resizeImage(f); pendingImages.push({ blob: bl, url: URL.createObjectURL(bl) }); } e.target.value = ""; drawThumbs(); }; $("#fileInput").click(); };
  $("#edStars", m).addEventListener("click", e => { const b = e.target.closest("[data-rate]"); if (!b) return; const n = +b.dataset.rate; rating = rating === n ? 0 : n; $("#edStars", m).innerHTML = starsHtml(rating, "__ed", "lg"); });
  $("#edSave", m).onclick = async () => {
    const title = $("#edTitle", m).value.trim();
    const st = $("#edStatus", m);
    if (!title) { st.className = "status err"; st.textContent = "Add a title first."; $("#edTitle", m).focus(); return; }
    $("#edSave", m).disabled = true;
    const rec = isNew ? { id: uid(), createdAt: Date.now(), timesCooked: 0 } : { ...state.recipes.get(r.id) };
    Object.assign(rec, {
      title, servings: Number($("#edServ", m).value) || null, totalTime: $("#edTime", m).value.trim(),
      ingredients: $("#edIng", m).value.split("\n").map(s => s.trim()).filter(Boolean),
      steps: $("#edSteps", m).value.split("\n").map(s => s.trim()).filter(Boolean),
      tags: $("#edTags", m).value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean),
      sourceUrl: $("#edUrl", m).value.trim(), notes: $("#edNotes", m).value.trim(), rating,
      source: r.source || rec.source || "manual",
    });
    const removed = (r.imageIds || []).filter(x => !keptIds.includes(x));
    rec.imageIds = keptIds;
    if (!keepThumb) delete rec.thumbData;
    if (pendingImages.length) {
      st.className = "status"; st.innerHTML = `<span class="spin"></span>Saving photos…`;
      for (const p of pendingImages) { try { rec.imageIds.push(await backend.putImage(p.blob)); } catch (e) { console.warn(e); } }
    }
    for (const id of removed) backend.delImage(id).catch(() => {});
    clearPending();
    await saveRecipe(rec);
    closeModal();
    toast(isNew ? "Recipe saved to your box" : "Recipe updated");
    if (isNew && currentView() !== "plan") location.hash = "#recipes";
  };
}

/* ---------------- Discover (TheMealDB) ---------------- */
const MEALDB = "https://www.themealdb.com/api/json/v1/1/";
const CATS = ["Beef", "Chicken", "Pork", "Lamb", "Seafood", "Pasta", "Vegetarian", "Vegan", "Breakfast", "Side", "Dessert"];
const EXT = [["Allrecipes", q => `https://www.allrecipes.com/search?q=${q}`], ["BBC Good Food", q => `https://www.bbcgoodfood.com/search?q=${q}`], ["Budget Bytes", q => `https://www.budgetbytes.com/?s=${q}`], ["Serious Eats", q => `https://www.seriouseats.com/search?q=${q}`], ["NYT Cooking", q => `https://cooking.nytimes.com/search?q=${q}`], ["Food Network", q => `https://www.foodnetwork.com/search/${q}-`]];
const mealCache = new Map();
async function mealdb(path) {
  const res = await fetch(MEALDB + path);
  if (!res.ok) throw new Error("TheMealDB answered " + res.status);
  return (await res.json()).meals || [];
}
function netErr(e) {
  if (navigator.onLine === false) return "You're offline. Connect to the internet to search recipes.";
  return "Couldn't reach TheMealDB" + (e && e.message ? ": " + String(e.message).slice(0, 140) : ".");
}
function mealToRecipe(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ing = (m["strIngredient" + i] || "").trim(), meas = (m["strMeasure" + i] || "").trim();
    if (ing) ingredients.push((meas ? meas + " " : "") + ing);
  }
  const steps = String(m.strInstructions || "").split(/\r?\n+/).map(s => s.replace(/^\s*(step\s*)?\d+[.):\s-]*/i, "").trim()).filter(s => s.length > 2);
  const tags = [m.strCategory, m.strArea, ...(m.strTags || "").split(",")].map(t => String(t || "").trim().toLowerCase()).filter(Boolean);
  return { title: m.strMeal, servings: 4, totalTime: "", ingredients, steps, tags: [...new Set(tags)].slice(0, 5), notes: m.strYoutube ? `Video: ${m.strYoutube}` : "", sourceUrl: m.strSource || `https://www.themealdb.com/meal/${m.idMeal}`, source: "themealdb", mealdbId: m.idMeal, thumbUrl: m.strMealThumb || "" };
}
function renderDisc() {
  $("#discCats").innerHTML = CATS.map(c => `<button class="chip" type="button" data-cat="${c}">${c}</button>`).join("");
  const q = encodeURIComponent($("#discQ").value.trim() || "dinner");
  $("#extLinks").innerHTML = EXT.map(([n, f]) => `<a class="btn sm" href="${esc(f(q))}" target="_blank" rel="noopener">${n} ↗</a>`).join("") + `<button class="btn sm primary" type="button" data-addmode="paste">Paste a recipe</button>`;
  const savedIds = new Set([...state.recipes.values()].map(r => r.mealdbId).filter(Boolean));
  $("#discBody").innerHTML = state.disc.results.map(m => {
    const saved = savedIds.has(m.idMeal);
    const meta = [m.strCategory, m.strArea].filter(Boolean).join(" · ");
    return `<article class="card"><button type="button" class="thumb" style="--h:${hueOf(m.strMeal)}" data-mpreview="${esc(m.idMeal)}" aria-label="Preview ${esc(m.strMeal)}">${m.strMealThumb ? `<img src="${esc(m.strMealThumb)}/preview" alt="" loading="lazy">` : `<span class="ini">${esc(initials(m.strMeal))}</span>`}</button>
      <div class="body"><span class="tag">TheMealDB</span><div class="ttl" data-mpreview="${esc(m.idMeal)}">${esc(m.strMeal)}</div><div class="meta">${esc(meta)}</div>
      <div class="foot"><button class="btn sm" type="button" data-mpreview="${esc(m.idMeal)}">Preview</button><button class="btn sm sp ${saved ? "" : "primary"}" type="button" data-msave="${esc(m.idMeal)}" ${saved ? "disabled" : ""}>${saved ? "Saved" : "Save"}</button></div></div></article>`;
  }).join("");
}
/* TheMealDB's name search only matches the whole phrase ("chicken tacos" finds nothing), so search each word and
   the words as ingredients too, then list meals whose names contain the most search words first. */
const MEAL_SYN = { hamburger: "burger", cheeseburger: "burger", spag: "spaghetti", mac: "macaroni", bolognaise: "bolognese" };
const MEAL_STOP = new Set(["and", "with", "the", "recipe", "recipes", "easy", "best", "homemade"]);
async function searchMeals(q) {
  const words = q.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(w => w.length > 2 && !MEAL_STOP.has(w));
  const stems = [...new Set(words.map(w => MEAL_SYN[w] || MEAL_SYN[singular(w)] || singular(w)))];
  const paths = new Set(["search.php?s=" + encodeURIComponent(q.trim())]);
  for (const w of stems) paths.add("search.php?s=" + encodeURIComponent(w));
  if (stems.length) paths.add("filter.php?i=" + encodeURIComponent(stems.join("_")));
  if (stems.length > 1) for (const w of stems) paths.add("filter.php?i=" + encodeURIComponent(w));
  const lists = await Promise.all([...paths].map(p => mealdb(p).catch(() => [])));
  const byId = new Map();
  for (const m of lists.flat()) byId.set(m.idMeal, { ...byId.get(m.idMeal), ...m });
  const score = m => { const n = m.strMeal.toLowerCase(); return stems.filter(s => n.includes(s)).length * 10 + (n.includes(q.trim().toLowerCase()) ? 5 : 0) + (m.strInstructions ? 1 : 0); };
  return [...byId.values()].sort((a, b) => score(b) - score(a) || a.strMeal.localeCompare(b.strMeal));
}
async function runDisc(kind, val) {
  const st = $("#discStatus");
  st.className = "status"; st.innerHTML = `<span class="spin"></span>Searching TheMealDB…`;
  try {
    let meals;
    if (kind === "q") meals = await searchMeals(val);
    else if (kind === "random") { meals = []; for (let i = 0; i < 3; i++) meals.push(...await mealdb("random.php")); }
    else meals = await mealdb("filter.php?c=" + encodeURIComponent(val));
    meals.forEach(m => { if (m.strInstructions) mealCache.set(m.idMeal, m); });
    state.disc.results = meals.slice(0, 48);
    st.className = "status"; st.textContent = meals.length ? `${meals.length} result${meals.length > 1 ? "s" : ""}${meals.length > 48 ? ", showing 48" : ""}` : "No recipes found. Try a simpler search, like a single ingredient.";
    renderDisc();
  } catch (e) { st.className = "status err"; st.textContent = netErr(e); }
}
async function getMeal(id) {
  if (mealCache.has(id)) return mealCache.get(id);
  const [m] = await mealdb("lookup.php?i=" + encodeURIComponent(id));
  if (!m) throw new Error("recipe not found");
  mealCache.set(id, m); return m;
}
async function saveMeal(id, thenPlanDay) {
  try {
    toast("Saving…");
    const m = await getMeal(id);
    const rec = { id: uid(), createdAt: Date.now(), timesCooked: 0, rating: 0, imageIds: [], ...mealToRecipe(m) };
    await saveRecipe(rec);
    toast(`Saved ${rec.title} to your recipe box`);
    if (thenPlanDay) openDayPick(rec.id);
    return rec;
  } catch (e) { toast(netErr(e)); }
}
async function previewMeal(id) {
  const m0 = openModal(`<div class="m-head"><h2>Loading…</h2>${closeBtn}</div><div class="m-body"><div class="status"><span class="spin"></span>Fetching recipe…</div></div>`);
  try {
    const m = await getMeal(id);
    const r = mealToRecipe(m);
    const ings = r.ingredients.map(parseIngredient);
    const saved = [...state.recipes.values()].some(x => x.mealdbId === id);
    openModal(`<div class="m-head"><h2>${esc(r.title)}</h2>${closeBtn}</div>
      <div class="m-body"><div class="det-meta"><span>${esc([m.strCategory, m.strArea].filter(Boolean).join(" · "))}</span><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(domainOf(r.sourceUrl))} ↗</a></div>
      <div class="cols"><div><h3 class="sec">Ingredients</h3><ul class="ing">${ings.map(i => `<li>${i.qty != null ? `<span class="q">${esc(fmtQty(i.qty, i.unit))}</span>${esc(i.name)}` : esc(i.raw)}</li>`).join("")}</ul></div>
      <div><h3 class="sec">Method</h3><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div></div></div>
      <div class="m-foot"><button class="btn" type="button" data-msave="${esc(id)}" ${saved ? "disabled" : ""}>${saved ? "Already saved" : "Save to recipe box"}</button><button class="btn primary" type="button" data-msaveplan="${esc(id)}" ${saved ? "disabled" : ""}>Save & add to week</button></div>`);
  } catch (e) {
    if (overlay.firstElementChild === m0) $(".m-body", m0).innerHTML = `<div class="status err">${esc(netErr(e))}</div>`;
  }
}

/* ---------------- Events ---------------- */
document.addEventListener("click", e => {
  const t = e.target.closest("button, a, [data-open], [data-mpreview]");
  if (!t) return;
  const d = t.dataset;
  if (d.close !== undefined) { closeModal(); return; }
  if (d.rate && d.id && d.id !== "__ed") { e.stopPropagation(); rateRecipe(d.id, +d.rate); if (!overlay.hidden) openDetail(d.id); return; }
  if (d.open) { if (state.recipes.has(d.open)) openDetail(d.open); return; }
  if (d.addday) { openPicker(+d.addday); return; }
  if (d.pickadd) { addToPlan(d.pickadd, +d.day); closeModal(); return; }
  if (d.planpick) { openDayPick(d.planpick); return; }
  if (d.dayadd) { addToPlan(d.rid, +d.dayadd); closeModal(); return; }
  if (d.unslot) { state.plan.slots = state.plan.slots.filter(s => s.id !== d.unslot); savePlan(); renderAll(); return; }
  if (d.serv) { const s = state.plan.slots.find(x => x.id === d.serv); if (s) { s.servings = Math.max(1, Math.min(40, (s.servings || 4) + +d.delta)); savePlan(); renderAll(); } return; }
  if (d.addmode) { openAdd(d.addmode); return; }
  if (d.amode) { if (d.amode === "manual") openEditor(null, true); else openAdd(d.amode); return; }
  if (d.have) { const k = d.have; state.shop.status[k] = state.shop.status[k] === "have" ? "need" : "have"; if (state.shop.status[k] === "need") delete state.shop.status[k]; saveShop(); renderAll(); return; }
  if (d.rmx) { state.shop.extras = state.shop.extras.filter(x => x.id !== d.rmx); delete state.shop.status["x_" + d.rmx]; saveShop(); renderAll(); return; }
  if (d.f) { state.shopFilter = d.f; renderAll(); return; }
  if (d.tag !== undefined && t.classList.contains("chip")) { state.lib.tag = d.tag; renderLib(); return; }
  if (d.cat) { runDisc("cat", d.cat); return; }
  if (d.mpreview) { previewMeal(d.mpreview); return; }
  if (d.msave) { t.disabled = true; saveMeal(d.msave).then(() => { if (!overlay.hidden) closeModal(); renderDisc(); }); return; }
  if (d.msaveplan) { t.disabled = true; saveMeal(d.msaveplan, true); return; }
  if (d.zoom) { const lb = $("#lightbox"); $("img", lb).src = d.zoom; lb.hidden = false; return; }
  if (t.id === "clearWeek") {
    $("#clearWrap").innerHTML = `<span class="confirm">Remove all ${state.plan.slots.length} meals? <button class="btn sm danger" type="button" id="clearYes">Clear</button><button class="btn sm ghost" type="button" id="clearNo">Cancel</button></span>`;
    return;
  }
  if (t.id === "clearYes") { state.plan.slots = []; state.shop = { status: {}, extras: state.shop.extras }; savePlan(); saveShop(); renderAll(); toast("Week cleared"); return; }
  if (t.id === "clearNo") { renderAll(); return; }
  if (t.id === "driveConnect" || (t.id === "syncBtn" && sync.status === "reconnect")) { connectDrive(); return; }
  if (t.id === "syncBtn") { openData(); return; }
  if (t.id === "driveSync") { syncNow(); return; }
  if (t.id === "driveOff") { disconnectDrive(); return; }
});
document.addEventListener("click", e => { const z = e.target.closest("img[data-zoom]"); if (z) { const lb = $("#lightbox"); $("img", lb).src = z.dataset.zoom; lb.hidden = false; } });
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset && t.dataset.got) { const k = t.dataset.got; if (t.checked) state.shop.status[k] = "got"; else delete state.shop.status[k]; saveShop(); renderAll(); }
});
$("#addRecipeBtn").onclick = () => openAdd("paste");
$("#dataBtn").onclick = openData;
$("#prevWeek").onclick = () => { state.weekOf = isoDate(addDays(parseIso(state.weekOf), -7)); watchWeek(); };
$("#nextWeek").onclick = () => { state.weekOf = isoDate(addDays(parseIso(state.weekOf), 7)); watchWeek(); };
$("#thisWeek").onclick = () => { state.weekOf = isoDate(mondayOf(new Date())); watchWeek(); };
$("#libSearch").addEventListener("input", e => { state.lib.q = e.target.value; renderLib(); });
$("#libSort").addEventListener("change", e => { state.lib.sort = e.target.value; renderLib(); try { localStorage.setItem("larder-sort", e.target.value); } catch {} });
$("#libMin").addEventListener("change", e => { state.lib.min = +e.target.value; renderLib(); });
$("#addItemForm").addEventListener("submit", e => {
  e.preventDefault();
  const v = $("#addItemInput").value.trim(); if (!v) return;
  const p = parseIngredient(v);
  state.shop.extras.push({ id: uid(), name: p.qty != null ? p.name : v, qty: p.qty != null ? fmtQty(p.qty, p.unit) : "" });
  $("#addItemInput").value = ""; saveShop(); renderAll();
});
$("#resetChecks").onclick = () => { state.shop.status = {}; saveShop(); renderAll(); toast("All items set back to “to buy”"); };
$("#copyList").onclick = async () => {
  const items = buildShopping().filter(i => i.status === "need");
  if (!items.length) { toast("Nothing left to buy"); return; }
  const groups = {}; items.forEach(i => (groups[i.aisle] ||= []).push(i));
  const txt = AISLE_ORDER.filter(a => groups[a]).map(a => a.toUpperCase() + "\n" + groups[a].map(i => `- ${i.qty ? i.qty + " " : ""}${i.name}`).join("\n")).join("\n\n");
  try { await navigator.clipboard.writeText(txt); toast("Shopping list copied"); }
  catch { openModal(`<div class="m-head"><h2>Copy your list</h2>${closeBtn}</div><div class="m-body"><textarea rows="14" id="copyTxt">${esc(txt)}</textarea></div>`, { narrow: true }); setTimeout(() => $("#copyTxt")?.select(), 50); }
};
$("#discForm").addEventListener("submit", e => { e.preventDefault(); const q = $("#discQ").value.trim(); if (q) runDisc("q", q); renderDisc(); });
$("#discRandom").onclick = () => runDisc("random");
window.addEventListener("hashchange", () => { closeModal(); renderAll(); window.scrollTo(0, 0); });

/* ---------------- Boot ---------------- */
try { const s = localStorage.getItem("larder-sort"); if (s) { state.lib.sort = s; $("#libSort").value = s; } } catch {}
renderAll();

function startData() {
  store.watchCol("recipes", list => { state.recipes = new Map(list.map(r => [r.id, r])); state.recipesLoaded = true; renderAll(); });
  watchWeek();
}
(async () => {
  try { await backend.ready(); }
  catch (e) { console.warn(e); backend = memoryBackend; showStoreBanner("This browser won't let Forkast save anything (private browsing?), so changes are lost when you close the page."); }
  if (backend === localBackend && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  startData();
  startSync();
})();
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { store.refresh(); scheduleSync(0); } });
if ("serviceWorker" in navigator && window.isSecureContext) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("Service worker:", e)));
})();
