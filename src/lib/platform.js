// Everything that talks to the outside world lives here, so the live version
// only has to swap these functions (Shopify API route, real downloads, images).
import { snapshotAsGraphql } from '../snapshot.js';
import { api } from './remote.js';

const inClaude = () => typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function';
export const IS_PREVIEW = typeof window !== 'undefined' && !!window.claude;

const ORDERS_QUERY = `query($after: String, $q: String) {
  orders(first: 100, after: $after, sortKey: CREATED_AT, reverse: true, query: $q) {
    pageInfo { hasNextPage endCursor }
    nodes { id name createdAt cancelledAt displayFinancialStatus displayFulfillmentStatus note email phone
      shippingAddress { name phone city address1 address2 }
      customer { displayName defaultPhoneNumber { phoneNumber } }
      fulfillments(first: 3) { createdAt status }
      lineItems(first: 30) { nodes { id title variantTitle quantity unfulfilledQuantity image { url }
        variant { selectedOptions { name value } } product { id handle title } } } }
  }
}`;

function parsePayload(payload) {
  if (payload && typeof payload === 'object') return payload;
  const text = String(payload || '');
  const i = text.indexOf('{');
  if (i < 0) throw Object.assign(new Error(text.slice(0, 200) || 'Empty answer from Shopify'), { code: 'bad_payload' });
  return JSON.parse(text.slice(i));
}

// Turn "1496, #1490 1488" into ['#1496', '#1490', '#1488'].
export function parseOrderNumbers(text) {
  return [...new Set((String(text).match(/\d{3,}/g) || []).map((n) => `#${n}`))];
}

// Pull orders: either the last `days` days, or specific order numbers.
// Returns { orders, source }.
// from / to: 'YYYY-MM-DD' (inclusive).
export async function pullShopifyOrders({ days = 60, names = null, from = null, to = null } = {}) {
  const since = from || new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const until = to ? new Date(new Date(to).getTime() + 86400000).toISOString().slice(0, 10) : null;
  const q = names?.length ? names.map((n) => `name:${n}`).join(' OR ') : `created_at:>=${since}${until ? ` created_at:<${until}` : ''}`;

  if (inClaude()) {
    const mcp = await window.claude.use('mcp');
    if (!mcp) throw Object.assign(new Error('Shopify connection is not available in this view.'), { code: 'no_mcp' });
    const all = [];
    let after = null;
    for (let page = 0; page < 5; page++) {
      const vars = { q };
      if (after) vars.after = after;
      const res = await mcp.callTool('Shopify', 'graphql_query', { query: ORDERS_QUERY, variables: vars, first: 100 }, { cache: false });
      const json = parsePayload(res.payload);
      const conn = json?.data?.orders;
      if (!conn) throw Object.assign(new Error('Unexpected answer from Shopify'), { code: 'bad_payload' });
      all.push(...conn.nodes);
      if (!conn.pageInfo?.hasNextPage || names?.length) break;
      after = conn.pageInfo.endCursor;
    }
    return { orders: all, source: 'Shopify (live)' };
  }

  // Live version: server route that holds the Shopify Admin API key.
  const orders = await api(`/api/shopify-orders?${names?.length ? `names=${encodeURIComponent(names.join(','))}` : `from=${since}${until ? `&to=${until}` : ''}`}`);
  return { orders, source: 'Shopify' };
}

export function snapshotOrders(names = null, from = null, to = null) {
  let all = snapshotAsGraphql();
  if (names?.length) all = all.filter((o) => names.includes(o.name));
  if (from) all = all.filter((o) => o.createdAt.slice(0, 10) >= from);
  if (to) all = all.filter((o) => o.createdAt.slice(0, 10) <= to);
  return { orders: all, source: 'Snapshot of 19 Nov' };
}

// ---------- ask Claude (smart Excel reading) ----------
export async function getSampler() {
  if (!inClaude()) return null;
  try { return await window.claude.use('sample'); } catch { return null; }
}


export function describePullError(e) {
  const code = e?.code;
  if (code === 'needs_reauth') return 'Your Shopify connection needs to be reconnected in claude.ai Settings → Connectors.';
  if (code === 'server_not_connected') return 'Shopify is not connected to your Claude account (Settings → Connectors).';
  if (code === 'approval_required' || code === 'not_in_manifest') return 'This page needs your OK to read Shopify. Press the button again and allow it.';
  if (code === 'no_mcp' || code === 'not_granted' || code === 'capability_disabled') return 'The live Shopify pull only works when you open this page in Claude.';
  if (code === 'server_unavailable' || code === 'upstream_error') return 'Shopify did not answer in time. Try again in a moment.';
  return e?.message || 'Could not reach Shopify.';
}

// ---------- downloads ----------
export async function saveFile(filename, blob) {
  if (inClaude()) {
    const dl = await window.claude.use('downloads');
    if (!dl) throw new Error('Downloads are not available in this view.');
    try {
      await dl.save({ filename, data: blob });
      return true;
    } catch (e) {
      if (e?.code === 'declined') return false;
      throw new Error(e?.message || 'Download failed');
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

// ---------- images ----------
// Product photos come from Shopify's CDN. The preview frame blocks outside
// images, so callers must handle null.
export function imageUrl(url, width = 600) {
  if (url && url.startsWith('data:')) return url; // photo uploaded in the app
  if (!url || IS_PREVIEW) return null;
  return url.includes('?') ? `${url}&width=${width}` : `${url}?width=${width}`;
}

export async function imageAsBase64(url, width = 300) {
  if (url && url.startsWith('data:')) return { dataUrl: url, ext: /image\/png/.test(url) ? 'png' : 'jpeg' };
  const u = imageUrl(url, width);
  if (!u) return null;
  try {
    const r = await fetch(u);
    if (!r.ok) return null;
    const blob = await r.blob();
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    const ext = /png/.test(blob.type) ? 'png' : 'jpeg';
    // jsPDF/ExcelJS handle png/jpeg; convert others (webp) through a canvas.
    if (!/png|jpe?g/.test(blob.type)) {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      return { dataUrl: c.toDataURL('image/jpeg', 0.85), ext: 'jpeg' };
    }
    return { dataUrl, ext };
  } catch { return null; }
}

// Shrink an uploaded photo to max 600px JPEG so it stays light.
export async function compressImage(file, max = 600) {
  const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That file is not an image')); i.src = dataUrl; });
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}
