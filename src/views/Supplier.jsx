import { fullSize } from '../lib/parse.js';
import React, { useMemo, useState } from 'react';
import { useStore, poStatus, poTotals, poRows, setRowField, setPOField, submitPrices, deleteShipment, openShipRows, shipItems } from '../lib/store.js';
import { PLATINGS } from '../lib/parse.js';
const supplierPlating = (id) => PLATINGS.find((p) => p.id === id)?.supplier || '—';
import { fmtDate, money } from '../lib/status.js';
import { Thumb, Metal, Empty, Modal, Badge, useConfirm, useToast } from '../ui.jsx';

// Supplier screen: two jobs only. 1) add prices  2) tick what's in each package.
const itemName = (l) => l.item.replace(' (GIFT)', '');

export default function Supplier({ admin = false }) {
  const s = useStore();
  const toPrice = Object.values(s.pos).filter((p) => poStatus(s, p).id === 'sent');
  const toShip = openShipRows(s);
  const shipments = Object.values(s.shipments).sort((a, b) => b.shippedAt.localeCompare(a.shippedAt));
  const [tab, setTab] = useState(() => (toPrice.length || !toShip.length ? 'price' : 'ship'));

  return (
    <div className="page">
      <div className="hello">Orders from Zenora</div>
      <div className="muted" style={{ marginBottom: 16 }}>{s.supplierName}</div>
      <div className="big-tabs">
        <button className={`big-tab ${tab === 'price' ? 'on' : ''}`} onClick={() => setTab('price')}>
          <span className="num">{toPrice.length}</span><span><div className="lbl">1. Add prices</div><div className="hint">New orders waiting for your price</div></span>
        </button>
        <button className={`big-tab ${tab === 'ship' ? 'on' : ''}`} onClick={() => setTab('ship')}>
          <span className="num">{toShip.reduce((t, r) => t + r.qty, 0)}</span><span><div className="lbl">2. Ship</div><div className="hint">Tick the items in each package</div></span>
        </button>
      </div>

      {tab === 'price' && (toPrice.length ? toPrice.map((po) => <PricePO key={po.id} po={po} />) : <div className="card"><Empty title="Nothing to price">New orders from Zenora will appear here.</Empty></div>)}
      {tab === 'ship' && (toShip.length ? <ShipPicker rows={toShip} /> : <div className="card"><Empty title="Nothing to ship">All ordered items are shipped.</Empty></div>)}

      {shipments.length > 0 && (
        <details className="more" style={{ marginTop: 10 }}>
          <summary>Packages you sent ({shipments.length})</summary>
          {shipments.map((sh) => (
            <div className="card card-pad" key={sh.id}>
              <div className="row"><b>{sh.number}</b><span className="muted">{sh.carrier} {sh.tracking || ''} · {fmtDate(sh.shippedAt)} · {sh.lineIds.length} items</span><span className="spacer" />{sh.arrivedAt ? <Badge tone="green">Received</Badge> : <Badge tone="purple">On the way</Badge>}{admin && <button className="btn plain sm danger" onClick={() => deleteShipment(sh.id)}>Delete</button>}</div>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function PricePO({ po }) {
  const s = useStore();
  const ask = useConfirm();
  const notify = useToast();
  const rows = poRows(s, po.id);
  const t = poTotals(s, po.id);
  const ready = rows.every((r) => r.price != null && r.price !== '') && po.shipping != null;
  return (
    <div className="card">
      <div className="card-head"><h3>{po.number}</h3><span className="muted">{fmtDate(po.sentAt)} · {rows.length} lines</span><span className="spacer" /><Badge tone="yellow">Write the price for ONE piece in each yellow box</Badge></div>
      <div className="sheet-wrap">
        <table className="sheet m-cards">
          <thead><tr><th className="ser">Ser No.</th><th className="pic">Picture</th><th>Item</th><th>Plating</th><th>Carat</th><th>Size</th><th className="c">QTY</th><th className="r">Price per piece</th><th className="r">Total</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.serNo}>
                <td className="ser" data-label="Ser No.">{r.serNo}</td>
                <td className="pic"><Thumb line={r.first} size="md" /></td>
                <td className="item"><b>{r.item}</b>{r.isGift && <div className="sub">Free gift · {r.orders.length} orders</div>}{r.supplierNote && <div className="flag warn">Note: {r.supplierNote}</div>}</td>
                <td data-label="Plating">{supplierPlating(r.plating)}</td>
                <td data-label="Carat" className="strong">{r.carat || '—'}</td>
                <td data-label="Size" className="strong">{r.size || '—'}</td>
                <td data-label="QTY" className="c"><span className={`qty ${r.qty > 1 ? 'many' : ''}`}>{r.qty}</span></td>
                <td data-label="Price / pc" className="r"><input className={`cell-in price ${r.price != null ? 'filled' : ''}`} type="number" inputMode="decimal" step="0.01" min="0" value={r.price ?? ''} onChange={(e) => setRowField(r.ids, { price: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td data-label="Total" className="r strong">{r.price != null ? money(r.price * r.qty) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totals">
        <div><span>Items</span><b>{money(t.sub)}</b></div>
        <div><span>DHL</span><input className={`cell-in price ${po.shipping != null ? 'filled' : ''}`} type="number" inputMode="decimal" step="0.01" min="0" value={po.shipping ?? ''} onChange={(e) => setPOField(po.id, { shipping: e.target.value === '' ? null : Number(e.target.value) })} /></div>
        <div className="grand"><span>Total</span><b>{money(t.total)}</b></div>
      </div>
      <div className="card-foot">
        <span className="muted">{rows.filter((r) => r.price != null).length} of {rows.length} priced{po.shipping == null ? ' · DHL missing' : ''}</span>
        <span className="spacer" />
        <button className="btn primary lg" disabled={!ready} onClick={async () => { if (await ask({ title: 'Send prices to Zenora?', text: `Total ${money(t.total)} including DHL.`, ok: 'Send' })) { submitPrices(po.id); notify('Prices sent. Thank you!'); } }}>Send prices</button>
      </div>
    </div>
  );
}

// Tick what's in the box (with how many, for rows with QTY > 1) → Send package.
export function ShipPicker({ rows, who = 'supplier' }) {
  const s = useStore();
  const notify = useToast();
  const [sel, setSel] = useState(() => ({}));   // key → qty in box
  const [shipOpen, setShipOpen] = useState(false);
  const [tracking, setTracking] = useState('');
  const picked = rows.filter((r) => sel[r.key] > 0);
  const toggle = (r) => setSel((p) => { const n = { ...p }; if (n[r.key]) delete n[r.key]; else n[r.key] = r.qty; return n; });
  const setQty = (r, q) => setSel((p) => ({ ...p, [r.key]: Math.max(1, Math.min(r.qty, q)) }));

  return (
    <>
      <div className="card">
        <div className="card-head"><h3>Tick every item in the package</h3><span className="spacer" /><button className="btn plain sm" onClick={() => setSel(Object.fromEntries(rows.map((r) => [r.key, r.qty])))}>Tick all</button>{picked.length > 0 && <button className="btn plain sm" onClick={() => setSel({})}>Clear</button>}</div>
        <div className="sheet-wrap">
          <table className="sheet m-cards">
            <thead><tr><th className="chk" /><th className="pic">Picture</th><th>Item</th><th>Plating</th><th>Carat</th><th>Size</th><th className="c">QTY</th><th className="c">In this box</th><th>PO / Ser</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const on = sel[r.key] > 0;
                return (
                  <tr key={r.key} className={`${on ? 'sel' : ''} has-chk`} style={{ cursor: 'pointer' }} onClick={() => toggle(r)}>
                    <td className="chk"><input type="checkbox" checked={on} onChange={() => toggle(r)} onClick={(e) => e.stopPropagation()} /></td>
                    <td className="pic"><Thumb line={r.first} size="md" /></td>
                    <td className="item"><b>{r.item}</b>{r.remake && <div className="flag block">REMAKE</div>}{r.isGift && <div className="sub">Free gift</div>}</td>
                    <td data-label="Plating">{supplierPlating(r.plating)}</td>
                    <td data-label="Carat" className="strong">{r.carat || '—'}</td>
                    <td data-label="Size" className="strong">{r.size || '—'}</td>
                    <td data-label="QTY" className="c"><span className={`qty ${r.qty > 1 ? 'many' : ''}`}>{r.qty}</span></td>
                    <td data-label="In box" className="c" onClick={(e) => e.stopPropagation()}>
                      {on && r.qty > 1 ? (
                        <span className="stepper"><button onClick={() => setQty(r, sel[r.key] - 1)}>−</button><b>{sel[r.key]}</b><button onClick={() => setQty(r, sel[r.key] + 1)}>+</button></span>
                      ) : on ? <b>1</b> : <span className="faint">—</span>}
                    </td>
                    <td data-label="PO" className="muted small">{r.po} · {r.serNo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {picked.length > 0 && (
        <div className="bulkbar">
          <span className="strong">{picked.reduce((t, r) => t + sel[r.key], 0)} pieces in the package</span>
          <button className="btn primary" onClick={() => setShipOpen(true)}>Send package</button>
        </div>
      )}
      {shipOpen && (
        <Modal title="Send package" onClose={() => setShipOpen(false)} footer={<>
          <button className="btn" onClick={() => setShipOpen(false)}>Cancel</button>
          <button className="btn primary" onClick={() => { const n = shipItems(picked.map((r) => ({ ids: r.ids, qty: sel[r.key] })), tracking.trim(), 'DHL', null, who); setSel({}); setShipOpen(false); setTracking(''); notify(`${n} marked as shipped`); }}>Done</button>
        </>}>
          <div className="field"><label>DHL tracking number (optional)</label><input type="text" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="e.g. 1234567890" autoFocus /></div>
        </Modal>
      )}
    </>
  );
}
