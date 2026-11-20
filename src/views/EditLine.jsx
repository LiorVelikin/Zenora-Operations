import React, { useState } from 'react';
import { useStore, updateLine, setLineStatus, deleteLine, sendForRemake } from '../lib/store.js';
import { PLATINGS, BOX_OPTIONS } from '../lib/parse.js';
import { STAGES, CANCELLED } from '../lib/status.js';
import { compressImage } from '../lib/platform.js';
import { Modal, Thumb, useConfirm, useToast } from '../ui.jsx';

// Edit every field of one item, or delete it. Admin only.
export default function EditLine({ lineId, onClose }) {
  const s = useStore();
  const ask = useConfirm();
  const notify = useToast();
  const line = s.lines[lineId];
  const [f, setF] = useState(() => ({
    item: line?.item || '', plating: line?.plating || '', carat: line?.carat || '', size: line?.size || '', qty: line?.qty || 1,
    supplierNote: line?.supplierNote || '', price: line?.price ?? '', box: line?.box || BOX_OPTIONS[0], status: line?.status, customImage: line?.customImage || null,
  }));
  if (!line) return null;
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const po = line.poId && s.pos[line.poId];

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { const d = await compressImage(file); setF((p) => ({ ...p, customImage: d })); } catch (er) { notify(er.message, 'err'); }
  }

  function save() {
    updateLine(lineId, {
      item: f.item.trim() || line.item, plating: f.plating || null, platingSource: f.plating !== line.plating ? 'manual' : line.platingSource,
      carat: f.carat.trim(), size: f.size.trim(), sizeEdited: true, qty: Math.max(1, Number(f.qty) || 1), supplierNote: f.supplierNote,
      price: f.price === '' ? null : Number(f.price), box: f.box, customImage: f.customImage,
    });
    if (f.status !== line.status) setLineStatus(lineId, f.status);
    notify('Saved');
    onClose();
  }

  return (
    <Modal wide title={`Edit item · ${line.orderName}`} onClose={onClose} footer={<>
      <button className="btn plain danger" style={{ marginRight: 'auto' }} onClick={async () => { if (await ask({ title: 'Delete this item?', text: `${line.item} will be removed from ${line.orderName}${po ? ` and ${po.number}` : ''}. This can't be undone.`, ok: 'Delete', danger: true })) { deleteLine(lineId); notify('Item deleted'); onClose(); } }}>Delete item</button>
      {['shipped', 'arrived'].includes(line.status) && <button className="btn" onClick={async () => { if (await ask({ title: 'Send back for remake?', text: 'The item goes back to "Being made" and shows up again in the supplier\'s list marked REMAKE. Write what\'s wrong in the note first if needed.', ok: 'Send for remake' })) { sendForRemake(lineId, f.supplierNote !== line.supplierNote ? f.supplierNote : ''); notify('Sent back for remake'); onClose(); } }}>Send back for remake</button>}
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" onClick={save}>Save</button>
    </>}>
      <div className="form-grid">
        <div>
          <label className="upload-box">
            {f.customImage ? <img src={f.customImage} alt="" /> : <Thumb line={{ ...line, customImage: null }} size="xl" />}
            <input type="file" accept="image/*" hidden onChange={onPhoto} />
          </label>
          <div className="row" style={{ marginTop: 6 }}>
            <label className="btn plain sm" style={{ cursor: 'pointer' }}>Upload photo<input type="file" accept="image/*" hidden onChange={onPhoto} /></label>
            {f.customImage && <button className="btn plain sm" onClick={() => setF((p) => ({ ...p, customImage: null }))}>Remove</button>}
          </div>
          {line.shopifyTitle && line.shopifyTitle !== f.item && <div className="small faint" style={{ marginTop: 8 }}>Shopify: {line.shopifyTitle}</div>}
        </div>
        <div>
          <div className="field"><label>Item name</label><input type="text" value={f.item} onChange={set('item')} /></div>
          <div className="two">
            <div className="field"><label>Metal</label><select value={f.plating} onChange={set('plating')}><option value="">Not set</option>{PLATINGS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
            <div className="field"><label>Carat</label><input type="text" value={f.carat} onChange={set('carat')} placeholder="e.g. 2ct" list="carats" /></div>
          </div>
          <div className="two">
            <div className="field"><label>Size / length</label><input type="text" value={f.size} onChange={set('size')} placeholder="e.g. size 7, 45cm" /></div>
            <div className="field"><label>Quantity</label><input type="number" min="1" value={f.qty} onChange={set('qty')} /></div>
          </div>
          <div className="two">
            <div className="field"><label>Price (USD)</label><input type="number" step="0.01" value={f.price} onChange={set('price')} placeholder="—" /></div>
            <div className="field"><label>Step</label><select value={f.status} onChange={set('status')}>{[...STAGES, CANCELLED].map((x) => <option key={x.id} value={x.id}>{x.short}</option>)}</select></div>
          </div>
          <div className="two">
            <div className="field"><label>Box</label><select value={f.box} onChange={set('box')}>{BOX_OPTIONS.map((b) => <option key={b}>{b}</option>)}</select></div>
            <div className="field"><label>Purchase order</label><input type="text" value={po ? `${po.number} · Ser No. ${line.serNo}` : 'Not on a PO'} disabled /></div>
          </div>
          <div className="field"><label>Note for supplier</label><input type="text" value={f.supplierNote} onChange={set('supplierNote')} /></div>
        </div>
      </div>
      <datalist id="carats">{['0.5ct', '1ct', '1.5ct', '2ct', '2.5ct', '3ct', '4ct', '5ct'].map((c) => <option key={c} value={c} />)}</datalist>
    </Modal>
  );
}
