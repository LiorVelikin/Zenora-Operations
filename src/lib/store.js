// App state + every action the 4 departments can take.
// Preview: kept in this browser (localStorage). Live version swaps the
// persistence for a shared database; the actions stay the same.
import { useSyncExternalStore } from 'react';
import { linesFromOrder, normalizeOrder, priceKey, boxFor, fullSize, giftPlating } from './parse.js';
import { stageIndex } from './status.js';
import { api, diff, applyRows } from './remote.js';

// Preview (inside Claude): data stays in this browser. Live website: shared database.
const LIVE = typeof window !== 'undefined' && !window.claude;

const KEY = 'zenora-ops-preview-v3';

const SEED_PRODUCT_DEFAULTS = {
  8536372019372: 'gold', // The Essential Brilliance Set (gold)
  8536377196716: 'silver', // The Essential Brilliance Set (white gold)
};

const empty = () => ({
  orders: {},
  lines: {},
  pos: {},
  shipments: {},
  prices: [],
  log: [],
  productDefaults: { ...SEED_PRODUCT_DEFAULTS },
  counters: { po: 0, shipment: 0 },
  lastPullAt: null,
  lastPullSource: null,
  supplierName: 'JINGJING JEWELRY CO.,LTD',
});

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...empty(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable: keep in memory */ }
  return empty();
}

let state = LIVE ? empty() : load();
const listeners = new Set();
export let storageFull = false;
const notifyAll = () => listeners.forEach((l) => l());
function commit(next) {
  const prev = state;
  state = next;
  if (LIVE) queueSync(prev, next);
  else { try { localStorage.setItem(KEY, JSON.stringify(state)); storageFull = false; } catch (e) { storageFull = true; } }
  notifyAll();
}

// ---------- live sync ----------
export const sync = { status: 'idle', loaded: false, lastSeq: 0, error: '' };
const pending = new Map(); // "kind|id" -> {kind,id,data} | {kind,id,del:true}
let flushTimer = null; let flushing = false; let pollTimer = null;
const setSync = (patch) => { Object.assign(sync, patch); notifyAll(); };

function queueSync(prev, next) {
  const { upserts, deletes } = diff(prev, next);
  upserts.forEach((u) => pending.set(`${u.kind}|${u.id}`, u));
  deletes.forEach((d) => pending.set(`${d.kind}|${d.id}`, { ...d, del: true }));
  if (pending.size) { setSync({ status: 'saving' }); clearTimeout(flushTimer); flushTimer = setTimeout(flush, 400); }
}

async function flush() {
  if (flushing || !pending.size) return;
  flushing = true;
  const items = [...pending.entries()];
  // batches of ~2.5 MB so big photos never hit the server limit
  const batches = []; let cur = []; let size = 0;
  for (const [k, v] of items) {
    const len = v.del ? 50 : JSON.stringify(v.data).length;
    if (cur.length && (size + len > 2500000 || cur.length >= 300)) { batches.push(cur); cur = []; size = 0; }
    cur.push([k, v]); size += len;
  }
  if (cur.length) batches.push(cur);
  try {
    for (const b of batches) {
      const upserts = b.filter(([, v]) => !v.del).map(([, v]) => ({ kind: v.kind, id: v.id, data: v.data }));
      const deletes = b.filter(([, v]) => v.del).map(([, v]) => ({ kind: v.kind, id: v.id }));
      await api('/api/sync', { method: 'POST', body: JSON.stringify({ upserts, deletes }) });
      b.forEach(([k, v]) => { if (pending.get(k) === v) pending.delete(k); });
    }
    setSync({ status: pending.size ? 'saving' : 'saved', error: '' });
  } catch (e) {
    setSync({ status: 'offline', error: e.message });
    clearTimeout(flushTimer); flushTimer = setTimeout(flush, 5000);
  } finally {
    flushing = false;
    if (pending.size && sync.status !== 'offline') { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 300); }
  }
}

export async function pull(full = false) {
  const since = full ? 0 : Math.max(0, sync.lastSeq - 20);
  const r = await api(`/api/state?since=${since}`);
  const next = full ? empty() : structuredClone(state);
  const changed = applyRows(next, r.rows, full ? new Set() : new Set(pending.keys()));
  sync.lastSeq = r.seq;
  if (full || changed) { state = next; }
  setSync({ loaded: true, status: pending.size ? sync.status : 'saved', error: '' });
}

export function startLive() {
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === 'visible') pull().catch((e) => setSync({ status: 'offline', error: e.message })); }, 8000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull().catch(() => {}); });
  window.addEventListener('beforeunload', (e) => { if (pending.size) { flush(); e.preventDefault(); } });
  return pull(true);
}

// Replace everything (starting data / restoring a backup). Uploads all of it.
export function replaceAll(data) {
  const next = { ...empty(), ...structuredClone(data) };
  commit(next);
}
export function exportAll() { return structuredClone(state); }
function mutate(fn) {
  const next = structuredClone(state);
  const result = fn(next);
  commit(next);
  return result;
}
export const getState = () => state;
export function useStore() {
  return useSyncExternalStore((cb) => (listeners.add(cb), () => listeners.delete(cb)), () => state);
}

const now = () => new Date().toISOString();
function log(s, orderId, text, who = 'system') {
  s.log.unshift({ id: `${Date.now()}${Math.floor(Math.random() * 1e6)}`, at: now(), orderId, text, who });
  if (s.log.length > 3000) s.log.length = 3000;
}
function setStatus(s, line, status) {
  line.status = status;
  line.statusAt = now();
}

// ---------- selectors ----------
export const linesOfOrder = (s, orderId) => Object.values(s.lines).filter((l) => l.orderId === orderId);
export const linesOfPO = (s, poId) => Object.values(s.lines).filter((l) => l.poId === poId).sort((a, b) => (a.serNo || 0) - (b.serNo || 0) || a.id.localeCompare(b.id));
export const isGift = (l) => !!l?.flags?.includes('gift');
const giftKey = (l) => [l.item, l.plating || '', l.carat || '', l.size || ''].join('|');

// Ser No. + code for every line on a PO. Customer items first (by order),
// then identical free-gift items combined into ONE row (same Ser No., summed qty).
export function renumberPO(s, poId) {
  const po = s.pos[poId];
  const lines = Object.values(s.lines).filter((l) => l.poId === poId);
  const byOrder = (a, b) => String(a.orderName).localeCompare(String(b.orderName)) || a.id.localeCompare(b.id);
  let n = 0;
  const letters = {};
  lines.filter((l) => !isGift(l)).sort(byOrder).forEach((l) => {
    l.serNo = ++n;
    letters[l.orderName] = (letters[l.orderName] || 0) + 1;
    l.ref = `${String(l.orderName).replace('#', '').toUpperCase()}-${String.fromCharCode(64 + letters[l.orderName])}`;
  });
  const groups = {};
  lines.filter(isGift).sort(byOrder).forEach((l) => (groups[giftKey(l)] ||= []).push(l));
  Object.values(groups).forEach((g) => { n++; g.forEach((l) => { l.serNo = n; l.ref = `${po?.number || 'PO'}-G${n}`; }); });
}

// One row per supplier line (gift groups merged).
export function poRows(s, poId) {
  const map = new Map();
  linesOfPO(s, poId).forEach((l) => { if (!map.has(l.serNo)) map.set(l.serNo, []); map.get(l.serNo).push(l); });
  return [...map.entries()].map(([serNo, lines]) => {
    const f = lines[0];
    return {
      serNo, ref: f.ref, lines, first: f, isGift: isGift(f), ids: lines.map((l) => l.id),
      qty: lines.reduce((t, l) => t + (l.qty || 1), 0), item: f.item.replace(/\s*\(GIFT\)/, ''), plating: f.plating, carat: f.carat, size: f.size,
      price: f.price, orders: [...new Set(lines.map((l) => l.orderName))],
      supplierNote: [...new Set(lines.map((l) => l.supplierNote).filter(Boolean))].join(' · '),
    };
  });
}

export function renumberPOAction(poId) { mutate((s) => renumberPO(s, poId)); }
export function setRowField(ids, patch) { mutate((s) => { ids.forEach((id) => s.lines[id] && Object.assign(s.lines[id], patch)); }); }

export function poStatus(s, po) {
  const lines = linesOfPO(s, po.id);
  if (po.status === 'draft') return { id: 'draft', label: 'Draft', tone: 'muted' };
  if (po.status === 'sent' && !po.submittedAt) return { id: 'sent', label: 'Waiting for prices', tone: 'amber' };
  if (po.status === 'sent' && po.submittedAt) return { id: 'priced', label: 'Check prices', tone: 'amber' };
  if (!lines.length) return { id: 'empty', label: 'Empty', tone: 'muted' };
  const idx = lines.map((l) => stageIndex(l.status)).filter((i) => i >= 0);
  const min = Math.min(...idx);
  const max = Math.max(...idx);
  if (min >= stageIndex('arrived')) return { id: 'received', label: 'Received', tone: 'green' };
  const shipped = lines.filter((l) => stageIndex(l.status) >= stageIndex('shipped')).length;
  if (max >= stageIndex('shipped')) return { id: 'confirmed', label: `Confirmed · ${shipped}/${lines.length} shipped`, tone: 'blue' };
  return { id: 'confirmed', label: 'Confirmed', tone: 'blue' };
}

export function poTotals(s, poId) {
  const lines = linesOfPO(s, poId);
  const sub = lines.reduce((t, l) => t + (Number(l.price) || 0) * (l.qty || 1), 0);
  const po = s.pos[poId];
  const ship = Number(po?.shipping) || 0;
  const priced = lines.filter((l) => l.price !== '' && l.price != null).length;
  return { sub, ship, total: sub + ship, priced, count: lines.length };
}

export function lastPrice(s, line) {
  const k = priceKey(line);
  return s.prices.find((p) => p.key === k) || null;
}

// ---------- Shopify pull ----------
export function applyShopifyOrders(shopifyOrders, source, { manual = false, syncOnly = false } = {}) {
  return mutate((s) => {
    s.dismissed ||= {};
    const summary = { newOrders: 0, newLines: 0, fulfilled: 0, cancelled: 0, already: [], skipped: [], added: [] };
    for (const so of shopifyOrders) {
      const o = normalizeOrder(so);
      const existing = s.orders[o.id];
      s.orders[o.id] = { ...(existing || {}), ...o };
      const have = linesOfOrder(s, o.id);

      if (manual) {
        if (o.shopifyState === 'cancelled') { summary.skipped.push(`${o.name} is cancelled/refunded`); continue; }
        const active = have.filter((l) => l.status !== 'done' && l.status !== 'cancelled');
        if (active.length) { summary.already.push(o.name); continue; }
        delete s.dismissed[o.id];
        const round = have.length ? `-r${1 + Math.max(0, ...have.map((l) => Number((l.id.match(/-r(\d+)$/) || [])[1] || 0)))}` : '';
        const lines = linesFromOrder(so, s.productDefaults);
        lines.forEach((l) => {
          const id = l.id + round;
          s.lines[id] = { ...l, id, status: 'new', statusAt: now(), price: null, poId: null, serNo: null, supplierNote: '', reorder: o.shopifyState === 'fulfilled' };
        });
        summary.newOrders++; summary.newLines += lines.length; summary.added.push(o.name);
        log(s, o.id, round ? 'Pulled again manually (re-order)' : 'Pulled manually from Shopify');
        continue;
      }
      if (s.dismissed[o.id]) continue;
      if (syncOnly && !existing) { delete s.orders[o.id]; continue; }

      if (!existing && !have.length) {
        if (o.shopifyState === 'unpaid') continue;
        const lines = linesFromOrder(so, s.productDefaults);
        const status = o.shopifyState === 'open' ? 'new' : o.shopifyState === 'fulfilled' ? 'done' : 'cancelled';
        lines.forEach((l) => {
          s.lines[l.id] = { ...l, status, statusAt: o.fulfilledAt || o.createdAt, price: null, poId: null, serNo: null, supplierNote: '' };
        });
        if (o.shopifyState === 'open') {
          summary.newOrders++;
          summary.newLines += lines.length;
          log(s, o.id, `Order pulled from Shopify (${lines.length} item${lines.length === 1 ? '' : 's'} to purchase)`);
        }
        continue;
      }

      // Sync later Shopify changes onto existing lines.
      if (o.shopifyState === 'fulfilled') {
        let changed = false;
        have.forEach((l) => { if (!l.reorder && l.status !== 'done' && l.status !== 'cancelled') { setStatus(s, l, 'done'); changed = true; } });
        if (changed) { summary.fulfilled++; log(s, o.id, 'Marked fulfilled in Shopify: order sent to customer'); }
      }
      if (o.shopifyState === 'cancelled') {
        let changed = false;
        have.forEach((l) => { if (l.status !== 'cancelled' && l.status !== 'done') { l.cancelledFrom = l.status; setStatus(s, l, 'cancelled'); changed = true; } });
        if (changed) { summary.cancelled++; log(s, o.id, 'Order cancelled or refunded in Shopify'); }
      }
    }
    s.lastPullAt = now();
    s.lastPullSource = source;
    return summary;
  });
}

// ---------- purchasing (Lior) ----------
export const updateLine = (id, patch) => mutate((s) => {
  const l = s.lines[id];
  Object.assign(l, patch);
  if ('plating' in patch && !isGift(l)) syncGiftMetal(s, l.orderId);
  if (l.poId && (isGift(l) || 'plating' in patch)) renumberPO(s, l.poId);
});

// The free gift takes the order's metal, unless Lior set it by hand.
function syncGiftMetal(s, orderId) {
  const lines = Object.values(s.lines).filter((l) => l.orderId === orderId);
  const metal = giftPlating(lines.filter((l) => !isGift(l)).map((l) => l.plating));
  lines.filter((l) => isGift(l) && l.platingSource !== 'manual').forEach((g) => {
    g.plating = metal; g.platingSource = 'order';
    if (g.poId) renumberPO(s, g.poId);
  });
}

export function setPlating(lineId, plating, remember) {
  mutate((s) => {
    const line = s.lines[lineId];
    line.plating = plating;
    line.platingSource = 'manual';
    if (!isGift(line)) syncGiftMetal(s, line.orderId);
    if (line.poId) renumberPO(s, line.poId);
    if (remember && line.productId && !line.flags?.includes('gift')) {
      s.productDefaults[line.productId] = plating;
      Object.values(s.lines).forEach((l) => {
        if (l.productId === line.productId && !l.plating && l.status === 'new') { l.plating = plating; l.platingSource = 'remembered'; syncGiftMetal(s, l.orderId); }
      });
    }
  });
}

export function markInStock(lineIds) {
  mutate((s) => {
    lineIds.forEach((id) => {
      const l = s.lines[id];
      l.fromStock = true;
      setStatus(s, l, 'arrived');
      log(s, l.orderId, `${l.item} taken from stock → ready to pack`);
    });
  });
}

export function undoStock(lineId) {
  mutate((s) => { const l = s.lines[lineId]; l.fromStock = false; setStatus(s, l, 'new'); });
}

export function createPO(lineIds) {
  return mutate((s) => {
    s.counters.po += 1;
    const number = `PO-${String(s.counters.po).padStart(4, '0')}`;
    const id = `po${Date.now()}`;
    s.pos[id] = { id, number, status: 'draft', createdAt: now(), shipping: null, submittedAt: null, confirmedAt: null, sentAt: null, note: '' };
    lineIds.forEach((x) => { const l = s.lines[x]; l.poId = id; l.price = null; });
    renumberPO(s, id);
    return id;
  });
}

export function addLinesToPO(poId, lineIds) {
  mutate((s) => {
    lineIds.forEach((x) => { const l = s.lines[x]; l.poId = poId; l.price = null; });
    renumberPO(s, poId);
  });
}

export function removeFromPO(lineId) {
  mutate((s) => {
    const l = s.lines[lineId];
    const poId = l.poId;
    l.poId = null; l.serNo = null; l.ref = null; l.price = null;
    setStatus(s, l, 'new');
    renumberPO(s, poId);
  });
}

// Delete a PO at any stage. Items not shipped yet go back to "New";
// items already shipped / at the studio keep their step.
export function deletePO(poId) {
  mutate((s) => {
    const po = s.pos[poId];
    linesOfPO(s, poId).forEach((l) => {
      l.poId = null; l.serNo = null;
      if (l.status === 'new' || l.status === 'ordered') { l.price = null; setStatus(s, l, 'new'); }
    });
    s.prices = s.prices.filter((p) => p.po !== po.number);
    delete s.pos[poId];
  });
}

export function sendPO(poId) {
  mutate((s) => {
    const po = s.pos[poId];
    po.status = 'sent'; po.sentAt = now();
    const orders = new Set();
    linesOfPO(s, poId).forEach((l) => { setStatus(s, l, 'ordered'); orders.add(l.orderId); });
    orders.forEach((o) => log(s, o, `Ordered from supplier on ${po.number}`));
  });
}

export function setPOField(poId, patch) { mutate((s) => Object.assign(s.pos[poId], patch)); }
export function togglePaid(poId) { mutate((s) => { const po = s.pos[poId]; po.paidAt = po.paidAt ? null : now(); }); }

// ---------- supplier ----------
export function supplierSetPrice(lineId, price) {
  mutate((s) => { s.lines[lineId].price = price === '' ? null : Number(price); });
}

export function submitPrices(poId, who = 'supplier') {
  mutate((s) => {
    const po = s.pos[poId];
    po.submittedAt = now();
    po.submittedBy = who;
    const orders = new Set();
    linesOfPO(s, poId).forEach((l) => orders.add(l.orderId));
    orders.forEach((o) => log(s, o, `Supplier priced ${po.number}`, who));
  });
}

export function reopenPrices(poId) {
  mutate((s) => {
    const po = s.pos[poId];
    po.submittedAt = null;
  });
}

export function confirmPO(poId) {
  mutate((s) => {
    const po = s.pos[poId];
    po.status = 'confirmed'; po.confirmedAt = now();
    const orders = new Set();
    linesOfPO(s, poId).forEach((l) => {
      orders.add(l.orderId);
      if (l.price != null) {
        s.prices.unshift({ key: priceKey(l), item: l.item.replace(/\s*\(GIFT\)/, ''), plating: l.plating, size: fullSize(l), price: l.price, qty: l.qty, po: po.number, at: po.confirmedAt });
      }
    });
    orders.forEach((o) => log(s, o, `${po.number} prices confirmed`));
  });
}

export function createShipment(lineIds, tracking, carrier = 'DHL') {
  return mutate((s) => {
    s.counters.shipment += 1;
    const id = `sh${Date.now()}`;
    s.shipments[id] = { id, number: `PKG-${String(s.counters.shipment).padStart(3, '0')}`, tracking, carrier, shippedAt: now(), arrivedAt: null, lineIds: [...lineIds], missing: [] };
    const orders = new Set();
    lineIds.forEach((x) => { const l = s.lines[x]; l.shipmentId = id; setStatus(s, l, 'shipped'); orders.add(l.orderId); });
    orders.forEach((o) => log(s, o, `Shipped by supplier (${carrier}${tracking ? ' ' + tracking : ''})`, 'supplier'));
    return id;
  });
}

// ---------- shipping (what the supplier still has to send) ----------
// One row per supplier line still to ship (gift groups merged), across all POs.
export function openShipRows(s) {
  const map = new Map();
  Object.values(s.lines).filter((l) => l.status === 'ordered' && l.poId && s.pos[l.poId])
    .sort((a, b) => String(s.pos[a.poId].number).localeCompare(String(s.pos[b.poId].number)) || (a.serNo || 0) - (b.serNo || 0))
    .forEach((l) => { const k = `${l.poId}|${l.serNo}`; if (!map.has(k)) map.set(k, []); map.get(k).push(l); });
  return [...map.entries()].map(([k, lines]) => {
    const f = lines[0];
    const po = s.pos[f.poId];
    return { key: k, po: po.number, poId: po.id, serNo: f.serNo, ref: f.ref, lines, ids: lines.map((l) => l.id), first: f, isGift: isGift(f),
      item: f.item.replace(/\s*\(GIFT\)/, ''), plating: f.plating, carat: f.carat, size: f.size, qty: lines.reduce((t, l) => t + (l.qty || 1), 0),
      orders: [...new Set(lines.map((l) => l.orderName))], remake: lines.some((l) => l.remake) };
  });
}

function splitLine(s, line, keepQty) {
  const rest = line.qty - keepQty;
  if (rest <= 0) return null;
  line.qty = keepQty;
  let n = 1; while (s.lines[`${line.id}-p${n}`]) n++;
  const copy = { ...structuredClone(line), id: `${line.id}-p${n}`, qty: rest };
  s.lines[copy.id] = copy;
  return copy;
}

// picks: [{ ids, qty }]  qty = how many pieces of that row are in the box.
export function shipItems(picks, tracking = '', carrier = 'DHL', when = null, source = 'supplier') {
  return mutate((s) => {
    const lineIds = [];
    picks.forEach(({ ids, qty }) => {
      let left = Number(qty) || 0;
      const lines = ids.map((id) => s.lines[id]).filter((l) => l && l.status === 'ordered')
        .sort((a, b) => (s.orders[a.orderId]?.createdAt || '').localeCompare(s.orders[b.orderId]?.createdAt || ''));
      for (const l of lines) {
        if (left <= 0) break;
        if (l.qty > left) splitLine(s, l, left);
        left -= l.qty;
        lineIds.push(l.id);
      }
    });
    if (!lineIds.length) return null;
    s.counters.shipment += 1;
    const id = `sh${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const at = when ? new Date(when).toISOString() : now();
    s.shipments[id] = { id, number: `PKG-${String(s.counters.shipment).padStart(3, '0')}`, tracking, carrier, shippedAt: at, arrivedAt: null, lineIds, missing: [], source };
    const orders = new Set();
    lineIds.forEach((x) => { const l = s.lines[x]; l.shipmentId = id; delete l.remake; setStatus(s, l, 'shipped'); orders.add(l.orderId); });
    orders.forEach((o) => log(s, o, `Shipped by supplier in ${s.shipments[id].number}${tracking ? ` (${carrier} ${tracking})` : ''}`, source));
    return s.shipments[id].number;
  });
}

export function setShipmentField(id, patch) { mutate((s) => Object.assign(s.shipments[id], patch)); }

// ---------- packing ----------
export function receiveShipment(shipmentId, receivedIds) {
  mutate((s) => {
    const sh = s.shipments[shipmentId];
    sh.arrivedAt = now();
    sh.missing = sh.lineIds.filter((x) => !receivedIds.includes(x));
    const orders = new Set();
    receivedIds.forEach((x) => { const l = s.lines[x]; if (l.status === 'shipped') { setStatus(s, l, 'arrived'); orders.add(l.orderId); } });
    sh.missing.forEach((x) => { s.lines[x].missingIn = sh.number; log(s, s.lines[x].orderId, `${s.lines[x].item} was missing from ${sh.number}`, 'packing'); });
    orders.forEach((o) => log(s, o, `Arrived at studio (${sh.number})`, 'packing'));
  });
}

export function receiveLine(lineId) {
  mutate((s) => { const l = s.lines[lineId]; delete l.missingIn; setStatus(s, l, 'arrived'); log(s, l.orderId, `${l.item} arrived at studio`, 'packing'); });
}
export function unreceiveLine(lineId) {
  mutate((s) => { const l = s.lines[lineId]; setStatus(s, l, l.shipmentId ? 'shipped' : 'ordered'); });
}

export function packOrder(orderId) {
  mutate((s) => {
    const t = now();
    linesOfOrder(s, orderId).forEach((l) => { if (l.status === 'arrived') { setStatus(s, l, 'done'); l.packedAt = t; } });
    s.orders[orderId].handedAt = t;
    log(s, orderId, 'Packed and sent', 'packing');
  });
}

export function unpackOrder(orderId) {
  mutate((s) => {
    const o = s.orders[orderId];
    linesOfOrder(s, orderId).forEach((l) => { if (l.status === 'done' && l.packedAt && l.packedAt === o.handedAt) { setStatus(s, l, 'arrived'); l.packedAt = null; } });
    o.handedAt = null;
    log(s, orderId, 'Packing undone', 'packing');
  });
}

// Take an order off the New list. Auto-pull won't bring it back; a manual pull will.
export function dismissOrder(orderId) {
  mutate((s) => {
    s.dismissed ||= {};
    s.dismissed[orderId] = true;
    linesOfOrder(s, orderId).forEach((l) => { if (l.status === 'new' && !l.poId) delete s.lines[l.id]; });
  });
}

// ---------- manual items ----------
// orderId: an order already in the system, or 'stock' for buying stock (no customer).
export function addManualItem({ orderId, item, category, plating, size, qty, supplierNote, customImage, poId }) {
  return mutate((s) => {
    let order = orderId !== 'stock' ? s.orders[orderId] : null;
    if (!order) {
      const id = `stock${Date.now()}`;
      order = s.orders[id] = { id, name: 'Stock', createdAt: now(), customer: 'For stock', phone: '', city: '', note: '', shopifyState: 'open', isStock: true };
    }
    const lid = `man${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const id = `${lid}-0`;
    const line = {
      id, orderId: order.id, orderName: order.name, lineItemId: lid, productId: null, shopifyTitle: item, image: null, customImage: customImage || null,
      plating, platingSource: 'manual', qty: Math.max(1, Number(qty) || 1), flags: ['manual'], item, category, size: size || '',
      box: boxFor(category, item), packUnit: lid, packLabel: item, status: 'new', statusAt: now(), price: null, poId: null, serNo: null, supplierNote: supplierNote || '',
    };
    s.lines[id] = line;
    if (poId && s.pos[poId]?.status === 'draft') { line.poId = poId; renumberPO(s, poId); }
    log(s, order.id, `Item added by hand: ${item}`);
    return id;
  });
}

// ---------- apply a supplier Excel (smart import) ----------
// rows: [{ lineId | null, createNew, price, shipped, image, plating, carat, size, qty, what }]
// confirm: the prices are agreed (already ordered) → POs confirmed, prices saved to history.
export function applyImport({ rows, shipping, confirm = true, fileName = '' }) {
  return mutate((s) => {
    const t = now();
    const touchedPOs = new Set();
    const shippedIds = [];
    let newPO = null;
    const ensureNewPO = () => {
      if (newPO) return newPO;
      s.counters.po += 1;
      const id = `po${Date.now()}`;
      newPO = s.pos[id] = { id, number: `PO-${String(s.counters.po).padStart(4, '0')}`, status: 'sent', createdAt: t, sentAt: t, submittedAt: t, submittedBy: 'excel import', confirmedAt: null, shipping: null, note: fileName ? `Imported from ${fileName}` : 'Imported from Excel' };
      return newPO;
    };
    rows.filter((r) => r.use).forEach((r) => {
      let line = r.lineId ? s.lines[r.lineId] : null;
      if (!line && r.createNew) {
        const order = Object.values(s.orders).find((o) => o.isStock && o.importStock) || (() => {
          const id = `stock${Date.now()}`;
          return (s.orders[id] = { id, name: 'Stock', createdAt: t, customer: 'For stock', phone: '', city: '', note: '', shopifyState: 'open', isStock: true, importStock: true });
        })();
        const lid = `man${Date.now()}${Math.floor(Math.random() * 100000)}`;
        line = s.lines[`${lid}-0`] = {
          id: `${lid}-0`, orderId: order.id, orderName: order.name, lineItemId: lid, productId: null, shopifyTitle: r.what, image: null, customImage: null,
          plating: r.plating || null, platingSource: 'manual', qty: r.qty || 1, flags: ['manual'], item: r.what || 'Item from supplier Excel', category: 'other',
          carat: r.carat || '', size: r.size || '', box: 'Medium square box', packUnit: lid, packLabel: r.what, status: 'new', statusAt: t, price: null, poId: null, serNo: null, supplierNote: '',
        };
      }
      if (!line) return;
      if (r.image && !line.supplierImage) line.supplierImage = r.image;
      if (r.price != null && !isNaN(r.price)) line.price = Number(r.price);
      if (!line.poId) {
        const po = ensureNewPO();
        line.poId = po.id;
      }
      touchedPOs.add(line.poId);
      if (line.status === 'new') setStatus(s, line, 'ordered');
      if (r.shipped && (line.status === 'ordered' || line.status === 'new')) shippedIds.push(line.id);
      log(s, line.orderId, `Supplier Excel: ${line.item}${r.price != null ? ` $${r.price}` : ''}${r.shipped ? ', marked shipped' : ''}`, 'excel import');
    });
    if (newPO) renumberPO(s, newPO.id);
    const shipTo = newPO || (touchedPOs.size ? s.pos[[...touchedPOs][0]] : null);
    if (shipTo && shipping != null && shipping !== '') shipTo.shipping = Number(shipping);

    touchedPOs.forEach((poId) => {
      const po = s.pos[poId];
      if (!po) return;
      if (po.status === 'draft') { po.status = 'sent'; po.sentAt = t; linesOfPO(s, poId).forEach((l) => { if (l.status === 'new') setStatus(s, l, 'ordered'); }); }
      po.submittedAt ||= t; po.submittedBy ||= 'excel import';
      if (confirm && po.status !== 'confirmed') {
        po.status = 'confirmed'; po.confirmedAt = t;
      }
      if (confirm) {
        linesOfPO(s, poId).forEach((l) => {
          if (l.price == null) return;
          const k = priceKey(l);
          if (!s.prices.some((p) => p.key === k && p.po === po.number)) s.prices.unshift({ key: k, item: l.item.replace(/\s*\(GIFT\)/, ''), plating: l.plating, size: fullSize(l), price: l.price, qty: l.qty, po: po.number, at: t });
        });
      }
    });

    if (shippedIds.length) {
      s.counters.shipment += 1;
      const id = `sh${Date.now()}`;
      s.shipments[id] = { id, number: `PKG-${String(s.counters.shipment).padStart(3, '0')}`, tracking: '', carrier: 'DHL', shippedAt: t, arrivedAt: null, lineIds: shippedIds, missing: [], fromExcel: true };
      shippedIds.forEach((x) => { s.lines[x].shipmentId = id; setStatus(s, s.lines[x], 'shipped'); });
    }
    return { po: newPO?.number || null, updatedPOs: [...touchedPOs].map((x) => s.pos[x]?.number).filter(Boolean), shipped: shippedIds.length, count: rows.filter((r) => r.use && (r.lineId || r.createNew)).length };
  });
}

// ---------- edit / delete anything (admin) ----------
export function sendForRemake(lineId, reason = '') {
  mutate((s) => {
    const l = s.lines[lineId];
    if (l.shipmentId && s.shipments[l.shipmentId]) s.shipments[l.shipmentId].lineIds = s.shipments[l.shipmentId].lineIds.filter((x) => x !== lineId);
    delete l.shipmentId; delete l.missingIn;
    l.remake = true;
    if (reason) l.supplierNote = `REMAKE: ${reason}${l.supplierNote ? ` · ${l.supplierNote}` : ''}`;
    setStatus(s, l, 'ordered');
    log(s, l.orderId, `${l.item} sent back to supplier for remake${reason ? ` (${reason})` : ''}`);
  });
}
export const updateOrder = (orderId, patch) => mutate((s) => {
  Object.assign(s.orders[orderId], patch);
  if (patch.name) Object.values(s.lines).filter((l) => l.orderId === orderId).forEach((l) => { l.orderName = patch.name; });
});

export function setLineStatus(lineId, status) {
  mutate((s) => { const l = s.lines[lineId]; setStatus(s, l, status); log(s, l.orderId, `${l.item}: step changed by hand`); });
}

export function deleteLine(lineId) {
  mutate((s) => {
    const l = s.lines[lineId];
    if (!l) return;
    delete s.lines[lineId];
    Object.values(s.shipments).forEach((sh) => { sh.lineIds = sh.lineIds.filter((x) => x !== lineId); });
    if (l.poId) renumberPO(s, l.poId);
    log(s, l.orderId, `${l.item} deleted`);
  });
}

export function deleteOrder(orderId) {
  mutate((s) => {
    const ids = linesOfOrder(s, orderId).map((l) => l.id);
    const pos = new Set(ids.map((id) => s.lines[id].poId).filter(Boolean));
    ids.forEach((id) => delete s.lines[id]);
    Object.values(s.shipments).forEach((sh) => { sh.lineIds = sh.lineIds.filter((x) => !ids.includes(x)); });
    pos.forEach((poId) => renumberPO(s, poId));
    s.dismissed ||= {};
    s.dismissed[orderId] = true;
    delete s.orders[orderId];
    s.log = s.log.filter((x) => x.orderId !== orderId);
  });
}

export function deleteShipment(shipmentId) {
  mutate((s) => {
    const sh = s.shipments[shipmentId];
    sh.lineIds.forEach((id) => { const l = s.lines[id]; if (!l) return; delete l.shipmentId; delete l.missingIn; if (l.status === 'shipped') setStatus(s, l, 'ordered'); });
    delete s.shipments[shipmentId];
  });
}

export function deletePrice(at, key) {
  mutate((s) => { s.prices = s.prices.filter((p) => !(p.at === at && p.key === key)); });
}

// ---------- maintenance ----------
export function resetAll() { commit(empty()); }
// Her filled PO Excel: prices (+ DHL) and any new "Shipped date" marks.
export function applyPOFile(poId, { matches = [], shipping = null, ships = [] }) {
  const po = state.pos[poId];
  if (matches.length || shipping != null) {
    mutate((s) => {
      matches.forEach(({ ids, price }) => ids.forEach((id) => { if (s.lines[id]) s.lines[id].price = price; }));
      if (shipping != null) s.pos[poId].shipping = shipping;
    });
    if (po.status === 'sent' && !po.submittedAt) submitPrices(poId, 'excel import');
  }
  const byDate = {};
  ships.forEach((x) => (byDate[x.date] ||= []).push(x));
  return Object.entries(byDate).sort().map(([date, xs]) => shipItems(xs.map((x) => ({ ids: x.ids, qty: x.qty })), '', 'DHL', date, 'excel')).filter(Boolean);
}

export function importPricesFromSheet(poId, matches, shipping) {
  mutate((s) => {
    matches.forEach(({ lineId, ids, price }) => { (ids || [lineId]).forEach((id) => { if (s.lines[id]) s.lines[id].price = price; }); });
    if (shipping != null) s.pos[poId].shipping = shipping;
  });
  submitPrices(poId, 'excel import');
}
