import React, { useState } from 'react';
import {
  useStore, getState, poStatus, poTotals, linesOfPO, poRows, setRowField, renumberPOAction as regroup, togglePaid, sendPO, deletePO, removeFromPO, confirmPO,
  setPOField, lastPrice, importPricesFromSheet, submitPrices, applyPOFile,
} from '../lib/store.js';
import { platingLabel, fullSize } from '../lib/parse.js';
import EditLine from './EditLine.jsx';
import ImportExcel from './ImportExcel.jsx';
import { PackagesList } from './Shipping.jsx';
import { fmtDate, money } from '../lib/status.js';
import { exportPOExcel, readSupplierExcel } from '../lib/excel.js';
import { exportPOPdf } from '../lib/pdf.js';
import { Thumb, PhotoUpload, Metal, MetalSelect, StageBadge, Badge, Empty, Modal, PageHead, Tabs, useConfirm, useToast } from '../ui.jsx';
import AddItem from './AddItem.jsx';

const TONE = { muted: '', amber: 'yellow', green: 'green', blue: 'blue', purple: 'purple' };
export const POBadge = ({ st }) => <Badge tone={TONE[st.tone]}>{st.label}</Badge>;

// ---------------------------------------------------------------- list
export function POList({ nav }) {
  const s = useStore();
  const [tab, setTab] = useState('open');
  const [importing, setImporting] = useState(false);
  const all = Object.values(s.pos).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const isOpen = (p) => poStatus(s, p).id !== 'received';
  const list = all.filter((p) => (tab === 'open' ? isOpen(p) : tab === 'done' ? !isOpen(p) : true));
  return (
    <div className="page">
      <PageHead title="Purchase orders" sub="Every order you've sent to the supplier, with its prices and progress.">
        <button className="btn primary" onClick={() => setImporting(true)}>Import supplier Excel</button>
      </PageHead>
      {importing && <ImportExcel onClose={(r) => { setImporting(false); }} />}
      <div className="card">
        <Tabs value={tab} onChange={setTab} tabs={[['open', 'Open', all.filter(isOpen).length], ['done', 'Received', all.filter((p) => !isOpen(p)).length], ['all', 'All', all.length]]} />
        {!list.length ? <Empty title="No purchase orders here">Select items under Orders to purchase and press Create PO.</Empty> : (
          <div className="sheet-wrap" style={{ borderTop: 0 }}>
            <table className="sheet m-cards">
              <thead><tr><th>Purchase order</th><th>Created</th><th>Status</th><th className="c">Lines</th><th className="c">Customer orders</th><th className="r">Total</th></tr></thead>
              <tbody>
                {list.map((po) => {
                  const t = poTotals(s, po.id);
                  return (
                    <tr key={po.id} style={{ cursor: 'pointer' }} onClick={() => nav('po', po.id)}>
                      <td className="strong">{po.number}</td>
                      <td data-label="Created" className="muted">{fmtDate(po.createdAt)}</td>
                      <td data-label="Status"><POBadge st={poStatus(s, po)} /></td>
                      <td data-label="Lines" className="c">{t.count}</td>
                      <td data-label="Orders" className="c">{new Set(linesOfPO(s, po.id).map((l) => l.orderId)).size}</td>
                      <td data-label="Total" className="r strong">{t.priced ? money(t.total) : <span className="faint">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <PackagesList />
    </div>
  );
}

// ---------------------------------------------------------------- detail
export function PODetail({ poId, nav }) {
  const s = useStore();
  const ask = useConfirm();
  const notify = useToast();
  const po = s.pos[poId];
  const rows = poRows(s, poId);
  const st = poStatus(s, po);
  const t = poTotals(s, poId);
  const [importing, setImporting] = useState(null);
  const [exporting, setExporting] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [smart, setSmart] = useState(false);
  const draft = st.id === 'draft';
  const checking = st.id === 'priced';

  async function doExport(kind) {
    setExporting(kind);
    try {
      const ok = kind === 'xlsx' ? await exportPOExcel(getState(), poId) : await exportPOPdf(getState(), poId);
      if (ok) notify(`${kind === 'xlsx' ? 'Excel' : 'PDF'} downloaded`);
    } catch (e) { notify(e.message || 'Export failed', 'err'); }
    setExporting('');
  }
  async function send() {
    if (rows.some((r) => !r.plating)) { notify('Choose the metal on every line first', 'err'); return; }
    if (!(await ask({ title: `Lock ${po.number} and send?`, text: 'The order is locked and the Excel for the supplier downloads. Send it to her on WhatsApp. (You can still edit later if needed.)', ok: 'Lock & download Excel' }))) return;
    sendPO(poId);
    await doExport('xlsx');
  }
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { setImporting(await readSupplierExcel(f, rows)); }
    catch (er) { notify(`${er.message}`, 'err'); setSmart(true); }
  }

  const dates = [`Created ${fmtDate(po.createdAt)}`, po.sentAt && `sent ${fmtDate(po.sentAt)}`, po.submittedAt && `priced ${fmtDate(po.submittedAt)}`, po.confirmedAt && `confirmed ${fmtDate(po.confirmedAt)}`, po.paidAt && `paid ${fmtDate(po.paidAt)}`].filter(Boolean).join(' · ');

  return (
    <div className="page">
      <PageHead title={po.number} back={() => nav('pos')} sub={`${s.supplierName} · ${dates}`}>
        <POBadge st={st} />
        {!draft && <label className="inline" style={{ fontSize: 13, color: 'var(--ink)' }}><input type="checkbox" checked={!!po.paidAt} onChange={() => togglePaid(poId)} />Paid</label>}
        <button className="btn" disabled={!!exporting} onClick={() => doExport('xlsx')}>{exporting === 'xlsx' ? 'Building…' : 'Excel'}</button>
        <button className="btn" disabled={!!exporting} onClick={() => doExport('pdf')}>{exporting === 'pdf' ? 'Building…' : 'PDF'}</button>
        <button className="btn plain danger" onClick={async () => { if (await ask({ title: `Delete ${po.number}?`, text: 'Items not shipped yet go back to Orders. Items already shipped or at the studio keep their step. Its prices are removed from price history.', ok: 'Delete PO', danger: true })) { deletePO(poId); nav('pos'); } }}>Delete</button>
      </PageHead>

      {draft && (
        <div className="banner info">
          <span><b>Draft.</b> Check every line, then lock it. That downloads the Excel to send her.</span>
          <span className="spacer" />
          <button className="btn" onClick={() => setAdding(true)}>+ Add item</button>
          <button className="btn primary" disabled={!rows.length} onClick={send}>Lock & send to supplier</button>
        </div>
      )}
      {!draft && st.id !== 'sent' && !checking && (
        <div className="banner info">
          <span><b>Shipping:</b> when she marks shipped dates in this PO's Excel, upload it here. Only new marks are added.</span>
          <span className="spacer" />
          <label className="btn primary" style={{ cursor: 'pointer' }}>Upload her Excel<input type="file" accept=".xlsx,.xlsm" hidden onChange={onFile} /></label>
        </div>
      )}
      {st.id === 'sent' && (
        <div className="banner warn">
          <span><b>Waiting for prices.</b> When she sends the Excel back with prices, upload it here.</span>
          <span className="spacer" />
          <button className="btn" onClick={() => { submitPrices(poId, 'lior'); notify('Marked as priced'); }} title="If she gave prices on WhatsApp and you typed them in the table">I typed the prices</button>
          <label className="btn primary" style={{ cursor: 'pointer' }}>Upload her Excel<input type="file" accept=".xlsx,.xlsm" hidden onChange={onFile} /></label>
        </div>
      )}
      {checking && (
        <div className="banner ok">
          <span><b>Prices are in: {money(t.total)}.</b> Red = more than last time. Change anything you agreed differently, then confirm.</span>
          <span className="spacer" />
          <label className="btn" style={{ cursor: 'pointer' }}>Upload her Excel again<input type="file" accept=".xlsx,.xlsm" hidden onChange={onFile} /></label>
          <button className="btn primary" onClick={async () => { if (await ask({ title: `Confirm ${po.number}?`, text: `${t.count} items, ${money(t.total)} including DHL. Prices are saved to price history.`, ok: 'Confirm prices' })) { confirmPO(poId); notify(`${po.number} confirmed`); } }}>Confirm prices</button>
        </div>
      )}

      <div className="card">
        <div className="sheet-wrap" style={{ borderTop: 0 }}>
          <table className="sheet m-cards">
            <thead><tr>
              <th className="ser">Ser No.</th><th className="pic">Picture</th><th>Item</th><th style={{ width: 130 }}>Plating</th><th style={{ width: 80 }}>Carat</th><th style={{ width: 110 }}>Size</th><th className="c" style={{ width: 64 }}>QTY</th>
              <th className="r" style={{ width: 110 }}>Price / pc</th><th className="r">Total</th><th>For</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {rows.map((r) => {
                const lp = lastPrice(s, r.first);
                const diff = lp && r.price != null && !draft && lp.po !== po.number ? r.price - lp.price : null;
                const steps = [...new Set(r.lines.map((l) => l.status))];
                return (
                  <tr key={r.serNo}>
                    <td className="ser" data-label="Ser No.">{r.serNo}</td>
                    <td className="pic">{r.lines.length === 1 ? <PhotoUpload line={r.first} /> : <Thumb line={r.first} />}</td>
                    <td className="item">
                      <input className="cell-in strong" value={r.item} onChange={(e) => setRowField(r.ids, { item: r.isGift ? `${e.target.value} (GIFT)` : e.target.value })} />
                      {r.isGift && <div className="sub">Free gift · combined from {r.orders.length} order{r.orders.length > 1 ? 's' : ''}</div>}
                      <input className="cell-in small" placeholder="Note for supplier…" value={r.supplierNote} onChange={(e) => setRowField(r.ids, { supplierNote: e.target.value })} />
                    </td>
                    <td data-label="Plating"><MetalSelect value={r.plating} onChange={(v) => { setRowField(r.ids, { plating: v, platingSource: 'manual' }); regroup(poId); }} /></td>
                    <td data-label="Carat"><input className="cell-in" list="carat-list" value={r.carat || ''} placeholder="—" onChange={(e) => { setRowField(r.ids, { carat: e.target.value }); if (r.isGift) regroup(poId); }} /></td>
                    <td data-label="Size"><input className="cell-in" value={r.size || ''} placeholder="—" onChange={(e) => setRowField(r.ids, { size: e.target.value, sizeEdited: true })} /></td>
                    <td data-label="QTY" className="c">{r.lines.length === 1 ? <input className="cell-in" style={{ textAlign: 'center', fontWeight: 700 }} type="number" min="1" value={r.qty} onChange={(e) => setRowField(r.ids, { qty: Math.max(1, Number(e.target.value) || 1) })} /> : <span className="qty many">{r.qty}</span>}</td>
                    <td data-label="Price / pc" className="r">
                      {draft ? <span className="faint">—</span> : <input className={`cell-in price ${r.price != null ? 'filled' : ''}`} type="number" step="0.01" value={r.price ?? ''} onChange={(e) => setRowField(r.ids, { price: e.target.value === '' ? null : Number(e.target.value) })} />}
                      {diff != null && diff !== 0 && <div className={diff > 0 ? 'delta-up' : 'delta-down'}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff))} vs last</div>}
                    </td>
                    <td data-label="Total" className="r strong">{r.price != null ? money(r.price * r.qty) : '—'}</td>
                    <td data-label="For" className="muted small">{r.orders.join(', ')}</td>
                    <td data-label="Status">{steps.map((x) => <StageBadge key={x} status={x} />)}</td>
                    <td className="c">
                      {r.lines.length === 1 && <button className="btn plain sm" onClick={() => setEditing(r.first.id)}>Edit</button>}
                      {draft && <button className="btn plain sm" onClick={() => r.ids.forEach((id) => removeFromPO(id))}>Remove</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="totals">
          <div><span>Items</span><b>{money(t.sub)}</b></div>
          <div><span>DHL</span>{draft ? <b>—</b> : <input className={`cell-in price ${po.shipping != null ? 'filled' : ''}`} type="number" value={po.shipping ?? ''} onChange={(e) => setPOField(poId, { shipping: e.target.value === '' ? null : Number(e.target.value) })} />}</div>
          <div className="grand"><span>Total</span><b>{money(t.total)}</b></div>
        </div>
      </div>
      <datalist id="carat-list">{['0.5ct', '1ct', '1.5ct', '2ct', '2.5ct', '3ct', '4ct', '5ct'].map((c) => <option key={c} value={c} />)}</datalist>

      {editing && <EditLine lineId={editing} onClose={() => setEditing(null)} />}
      {smart && <ImportExcel poId={poId} onClose={() => setSmart(false)} />}
      {adding && <AddItem poId={poId} onClose={() => setAdding(false)} />}
      {importing && (
        <Modal wide flush title="Her Excel" onClose={() => setImporting(null)} footer={<>
          <span className="muted" style={{ marginRight: 'auto' }}>Matched by {importing.matchedBy}</span>
          <button className="btn" onClick={() => setImporting(null)}>Cancel</button>
          <button className="btn primary" disabled={!importing.matches.length && !importing.ships.length} onClick={() => { const pk = applyPOFile(poId, importing); setImporting(null); notify([importing.matches.length ? `${importing.matches.length} prices` : '', pk.length ? `${pk.join(', ')} created` : ''].filter(Boolean).join(' · ') || 'Nothing new'); }}>Apply</button>
        </>}>
          {importing.ships.length > 0 && (
            <div className="card-pad" style={{ borderBottom: '1px solid var(--border2)' }}>
              <div className="strong" style={{ marginBottom: 6 }}>New shipped marks: {importing.ships.reduce((t, x) => t + x.qty, 0)} pieces</div>
              {Object.entries(importing.ships.reduce((m, x) => ((m[x.date] ||= []).push(x), m), {})).map(([d, xs]) => (
                <div key={d} className="small" style={{ marginBottom: 4 }}><b>Package {d}:</b> {xs.map((x) => `#${x.serNo} ${x.item}${x.qty > 1 ? ` ×${x.qty}` : ''}`).join(', ')}</div>
              ))}
            </div>
          )}
          {!importing.ships.length && <div className="card-pad small muted" style={{ borderBottom: '1px solid var(--border2)' }}>No new shipped marks in this file.</div>}
          {importing.problems.length > 0 && <div className="note-strip" style={{ margin: 12 }}>{importing.problems.join(' · ')}</div>}
          <table className="sheet">
            <thead><tr><th className="ser">Ser No.</th><th>Item</th><th>Plating</th><th>Size</th><th className="c">QTY</th><th className="r">Price / pc</th></tr></thead>
            <tbody>
              {importing.matches.map((m) => { const r = rows.find((x) => x.serNo === m.serNo); return <tr key={m.serNo}><td className="ser">{m.serNo}</td><td>{r?.item}</td><td>{platingLabel(r?.plating)}</td><td>{fullSize(r || {})}</td><td className="c">{r?.qty}</td><td className="r strong">{money(m.price)}</td></tr>; })}
            </tbody>
          </table>
          <div className="totals"><div><span>DHL</span><b>{money(importing.shipping)}</b></div></div>
        </Modal>
      )}
    </div>
  );
}
