import { roleOf, send } from './_lib.js';

export default function handler(req, res) {
  const role = roleOf(req);
  if (!role) return send(res, 401, { error: 'Wrong code' });
  const body = { role };
  if (role === 'admin' && process.env.SUPPLIER_KEY) body.supplierKey = process.env.SUPPLIER_KEY;
  send(res, 200, body);
}
