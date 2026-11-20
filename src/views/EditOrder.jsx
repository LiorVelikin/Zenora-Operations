import React, { useState } from 'react';
import { useStore, updateOrder } from '../lib/store.js';
import { Modal, useToast } from '../ui.jsx';

// Edit the customer details of an order (Shopify itself is not changed).
export default function EditOrder({ orderId, onClose }) {
  const s = useStore();
  const notify = useToast();
  const o = s.orders[orderId];
  const [f, setF] = useState(() => ({ customer: o?.customer || '', phone: o?.phone || '', address: o?.address || '', city: o?.city || '', note: o?.note || '' }));
  if (!o) return null;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  return (
    <Modal title={`Edit ${o.name}`} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={() => { updateOrder(orderId, f); notify('Saved'); onClose(); }}>Save</button>
    </>}>
      <div className="field"><label>Customer name</label><input type="text" value={f.customer} onChange={set('customer')} /></div>
      <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="field"><label>Phone</label><input type="text" value={f.phone} onChange={set('phone')} /></div>
        <div className="field"><label>City</label><input type="text" value={f.city} onChange={set('city')} /></div>
      </div>
      <div className="field"><label>Address</label><input type="text" value={f.address} onChange={set('address')} /></div>
      <div className="field"><label>Note (shows to packing)</label><input type="text" value={f.note} onChange={set('note')} placeholder="e.g. ring size 12, not 10" /></div>
      <div className="small faint">Changes here don't change Shopify.</div>
    </Modal>
  );
}
