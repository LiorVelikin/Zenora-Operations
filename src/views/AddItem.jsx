import React, { useMemo, useState } from 'react';
import { useStore, addManualItem, linesOfOrder } from '../lib/store.js';
import { PLATINGS } from '../lib/parse.js';
import { compressImage } from '../lib/platform.js';
import { orderStatus } from '../lib/status.js';
import { Modal, useToast } from '../ui.jsx';

const CATEGORIES = [['ring', 'Ring'], ['earrings', 'Earrings'], ['bracelet', 'Bracelet'], ['necklace', 'Necklace / pendant'], ['other', 'Other']];

// Add a product by hand: extras, replacements, custom pieces or stock.
export default function AddItem({ onClose, poId = null, defaultOrderId = '' }) {
  const s = useStore();
  const notify = useToast();
  const openOrders = useMemo(() => Object.values(s.orders)
    .filter((o) => !o.isStock && linesOfOrder(s, o.id).length && !['done', 'cancelled'].includes(orderStatus(linesOfOrder(s, o.id)).stage.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [s]);
  const [f, setF] = useState({ orderId: defaultOrderId || 'stock', item: '', category: 'ring', plating: '', size: '', qty: 1, supplierNote: '', customImage: null });
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const ok = f.item.trim() && f.plating;

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { setF((p) => ({ ...p, customImage: null })); const d = await compressImage(file); setF((p) => ({ ...p, customImage: d })); }
    catch (er) { notify(er.message, 'err'); }
  }

  function save() {
    addManualItem({ ...f, item: f.item.trim(), poId });
    notify(poId ? 'Item added to the PO' : 'Item added');
    onClose();
  }

  return (
    <Modal wide title="Add item by hand" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!ok} onClick={save}>Add item</button>
    </>}>
      <div className="form-grid">
        <div>
          <label className="upload-box">
            {f.customImage ? <img src={f.customImage} alt="" /> : <><span style={{ fontSize: 26 }}>📷</span><span>Add photo</span><span className="small faint">optional</span></>}
            <input type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
          {f.customImage && <button className="btn plain sm" style={{ marginTop: 6 }} onClick={() => setF((p) => ({ ...p, customImage: null }))}>Remove photo</button>}
        </div>
        <div>
          <div className="field"><label>Item name</label><input type="text" autoFocus value={f.item} onChange={set('item')} placeholder="e.g. Oval solitaire ring 2ct" /></div>
          <div className="two">
            <div className="field"><label>Type</label><select value={f.category} onChange={set('category')}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div className="field"><label>Metal</label><select value={f.plating} onChange={set('plating')}><option value="" disabled>Choose…</option>{PLATINGS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          </div>
          <div className="two">
            <div className="field"><label>Size</label><input type="text" value={f.size} onChange={set('size')} placeholder="e.g. 2ct size 7, 45cm" /></div>
            <div className="field"><label>Quantity</label><input type="number" min="1" value={f.qty} onChange={set('qty')} /></div>
          </div>
          <div className="field"><label>For</label>
            <select value={f.orderId} onChange={set('orderId')}>
              <option value="stock">Stock (no customer)</option>
              {openOrders.map((o) => <option key={o.id} value={o.id}>{o.name} · {o.customer}</option>)}
            </select>
            <div className="small faint" style={{ marginTop: 4 }}>For a Shopify order that isn't listed, pull it first.</div>
          </div>
          <div className="field"><label>Note for supplier</label><input type="text" value={f.supplierNote} onChange={set('supplierNote')} placeholder="optional" /></div>
        </div>
      </div>
    </Modal>
  );
}
