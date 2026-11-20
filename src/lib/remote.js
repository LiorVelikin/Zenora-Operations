// Live mode: the app's state lives in the shared database (via /api).
// Every local change is sent as small "entity" upserts; other people's
// changes are pulled every few seconds.
const KEY_STORE = 'zenora-key';

export function getKey() {
  try {
    const p = new URLSearchParams(location.search);
    const fromLink = p.get('s');
    if (fromLink) { localStorage.setItem(KEY_STORE, fromLink); history.replaceState(null, '', location.pathname + location.hash); }
    return localStorage.getItem(KEY_STORE) || '';
  } catch { return ''; }
}
export function setKey(k) { try { k ? localStorage.setItem(KEY_STORE, k) : localStorage.removeItem(KEY_STORE); } catch { /* ignore */ } }

export async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', 'x-zenora-key': getKey(), ...(opts.headers || {}) } });
  const text = await r.text();
  let body; try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text.slice(0, 200) }; }
  if (!r.ok) throw Object.assign(new Error(body.error || `Server error ${r.status}`), { status: r.status });
  return body;
}

// ---- state <-> entities ----
const COLLECTIONS = { orders: 'order', lines: 'line', pos: 'po', shipments: 'shipment' };
const META = ['counters', 'productDefaults', 'dismissed', 'supplierName', 'lastPullAt', 'lastPullSource'];
const priceId = (p) => `${p.at}|${p.key}`;
const logId = (x) => x.id || `${x.at}|${x.orderId}|${String(x.text).slice(0, 40)}`;

export function toEntities(s) {
  const out = new Map();
  for (const [col, kind] of Object.entries(COLLECTIONS)) {
    for (const [id, data] of Object.entries(s[col] || {})) out.set(`${kind}|${id}`, { kind, id, data });
  }
  (s.prices || []).forEach((p) => { const id = priceId(p); out.set(`price|${id}`, { kind: 'price', id, data: p }); });
  (s.log || []).forEach((x) => { const id = logId(x); out.set(`log|${id}`, { kind: 'log', id, data: { ...x, id } }); });
  META.forEach((m) => { if (s[m] !== undefined) out.set(`meta|${m}`, { kind: 'meta', id: m, data: { v: s[m] } }); });
  return out;
}

// cheap fingerprint: images compared by length + tail, not the whole data URL
function fp(data) {
  return JSON.stringify(data, (k, v) => (typeof v === 'string' && v.length > 500 ? `${v.length}:${v.slice(-40)}` : v));
}

export function diff(prev, next) {
  const a = toEntities(prev); const b = toEntities(next);
  const upserts = []; const deletes = [];
  for (const [k, e] of b) { const old = a.get(k); if (!old || fp(old.data) !== fp(e.data)) upserts.push(e); }
  for (const [k, e] of a) if (!b.has(k)) deletes.push({ kind: e.kind, id: e.id });
  return { upserts, deletes };
}

// apply rows from the server onto a state object (mutates it)
export function applyRows(s, rows, skip = new Set()) {
  let changed = false;
  for (const r of rows) {
    const k = `${r.kind}|${r.id}`;
    if (skip.has(k)) continue;
    changed = true;
    const col = Object.keys(COLLECTIONS).find((c) => COLLECTIONS[c] === r.kind);
    if (col) {
      if (r.deleted || !r.data) delete s[col][r.id]; else s[col][r.id] = r.data;
    } else if (r.kind === 'price') {
      s.prices = (s.prices || []).filter((p) => priceId(p) !== r.id);
      if (!r.deleted && r.data) s.prices.push(r.data);
    } else if (r.kind === 'log') {
      s.log = (s.log || []).filter((x) => logId(x) !== r.id);
      if (!r.deleted && r.data) s.log.push(r.data);
    } else if (r.kind === 'meta' && !r.deleted && r.data) {
      s[r.id] = r.data.v;
    }
  }
  if (changed) {
    s.prices.sort((x, y) => String(y.at).localeCompare(String(x.at)));
    s.log.sort((x, y) => String(y.at).localeCompare(String(x.at)));
  }
  return changed;
}
