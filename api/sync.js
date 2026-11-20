// POST /api/sync { upserts: [{kind,id,data}], deletes: [{kind,id}] }
import { db, ensureSchema, roleOf, send, readJson } from './_lib.js';

const KINDS = ['order', 'line', 'po', 'shipment', 'price', 'log', 'meta'];
const SUPPLIER_WRITE = ['line', 'po', 'shipment', 'log', 'meta'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const role = roleOf(req);
  if (!role) return send(res, 401, { error: 'Wrong code' });
  try {
    await ensureSchema();
    const sql = db();
    const body = await readJson(req);
    const allowed = role === 'supplier' ? SUPPLIER_WRITE : KINDS;
    const ups = (body.upserts || []).filter((u) => allowed.includes(u.kind) && u.id);
    const dels = role === 'supplier' ? [] : (body.deletes || []).filter((d) => KINDS.includes(d.kind) && d.id);
    await sql.begin(async (tx) => {
      for (const u of ups) {
        await tx`insert into zenora_entities (kind, id, data, deleted) values (${u.kind}, ${String(u.id)}, ${tx.json(u.data)}, false)
          on conflict (kind, id) do update set data = excluded.data, deleted = false, seq = nextval('zenora_seq'), updated_at = now()`;
      }
      for (const d of dels) {
        await tx`update zenora_entities set deleted = true, data = null, seq = nextval('zenora_seq'), updated_at = now() where kind = ${d.kind} and id = ${String(d.id)}`;
      }
    });
    const top = await sql`select coalesce(max(seq), 0) as max from zenora_entities`;
    send(res, 200, { ok: true, seq: Number(top[0].max), saved: ups.length, deleted: dels.length });
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };
