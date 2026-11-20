// Shared server helpers: database, roles, Shopify token.
import postgres from 'postgres';

let sqlClient = null;
export function db() {
  if (!sqlClient) {
    const url = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!url) throw new Error('Database is not connected (POSTGRES_URL missing).');
    sqlClient = postgres(url, { prepare: false, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', max: 1, idle_timeout: 20 });
  }
  return sqlClient;
}

let schemaReady = null;
export function ensureSchema() {
  if (!schemaReady) {
    const sql = db();
    schemaReady = (async () => {
      await sql`create sequence if not exists zenora_seq`;
      await sql`create table if not exists zenora_entities (
        kind text not null, id text not null, data jsonb, deleted boolean not null default false,
        seq bigint not null default nextval('zenora_seq'), updated_at timestamptz not null default now(),
        primary key (kind, id))`;
      await sql`create index if not exists zenora_entities_seq on zenora_entities (seq)`;
    })().catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

// Who is calling: the code they typed (or the supplier link key).
export function roleOf(req) {
  const key = String(req.headers['x-zenora-key'] || '').trim();
  if (!key) return null;
  const env = process.env;
  if (env.ADMIN_PIN && key === env.ADMIN_PIN) return 'admin';
  if (env.SUPPLIER_KEY && key === env.SUPPLIER_KEY) return 'supplier';
  if (env.PACKING_PIN && key === env.PACKING_PIN) return 'packing';
  if (env.SERVICE_PIN && key === env.SERVICE_PIN) return 'service';
  return null;
}

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

// Shopify Dev Dashboard app → client credentials grant (token lasts ~24h).
let shopToken = null;
export async function shopifyToken() {
  if (shopToken && shopToken.expires > Date.now() + 60000) return shopToken.value;
  const shop = process.env.SHOPIFY_STORE;
  const r = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error(`Shopify login failed (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  shopToken = { value: j.access_token, expires: Date.now() + (Number(j.expires_in) || 86000) * 1000 };
  return shopToken.value;
}
