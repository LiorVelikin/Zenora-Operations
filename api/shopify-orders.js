// GET /api/shopify-orders?from=YYYY-MM-DD&to=YYYY-MM-DD  or  ?names=#1496,#1490  (admin only)
import { roleOf, send, shopifyToken } from './_lib.js';

const QUERY = `query($after: String, $q: String) {
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

export default async function handler(req, res) {
  if (roleOf(req) !== 'admin') return send(res, 403, { error: 'Only the admin can pull from Shopify' });
  try {
    const p = new URL(req.url, 'http://x').searchParams;
    const names = (p.get('names') || '').split(',').map((x) => x.trim()).filter(Boolean);
    const from = p.get('from'); const to = p.get('to');
    const q = names.length ? names.map((n) => `name:${n.startsWith('#') ? n : `#${n}`}`).join(' OR ')
      : `created_at:>=${from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)}${to ? ` created_at:<${to}` : ''}`;
    const token = await shopifyToken();
    const version = process.env.SHOPIFY_API_VERSION || '2026-10';
    const all = []; let after = null;
    for (let page = 0; page < 5; page++) {
      const r = await fetch(`https://${process.env.SHOPIFY_STORE}/admin/api/${version}/graphql.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
        body: JSON.stringify({ query: QUERY, variables: { q, after } }),
      });
      const j = await r.json();
      if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
      const conn = j.data.orders;
      all.push(...conn.nodes);
      if (!conn.pageInfo.hasNextPage || names.length) break;
      after = conn.pageInfo.endCursor;
    }
    send(res, 200, all);
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
