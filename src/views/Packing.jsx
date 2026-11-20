import React, { useMemo, useState } from 'react';
import { useStore, linesOfOrder, receiveShipment, receiveLine, unreceiveLine, packOrder, unpackOrder, deleteShipment, isGift } from '../lib/store.js';
import { fullSize, platingLabel } from '../lib/parse.js';
import { fmtDate, daysSince } from '../lib/status.js';
import { Thumb, Empty, Modal, useToast } from '../ui.jsx';
import EditLine from './EditLine.jsx';

// Packing: every open order in one scrolling list, sorted by what can be packed.
//   1. Ready to pack: everything is here
//   2. Complete when a package arrives: the missing items are on the way
//   3. Standby: some items here, others still being made
//   4. Waiting: nothing here yet
function classify(s, order) {
  const lines = linesOfOrder(s, order.id).filter((l) => l.status !== 'cancelled' && l.status !== 'done');
  if (!lines.length) return null;
  const here = lines.filter((l) => l.status === 'arrived');
  const coming = lines.filter((l) => l.status === 'shipped');
  const making = lines.filter((l) => l.status === 'ordered' || l.status === 'new');
  let group = 'waiting';
  if (here.length === lines.length) group = 'ready';
  else if (!making.length && coming.length) group = 'arriving';
  else if (here.length) group = 'standby';
  const pkgs = [...new Set(coming.map((l) => l.shipmentId).filter(Boolean))].map((id) => s.shipments[id]).filter(Boolean);
  const pkgDate = pkgs.length ? pkgs.map((p) => p.shippedAt).sort()[0] : null;
  return { order, lines, here, coming, making, group, pkgs, pkgDate };
}

const loadView = () => { try { return localStorage.getItem('zenora-pack-view') || 'cards'; } catch { return 'cards'; } };

export default function Packing({ admin = false }) {
  const s = useStore();
  const [checkIn, setCheckIn] = useState(null);
  const [view, setViewState] = useState(loadView);
  const setView = (v) => { setViewState(v); try { localStorage.setItem('zenora-pack-view', v); } catch { /* ignore */ } };
  const groups = useMemo(() => {
    const all = Object.values(s.orders).map((o) => classify(s, o)).filter(Boolean);
    const by = (g) => all.filter((x) => x.group === g);
    const oldest = (a, b) => a.order.createdAt.localeCompare(b.order.createdAt);
    return {
      ready: by('ready').sort(oldest),
      arriving: by('arriving').sort((a, b) => (a.pkgDate || '').localeCompare(b.pkgDate || '') || oldest(a, b)),
      standby: by('standby').sort(oldest),
      waiting: by('waiting').sort(oldest),
    };
  }, [s]);
  const incoming = Object.values(s.shipments).filter((sh) => !sh.arrivedAt).sort((a, b) => a.shippedAt.localeCompare(b.shippedAt));
  const sent = Object.values(s.orders).filter((o) => o.handedAt).sort((a, b) => b.handedAt.localeCompare(a.handedAt)).slice(0, 30);
  const jump = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="page narrow">
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="hello">Packing</div>
        <span className="spacer" />
        <div className="seg"><button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>List</button></div>
      </div>
      <div className="jump">
        <button onClick={() => jump('sec-ready')}><b>{groups.ready.length}</b> Ready to pack</button>
        <button onClick={() => jump('sec-arriving')}><b>{groups.arriving.length}</b> Complete when package arrives</button>
        <button onClick={() => jump('sec-standby')}><b>{groups.standby.length}</b> Standby</button>
        <button onClick={() => jump('sec-waiting')}><b>{groups.waiting.length}</b> Waiting</button>
      </div>

      {incoming.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>Packages on the way</h3><span className="muted small">When one arrives, check it in. You can also mark single items as "Here" below.</span></div>
          {incoming.map((sh) => (
            <div className="result" key={sh.id} style={{ cursor: 'default' }}>
              <div style={{ flex: 1 }}><b>{sh.number}</b> <span className="muted">· {sh.lineIds.length} items · sent {fmtDate(sh.shippedAt)} ({daysSince(sh.shippedAt)} days ago){sh.tracking ? ` · DHL ${sh.tracking}` : ''}</span></div>
              {admin && <button className="btn plain sm danger" onClick={() => deleteShipment(sh.id)}>Delete</button>}
              <button className="btn primary" onClick={() => setCheckIn(sh.id)}>It arrived</button>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && <OrderList groups={groups} onOpen={(id) => { setView('cards'); setTimeout(() => document.getElementById(`o-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }} />}
      {view === 'cards' && <>
      <Section id="sec-ready" title="Ready to pack" hint="Everything is here. Pack in any order you like." items={groups.ready} admin={admin} empty="Nothing is complete yet." />
      <Section id="sec-arriving" title="Complete when the package arrives" hint="The missing items are already on the way." items={groups.arriving} admin={admin} />
      <Section id="sec-standby" title="Standby: part of the order is here" hint="Keep these items on the standby shelf until the rest comes." items={groups.standby} admin={admin} />
      <details className="more" id="sec-waiting">
        <summary>Waiting: nothing here yet ({groups.waiting.length})</summary>
        {groups.waiting.map((x) => <OrderCard key={x.order.id} info={x} admin={admin} compact />)}
      </details>
      </>}
      {sent.length > 0 && (
        <details className="more">
          <summary>Recently packed ({sent.length})</summary>
          <div className="card">
            {sent.map((o) => <div className="result" key={o.id} style={{ cursor: 'default' }}><b>{o.name}</b><span>{o.customer}</span><span className="faint small">{fmtDate(o.handedAt, true)}</span><span className="spacer" /><button className="btn plain sm" onClick={() => unpackOrder(o.id)}>Undo</button></div>)}
          </div>
        </details>
      )}
      {checkIn && <CheckIn shipmentId={checkIn} onClose={() => setCheckIn(null)} />}
    </div>
  );
}

function Section({ id, title, hint, items, admin, empty }) {
  return (
    <div id={id} style={{ scrollMarginTop: 70 }}>
      <div className="sec-head"><h2>{title} <span className="faint">{items.length}</span></h2><div className="muted small">{hint}</div></div>
      {!items.length && empty && <div className="card"><Empty title={empty} /></div>}
      {items.map((x) => <OrderCard key={x.order.id} info={x} admin={admin} />)}
    </div>
  );
}

function OrderCard({ info, admin, compact }) {
  const s = useStore();
  const notify = useToast();
  const { order, lines, group } = info;
  const [editing, setEditing] = useState(null);
  const units = useMemo(() => {
    const u = {};
    lines.forEach((l) => (u[l.packUnit] ||= { id: l.packUnit, box: l.box, lines: [] }).lines.push(l));
    return Object.values(u);
  }, [lines]);
  const pieces = lines.reduce((t, l) => t + (l.qty || 1), 0);
  const checks = order.isStock
    ? [{ id: 'shelf', text: 'Put away in stock' }]
    : [...units.map((u) => ({ id: `u-${u.id}`, text: `${u.lines.length > 1 ? u.lines[0].setName || 'Set' : u.lines[0].item.replace(' (GIFT)', '')} → ${u.box.toLowerCase()}` })), { id: 'gra', text: `GRA certificate × ${pieces}` }, { id: 'card', text: 'Thank-you card' }];
  const [done, setDone] = useState(() => new Set());
  const all = checks.every((c) => done.has(c.id));

  const where = (l) => {
    if (l.status === 'arrived') return <span className="tag here">Here</span>;
    if (l.status === 'shipped') return <span className="tag coming">On the way · {s.shipments[l.shipmentId]?.number || ''}</span>;
    if (l.status === 'new') return <span className="tag">Not ordered yet</span>;
    return <span className="tag">Being made{l.remake ? ' (remake)' : ''}</span>;
  };

  return (
    <div className={`pack ${group === 'ready' ? 'ready' : ''}`} id={`o-${order.id}`} style={{ scrollMarginTop: 70 }}>
      <div className="pack-top">
        <div>
          <div className="who"><span className="no">{order.isStock ? 'STOCK' : order.name}</span> <span className="cust">{order.isStock ? 'No customer' : order.customer}</span></div>
          {!order.isStock && <div className="addr">{[order.address, order.city].filter(Boolean).join(', ')}{order.phone ? ` · ${order.phone}` : ''}</div>}
        </div>
        <span className="spacer" />
        <span className="muted small">{info.here.length} of {lines.length} here · ordered {daysSince(order.createdAt)}d ago</span>
      </div>
      {order.note && <div className="note-strip">Customer note: <b>{order.note}</b></div>}
      {!compact && units.map((u) => u.lines.map((l, i) => (
        <div className={`pack-row ${l.status === 'arrived' ? '' : 'not-here'}`} key={l.id}>
          <Thumb line={l} size="xl" />
          <div>
            <div className="pname">{l.item.replace(' (GIFT)', '')}{l.qty > 1 ? ` × ${l.qty}` : ''} {isGift(l) && <span className="tag gift">GIFT</span>}</div>
            <div className="psize">{fullSize(l) || 'One size'}</div>
            <div className="pmetal">{platingLabel(l.plating)}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {where(l)}
              {l.status !== 'arrived' && l.status !== 'new' && <button className="btn sm" onClick={() => { receiveLine(l.id); notify(`${l.item.replace(' (GIFT)', '')} marked as here`); }}>It's here</button>}
              {l.status === 'arrived' && group !== 'ready' && <button className="btn plain sm" onClick={() => unreceiveLine(l.id)}>Not here</button>}
              {admin && <button className="btn plain sm" onClick={() => setEditing(l.id)}>Edit</button>}
            </div>
          </div>
          {!order.isStock && (i === 0 ? <div className="box-tag">{u.box}{u.lines.length > 1 && <small>all {u.lines.length} pieces together</small>}</div> : <div />)}
        </div>
      )))}
      {compact && <div className="card-pad small muted">{lines.map((l) => `${l.item.replace(' (GIFT)', ' (gift)')}${fullSize(l) ? ` ${fullSize(l)}` : ''}`).join(' · ')}</div>}
      {group === 'ready' && (
        <>
          <div className="checks">
            {checks.map((c) => (
              <label className="check" key={c.id}>
                <input type="checkbox" checked={done.has(c.id)} onChange={() => setDone((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                {c.text}
              </label>
            ))}
          </div>
          <div className="pack-foot"><span className="spacer" /><button className="btn primary lg" disabled={!all} onClick={() => { packOrder(order.id); notify(order.isStock ? 'Done' : `${order.name} packed`); }}>{all ? 'Packed ✓' : 'Tick everything first'}</button></div>
        </>
      )}
      {group === 'arriving' && info.pkgs.length > 0 && <div className="pack-foot muted">Comes with {info.pkgs.map((p) => `${p.number} (sent ${fmtDate(p.shippedAt)})`).join(', ')}</div>}
      {editing && <EditLine lineId={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function CheckIn({ shipmentId, onClose }) {
  const s = useStore();
  const notify = useToast();
  const sh = s.shipments[shipmentId];
  const [got, setGot] = useState(() => new Set());
  if (!sh) return null;
  const ids = sh.lineIds.filter((id) => s.lines[id]);
  return (
    <Modal wide flush title={`${sh.number}: open the box and tick each item you find (${got.size}/${ids.length})`} onClose={onClose} footer={<>
      <button className="btn" onClick={() => setGot(new Set(ids))}>Tick all</button>
      <button className="btn primary" onClick={() => { receiveShipment(sh.id, [...got]); onClose(); notify(got.size === ids.length ? 'All checked in' : `${ids.length - got.size} item(s) marked missing`); }}>
        {got.size === ids.length ? 'Done: everything is here' : `Done (${ids.length - got.size} missing)`}
      </button>
    </>}>
      {ids.map((id) => {
        const l = s.lines[id];
        const on = got.has(id);
        const flip = () => setGot((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
        return (
          <label key={id} className={`tick-row ${on ? 'on' : ''}`}>
            <input type="checkbox" checked={on} onChange={flip} />
            <Thumb line={l} size="md" />
            <div style={{ flex: 1 }}><div className="strong" style={{ fontSize: 15 }}>{l.item.replace(' (GIFT)', '')}{isGift(l) ? ' (gift)' : ''}</div><div>{platingLabel(l.plating)} · <b style={{ fontSize: 15 }}>{fullSize(l) || 'one size'}</b>{l.qty > 1 ? ` · ×${l.qty}` : ''}</div></div>
            <div className="strong">{l.orderName}</div>
          </label>
        );
      })}
    </Modal>
  );
}

// Shopify-style list of every open order (same sorting), with select-all and bulk "Packed".
const GROUP_LABEL = { ready: ['Ready to pack', 'here'], arriving: ['Arrives with package', 'coming'], standby: ['Standby', ''], waiting: ['Waiting', ''] };
function OrderList({ groups, onOpen }) {
  const notify = useToast();
  const rows = [...groups.ready, ...groups.arriving, ...groups.standby, ...groups.waiting];
  const [sel, setSel] = useState(() => new Set());
  const all = rows.length > 0 && rows.every((x) => sel.has(x.order.id));
  const picked = rows.filter((x) => sel.has(x.order.id));
  const packable = picked.filter((x) => x.group === 'ready');
  const toggle = (id) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <>
      <div className="card">
        <div className="sheet-wrap" style={{ borderTop: 0 }}>
          <table className="sheet m-cards">
            <thead><tr>
              <th className="chk"><input type="checkbox" checked={all} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((x) => x.order.id)) : new Set())} /></th>
              <th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th className="c">Here</th><th>Ordered</th>
            </tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.order.id} className={`has-chk ${sel.has(x.order.id) ? 'sel' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(x.order.id)}>
                  <td className="chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(x.order.id)} onChange={() => toggle(x.order.id)} /></td>
                  <td className="strong" style={{ fontSize: 15 }}>{x.order.isStock ? 'STOCK' : x.order.name}</td>
                  <td data-label="Customer">{x.order.customer}<div className="small faint">{x.order.city}</div></td>
                  <td data-label="Items"><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>{x.lines.slice(0, 5).map((l) => <Thumb key={l.id} line={l} />)}{x.lines.length > 5 && <span className="faint small">+{x.lines.length - 5}</span>}</div></td>
                  <td data-label="Status"><span className={`tag ${GROUP_LABEL[x.group][1]}`}>{GROUP_LABEL[x.group][0]}{x.group === 'arriving' && x.pkgs[0] ? ` · ${x.pkgs[0].number}` : ''}</span></td>
                  <td data-label="Here" className="c strong">{x.here.length}/{x.lines.length}</td>
                  <td data-label="Ordered" className="muted">{daysSince(x.order.createdAt)}d ago</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {picked.length > 0 && (
        <div className="bulkbar">
          <span className="strong">{picked.length} selected</span>
          <button className="btn primary" disabled={!packable.length} onClick={() => { packable.forEach((x) => packOrder(x.order.id)); setSel(new Set()); notify(`${packable.length} order${packable.length > 1 ? 's' : ''} marked packed`); }}>
            Mark packed{packable.length !== picked.length ? ` (${packable.length} ready)` : ''}
          </button>
          <button className="btn plain" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}
    </>
  );
}
