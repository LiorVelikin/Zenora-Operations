import { fullSize } from '../lib/parse.js';
import React, { useMemo, useState } from 'react';
import { useStore, applyShopifyOrders, setPlating, updateLine, markInStock, createPO, addLinesToPO, undoStock, dismissOrder } from '../lib/store.js';
import { lineWarnings, platingLabel } from '../lib/parse.js';
import { fmtDate, daysSince } from '../lib/status.js';
import { pullShopifyOrders, snapshotOrders, describePullError, IS_PREVIEW, parseOrderNumbers } from '../lib/platform.js';
import { Thumb, PhotoUpload, MetalSelect, Empty, PageHead, Badge, useConfirm, useToast } from '../ui.jsx';
import AddItem from './AddItem.jsx';
import AddOrders from './AddOrders.jsx';
import EditLine from './EditLine.jsx';
import EditOrder from './EditOrder.jsx';

export default function Orders({ nav }) {
  const s = useStore();
  const notify = useToast();
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [numbers, setNumbers] = useState('');
  const [sel, setSel] = useState(() => new Set());
  const [target, setTarget] = useState('new');
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editOrder, setEditOrder] = useState(null);

  const newLines = Object.values(s.lines).filter((l) => l.status === 'new' && !l.poId);
  const stockLines = Object.values(s.lines).filter((l) => l.fromStock && l.status === 'arrived');
  const groups = useMemo(() => {
    const g = {};
    newLines.forEach((l) => { (g[l.orderId] ||= []).push(l); });
    return Object.entries(g)
      .map(([oid, lines]) => ({ order: s.orders[oid], lines: lines.sort((a, b) => a.id.localeCompare(b.id)) }))
      .sort((a, b) => new Date(a.order.createdAt) - new Date(b.order.createdAt));
  }, [newLines, s.orders]);
  const drafts = Object.values(s.pos).filter((p) => p.status === 'draft');

  const blocked = (l) => !l.plating;
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selected = [...sel].filter((id) => s.lines[id]?.status === 'new' && !s.lines[id]?.poId);
  const selBlocked = selected.filter((id) => blocked(s.lines[id]));
  const allChecked = newLines.length > 0 && newLines.every((l) => sel.has(l.id));

  async function pull(mode, useSnapshot = false) {
    const names = mode === 'pick' ? parseOrderNumbers(numbers) : null;
    if (mode === 'pick' && !names.length) { notify('Type one or more order numbers, e.g. 1496, 1490', 'err'); return; }
    setBusy(mode); setMsg(null);
    try {
      const syncNames = mode === 'sync' ? Object.values(s.orders).filter((o) => !o.isStock && Object.values(s.lines).some((l) => l.orderId === o.id && l.status !== 'done' && l.status !== 'cancelled')).map((o) => o.name) : null;
      if (mode === 'sync' && !syncNames.length) { setMsg({ tone: 'ok', text: ['Nothing to update yet'] }); setBusy(false); return; }
      const { orders, source } = useSnapshot ? snapshotOrders(names || syncNames) : await pullShopifyOrders({ names: names || syncNames });
      const r = applyShopifyOrders(orders, source, { manual: mode === 'pick', syncOnly: mode === 'sync' });
      const out = [];
      if (mode === 'pick') {
        const found = new Set(orders.map((o) => o.name));
        if (r.added.length) out.push(`Added ${r.added.join(', ')}`);
        if (r.already.length) out.push(`Already in the system: ${r.already.join(', ')}`);
        out.push(...r.skipped);
        const notFound = names.filter((n) => !found.has(n));
        if (notFound.length) out.push(`Not found: ${notFound.join(', ')}`);
        if (r.added.length) setNumbers('');
        setMsg({ tone: r.added.length ? 'ok' : 'warn', text: out });
      } else {
        out.push('Checked with Shopify');
        if (r.fulfilled) out.push(`${r.fulfilled} marked sent (fulfilled in Shopify)`);
        if (r.cancelled) out.push(`${r.cancelled} cancelled`);
        setMsg({ tone: 'ok', text: [out.join(' · ')] });
      }
    } catch (e) {
      setMsg({ tone: 'warn', text: [describePullError(e)], retry: mode });
    } finally { setBusy(false); }
  }

  function makePO() {
    if (selBlocked.length) { notify(`Choose the metal for ${selBlocked.length} item(s) first`, 'err'); return; }
    const id = target === 'new' ? createPO(selected) : (addLinesToPO(target, selected), target);
    setSel(new Set());
    nav('po', id);
  }

  async function stock(ids) {
    if (await ask({ title: 'Take from stock?', text: `${ids.length} item(s) skip the supplier and go straight to Packing.`, ok: 'Yes, from stock' })) {
      markInStock(ids); setSel(new Set()); notify('Moved to Packing');
    }
  }

  return (
    <div className="page">
      <PageHead title="Orders">
        <button className="btn" onClick={() => setAdding(true)}>+ Add item by hand</button>
        <button className="btn primary" onClick={() => setPicking(true)}>+ Choose orders from Shopify</button>
      </PageHead>

      <div className="card card-pad">
        <form className="pullbar" onSubmit={(e) => { e.preventDefault(); pull('pick'); }}>
          <span className="strong">Add by number</span>
          <input type="text" inputMode="numeric" value={numbers} onChange={(e) => setNumbers(e.target.value)} placeholder="e.g. 1496, 1490" />
          <button className="btn" disabled={!!busy} type="submit">{busy === 'pick' ? 'Adding…' : 'Add'}</button>
          <span className="spacer" />
          <button className="btn plain" type="button" disabled={!!busy} onClick={() => pull('sync')} title="Marks orders you fulfilled or refunded in Shopify">{busy === 'sync' ? 'Checking…' : '↻ Update from Shopify'}</button>
        </form>
        {msg && (
          <div className={`banner ${msg.tone}`} style={{ margin: '12px 0 0', boxShadow: 'none', border: '1px solid var(--border)' }}>
            <span>{msg.text.map((t, i) => <div key={i}>{t}</div>)}</span><span className="spacer" />
            {msg.retry && IS_PREVIEW && <button className="btn sm" onClick={() => pull(msg.retry, true)}>Use the 19 Nov snapshot</button>}
            <button className="btn plain sm" onClick={() => setMsg(null)}>✕</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><h3>To order from supplier</h3><span className="muted">{newLines.length} items · {groups.length} orders</span></div>
        {!groups.length ? (
          <Empty title={Object.keys(s.orders).length ? 'All caught up' : 'No orders yet'}><button className="btn primary" style={{ marginTop: 8 }} onClick={() => setPicking(true)}>+ Choose orders from Shopify</button></Empty>
        ) : (
          <div className="sheet-wrap">
            <table className="sheet m-cards">
              <thead><tr>
                <th className="chk"><input type="checkbox" checked={allChecked} onChange={(e) => setSel(e.target.checked ? new Set(newLines.map((l) => l.id)) : new Set())} /></th>
                <th className="pic">Photo</th><th>Item</th><th style={{ width: 140 }}>Metal</th><th style={{ width: 90 }}>Carat</th><th style={{ width: 120 }}>Size</th><th className="c" style={{ width: 70 }}>Qty</th><th style={{ width: 210 }}>Note for supplier</th>
              </tr></thead>
              <tbody>
                {groups.map(({ order, lines }) => (
                  <React.Fragment key={order.id}>
                    <tr className="group">
                      <td colSpan={8}>
                        <div className="row">
                          <input type="checkbox" checked={lines.every((l) => sel.has(l.id))} onChange={(e) => setSel((p) => { const n = new Set(p); lines.forEach((l) => e.target.checked ? n.add(l.id) : n.delete(l.id)); return n; })} />
                          <span className="gname">{order.name}</span>
                          <span>{order.customer}</span>
                          {!order.isStock && <span className="faint">{daysSince(order.createdAt)} days ago</span>}
                          {order.note && <Badge tone="yellow">Note: {order.note}</Badge>}
                          <span className="spacer" />
                          {!order.isStock && <button className="btn plain sm" onClick={() => setEditOrder(order.id)}>Edit order</button>}
                          <button className="btn plain sm" onClick={async () => { if (await ask({ title: `Remove ${order.name}?`, text: 'It comes off this list and won\'t be ordered. You can add it again later.', ok: 'Remove' })) { dismissOrder(order.id); } }}>Remove</button>
                        </div>
                      </td>
                    </tr>
                    {lines.map((l) => <Row key={l.id} line={l} order={order} checked={sel.has(l.id)} onToggle={() => toggle(l.id)} onEdit={() => setEditing(l.id)} />)}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {stockLines.length > 0 && (
        <details className="more">
          <summary>Taken from stock ({stockLines.length})</summary>
          <div className="card">
            {stockLines.map((l) => (
              <div className="result" key={l.id} style={{ cursor: 'default' }}><Thumb line={l} /><div style={{ flex: 1 }}><b>{l.item}</b><div className="small faint">{l.orderName} · {platingLabel(l.plating)} · {fullSize(l) || 'one size'}</div></div><button className="btn plain sm" onClick={() => undoStock(l.id)}>Undo</button></div>
            ))}
          </div>
        </details>
      )}

      {selected.length > 0 && (
        <div className="bulkbar">
          <span className="strong">{selected.length} selected</span>
          {selBlocked.length > 0 && <Badge tone="red">{selBlocked.length} need metal</Badge>}
          {drafts.length > 0 && (
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="new">New purchase order</option>
              {drafts.map((d) => <option key={d.id} value={d.id}>Add to {d.number}</option>)}
            </select>
          )}
          <button className="btn primary" onClick={makePO}>{target === 'new' ? 'Create purchase order' : 'Add to PO'}</button>
          <button className="btn" onClick={() => stock(selected)}>From stock</button>
        </div>
      )}
      {adding && <AddItem onClose={() => setAdding(false)} />}
      {picking && <AddOrders onClose={() => setPicking(false)} />}
      {editing && <EditLine lineId={editing} onClose={() => setEditing(null)} />}
      {editOrder && <EditOrder orderId={editOrder} onClose={() => setEditOrder(null)} />}
      <datalist id="carat-list">{['0.5ct', '1ct', '1.5ct', '2ct', '2.5ct', '3ct', '4ct', '5ct'].map((c) => <option key={c} value={c} />)}</datalist>
    </div>
  );
}

function Row({ line, order, checked, onToggle, onEdit }) {
  const [remember, setRemember] = useState(true);
  const warns = lineWarnings(line, order).filter((w) => w.level !== 'block' && !w.text.startsWith('Customer note'));
  const canRemember = !line.plating && line.productId && !line.flags?.includes('gift');
  const sub = line.setName ? `Part of ${line.setName}` : line.flags?.includes('gift') ? 'Free gift' : line.flags?.includes('manual') ? 'Added by hand' : '';
  return (
    <tr className={`${checked ? 'sel' : ''} has-chk`}>
      <td className="chk"><input type="checkbox" checked={checked} onChange={onToggle} /></td>
      <td className="pic"><PhotoUpload line={line} /></td>
      <td className="item">
        <button className="item-link" onClick={onEdit}>{line.item}<span className="edit-pen">✎</span></button>
        {sub && <div className="sub">{sub}</div>}
        {warns.map((w, i) => <div key={i} className={`flag ${w.level}`}>{w.text}</div>)}
      </td>
      <td data-label="Metal">
        <MetalSelect value={line.plating} onChange={(v) => setPlating(line.id, v, canRemember && remember)} />
        {canRemember && <label className="inline" style={{ marginTop: 3 }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: 13, height: 13 }} />Remember for this product</label>}
      </td>
      <td data-label="Carat"><input className="cell-in" type="text" list="carat-list" value={line.carat || ''} placeholder="—" onChange={(e) => updateLine(line.id, { carat: e.target.value })} /></td>
      <td data-label="Size"><input className="cell-in" type="text" value={line.size || ''} placeholder="—" onChange={(e) => updateLine(line.id, { size: e.target.value, sizeEdited: true })} /></td>
      <td data-label="Qty" className="c"><input className="cell-in" style={{ textAlign: 'center' }} type="number" min="1" value={line.qty} onChange={(e) => updateLine(line.id, { qty: Math.max(1, Number(e.target.value) || 1) })} /></td>
      <td data-label="Note"><input className="cell-in" type="text" value={line.supplierNote || ''} placeholder="Add note…" onChange={(e) => updateLine(line.id, { supplierNote: e.target.value })} /></td>
    </tr>
  );
}
