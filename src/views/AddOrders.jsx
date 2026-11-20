import React, { useEffect, useMemo, useState } from 'react';
import { useStore, applyShopifyOrders } from '../lib/store.js';
import { orderStateFromShopify, itemNameFromTitle } from '../lib/parse.js';
import { fmtDate } from '../lib/status.js';
import { pullShopifyOrders, snapshotOrders, describePullError, IS_PREVIEW } from '../lib/platform.js';
import { Modal, Badge, Empty, useToast } from '../ui.jsx';

const day = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);
const SHORTCUTS = [['Today', 0], ['Last 3 days', 3], ['Last 7 days', 7], ['Last 14 days', 14], ['Last 30 days', 30]];

// Pick which Shopify orders to bring in: by date range, from a list.
export default function AddOrders({ onClose }) {
  const s = useStore();
  const notify = useToast();
  const [from, setFrom] = useState(day(7));
  const [to, setTo] = useState(day(0));
  const [orders, setOrders] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [hideDone, setHideDone] = useState(true);
  const [sel, setSel] = useState(() => new Set());
  const [source, setSource] = useState('');

  const inSystem = (o) => {
    const id = String(o.id).split('/').pop();
    return Object.values(s.lines).some((l) => l.orderId === id && l.status !== 'done' && l.status !== 'cancelled');
  };

  async function load(f = from, t = to, snapshot = false) {
    setBusy(true); setErr(null); setSel(new Set());
    try {
      const r = snapshot ? snapshotOrders(null, f, t) : await pullShopifyOrders({ from: f, to: t });
      setOrders(r.orders); setSource(r.source);
    } catch (e) { setErr(describePullError(e)); setOrders(null); }
    setBusy(false);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => (orders || [])
    .filter((o) => orderStateFromShopify(o) !== 'cancelled')
    .filter((o) => !hideDone || orderStateFromShopify(o) !== 'fulfilled')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [orders, hideDone]);
  const selectable = list.filter((o) => !inSystem(o));
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  function add() {
    const picked = list.filter((o) => sel.has(o.id));
    const r = applyShopifyOrders(picked, source, { manual: true });
    notify(`Added ${r.added.length} order${r.added.length === 1 ? '' : 's'}`);
    onClose();
  }

  return (
    <Modal wide flush title="Choose orders from Shopify" onClose={onClose} footer={<>
      <span className="muted" style={{ marginRight: 'auto' }}>{sel.size} selected</span>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn primary" disabled={!sel.size} onClick={add}>Add {sel.size || ''} order{sel.size === 1 ? '' : 's'}</button>
    </>}>
      <div className="card-pad" style={{ borderBottom: '1px solid var(--border2)' }}>
        <div className="row" style={{ marginBottom: 10 }}>
          {SHORTCUTS.map(([label, n]) => (
            <button key={label} className={`chip ${from === day(n) && to === day(0) ? 'on' : ''}`} onClick={() => { setFrom(day(n)); setTo(day(0)); load(day(n), day(0)); }}>{label}</button>
          ))}
        </div>
        <div className="row">
          <label className="inline">From <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="inline">To <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn" disabled={busy} onClick={() => load()}>{busy ? 'Loading…' : 'Show orders'}</button>
          <span className="spacer" />
          <label className="inline"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Hide fulfilled</label>
        </div>
        {err && <div className="note-strip" style={{ margin: '10px 0 0' }}>{err} {IS_PREVIEW && <button className="btn sm" style={{ marginLeft: 8 }} onClick={() => load(from, to, true)}>Use the 19 Nov snapshot</button>}</div>}
      </div>

      {busy && <Empty title="Loading orders…" />}
      {!busy && orders && !list.length && <Empty title="No orders in these dates" />}
      {!busy && list.length > 0 && (
        <table className="sheet m-cards">
          <thead><tr>
            <th className="chk"><input type="checkbox" checked={selectable.length > 0 && selectable.every((o) => sel.has(o.id))} onChange={(e) => setSel(e.target.checked ? new Set(selectable.map((o) => o.id)) : new Set())} /></th>
            <th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Shopify</th>
          </tr></thead>
          <tbody>
            {list.map((o) => {
              const added = inSystem(o);
              const st = orderStateFromShopify(o);
              const items = (o.lineItems?.nodes || []).filter((li) => !/מתנה/.test(li.title)).map((li) => `${itemNameFromTitle(li.title)}${li.quantity > 1 ? ` ×${li.quantity}` : ''}`);
              return (
                <tr key={o.id} className={`has-chk ${sel.has(o.id) ? 'sel' : ''}`} style={{ cursor: added ? 'default' : 'pointer', opacity: added ? 0.55 : 1 }} onClick={() => !added && toggle(o.id)}>
                  <td className="chk"><input type="checkbox" disabled={added} checked={sel.has(o.id)} onChange={() => toggle(o.id)} onClick={(e) => e.stopPropagation()} /></td>
                  <td className="strong">{o.name}</td>
                  <td data-label="Date" className="muted">{fmtDate(o.createdAt, true)}</td>
                  <td data-label="Customer">{o.shippingAddress?.name || o.customer?.displayName}</td>
                  <td data-label="Items" className="small" style={{ maxWidth: 360 }}>{items.join(', ')}</td>
                  <td data-label="Status">{added ? <Badge tone="blue">Already added</Badge> : st === 'fulfilled' ? <Badge tone="green">Fulfilled</Badge> : <Badge>Unfulfilled</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
