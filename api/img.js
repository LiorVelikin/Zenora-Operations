// Fetches a Shopify product photo for the Excel / PDF export (the browser can't read
// cdn.shopify.com images directly because of CORS). Only Shopify image hosts are allowed.
import { roleOf, send } from './_lib.js';

const ALLOWED = /^https:\/\/(cdn\.shopify\.com|[a-z0-9-]+\.myshopify\.com|[a-z0-9.-]*shopifycdn\.(com|net))\//i;

export default async function handler(req, res) {
  if (!roleOf(req)) return send(res, 401, { error: 'Wrong code' });
  const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
  if (!ALLOWED.test(u)) return send(res, 400, { error: 'Not a Shopify image' });
  try {
    const r = await fetch(u, { headers: { Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5' } });
    if (!r.ok) return send(res, 502, { error: `Image ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    res.statusCode = 200;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.end(buf);
  } catch (e) {
    send(res, 502, { error: e.message });
  }
}
