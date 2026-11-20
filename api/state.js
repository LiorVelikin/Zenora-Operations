// GET /api/state?since=<seq> → every entity changed after <seq> (all of them when since=0).
import { db, ensureSchema, roleOf, send } from './_lib.js';

const SUPPLIER_KINDS = ['po', 'line', 'shipment', 'meta'];
const SUPPLIER_META = ['counters', 'supplierName'];

export default async function handler(req, res) {
  const role = roleOf(req);
  if (!role) return send(res, 401, { error: 'Wrong code' });
  try {
    await ensureSchema();
    const sql = db();
    const since = Math.max(0, Number(req.query?.since || new URL(req.url, 'http://x').searchParams.get('since') || 0));
    let rows = await sql`select kind, id, data, deleted, seq from zenora_entities where seq > ${since} order by seq`;
    if (role === 'supplier') {
      rows = rows.filter((r) => SUPPLIER_KINDS.includes(r.kind) && (r.kind !== 'meta' || SUPPLIER_META.includes(r.id)) && (r.kind !== 'line' || (r.data && r.data.poId)));
      rows = rows.map((r) => (r.kind === 'line' && r.data ? { ...r, data: { ...r.data, shopifyTitle: undefined } } : r));
    }
    const top = await sql`select coalesce(max(seq), 0) as max from zenora_entities`;
    send(res, 200, { rows: rows.map((r) => ({ ...r, seq: Number(r.seq) })), seq: Number(top[0].max), role });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
