import React, { useMemo, useState } from 'react';
import { useStore, linesOfOrder, receiveShipment, receiveLine, unreceiveLine, packOrder, unpackOrder, deleteShipment, isGift } from '../lib/store.js';
import { fullSize, platingLabel } from '../lib/parse.js';
import { fmtDate, daysSince } from '../lib/status.js';
import { Thumb, Empty, Modal, useToast } from '../ui.jsx';
import { t, tSize } from '../lib/i18n.js';
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
        <div className="hello">{t('Packing')}</div>
        <span className="spacer" />
        <div className="seg"><button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>{t('Cards')}</button><button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>{t('List')}</button></div>
      </div>
      <div className="jump">
        <button className={groups.ready.length ? 'g' : ''} onClick={() => jump('sec-ready')}><b>{groups.ready.length}</b> {t('Ready to pack')}</button>
        <button className={groups.arriving.length ? 'b' : ''} onClick={() => jump('sec-arriving')}><b>{groups.arriving.length}</b> {t('Complete when package arrives')}</button>
        <button className={groups.standby.length ? 'y' : ''} onClick={() => jump('sec-standby')}><b>{groups.standby.length}</b> {t('Standby')}</button>
        <button onClick={() => jump('sec-waiting')}><b>{groups.waiting.length}</b> {t('Waiting')}</button>
      </div>

      {incoming.length > 0 && (
        <div className="card">
          <div className="card-head"><h3>{t('Packages on the way')}</h3><span className="muted small">{t('When one arrives, check it in. You can also mark single items as "Here" below.')}</span></div>
          {incoming.map((sh) => (
            <div className="result" key={sh.id} style={{ cursor: 'default', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 180 }}><b>{t(sh.number)}</b> <span className="muted">· {sh.note ? `${t('{n} items', { n: sh.lineIds.length })} · ${t(sh.note)}` : t('{n} items · sent {d} ({days} days ago)', { n: sh.lineIds.length, d: fmtDate(sh.shippedAt), days: daysSince(sh.shippedAt) })}{sh.tracking ? ` · DHL ${sh.tracking}` : ''}</span></div>
              {admin && <button className="btn plain sm danger" onClick={() => deleteShipment(sh.id)}>{t('Delete')}</button>}
              <button className="btn success" onClick={() => setCheckIn(sh.id)}>{sh.note ? t("Tick what's here") : t('It arrived')}</button>
            </div>
          ))}
        </div>
      )}

      {view === 'list' && <OrderList groups={groups} onOpen={(id) => { setView('cards'); setTimeout(() => document.getElementById(`o-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); }} />}
      {view === 'cards' && <>
      <Section id="sec-ready" tone="g" title={t('Ready to pack')} hint={t('Everything is here. Pack in any order you like.')} items={groups.ready} admin={admin} empty={t('Nothing is complete yet.')} />
      <Section id="sec-arriving" tone="b" title={t('Complete when the package arrives')} hint={t('The missing items are already on the way.')} items={groups.arriving} admin={admin} />
      <Section id="sec-standby" tone="y" title={t('Standby: part of the order is here')} hint={t('Keep these items on the standby shelf until the rest comes.')} items={groups.standby} admin={admin} />
      <details className="more" id="sec-waiting">
        <summary>{t('Waiting: nothing here yet ({n})', { n: groups.waiting.length })}</summary>
        {groups.waiting.map((x) => <OrderCard key={x.order.id} info={x} admin={admin} compact />)}
      </details>
      </>}
      {sent.length > 0 && (
        <details className="more">
          <summary>{t('Recently packed ({n})', { n: sent.length })}</summary>
          <div className="card">
            {sent.map((o) => <div className="result" key={o.id} style={{ cursor: 'default' }}><b>{o.name}</b><span>{o.customer}</span><span className="faint small">{fmtDate(o.handedAt, true)}</span><span className="spacer" /><button className="btn plain sm" onClick={() => unpackOrder(o.id)}>{t('Undo')}</button></div>)}
          </div>
        </details>
      )}
      {checkIn && <CheckIn shipmentId={checkIn} onClose={() => setCheckIn(null)} />}
    </div>
  );
}

function Section({ id, tone, title, hint, items, admin, empty }) {
  return (
    <div id={id} style={{ scrollMarginTop: 70 }}>
      <div className={`sec-head ${tone}`}><h2>{title} <span className="faint">{items.length}</span></h2><div className="muted small">{hint}</div></div>
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
    ? [{ id: 'shelf', text: t('Put away in stock') }]
    : [...units.map((u) => ({ id: `u-${u.id}`, text: `${u.lines.length > 1 ? u.lines[0].setName || t('Set') : u.lines[0].item.replace(' (GIFT)', '')} → ${t(u.box).toLowerCase()}` })), { id: 'gra', text: t('GRA certificate × {n}', { n: pieces }) }, { id: 'card', text: t('Thank-you card') }];
  const [done, setDone] = useState(() => new Set());
  const all = checks.every((c) => done.has(c.id));

  const where = (l) => {
    if (l.status === 'arrived') return <span className="tag here">✓ {t('Here')}</span>;
    if (l.status === 'shipped' && l.missingIn) return <span className="tag missing">{t('Missing from {p}', { p: t(l.missingIn) })}</span>;
    if (l.status === 'shipped') return <span className="tag coming">{t('On the way · {p}', { p: t(s.shipments[l.shipmentId]?.number || '') })}</span>;
    if (l.status === 'new') return <span className="tag new">{t('Not ordered yet')}</span>;
    return <span className="tag">{t(l.remake ? 'Being made (remake)' : 'Being made')}</span>;
  };

  return (
    <div className={`pack ${group}`} id={`o-${order.id}`} style={{ scrollMarginTop: 70 }}>
      <div className="pack-top">
        <div>
          <div className="who"><span className="no">{order.isStock ? t('STOCK') : order.name}</span> <span className="cust">{order.isStock ? t('No customer') : order.customer}</span></div>
          {!order.isStock && <div className="addr">{[order.address, order.city].filter(Boolean).join(', ')}{order.phone ? ` · ${order.phone}` : ''}</div>}
        </div>
        <span className="spacer" />
        <div className="pack-meta">
          <span className={`tag ${info.here.length === lines.length ? 'here' : ''}`}>{t('{n} of {m} here', { n: info.here.length, m: lines.length })}</span>
          <AgeTag order={order} />
        </div>
      </div>
      {order.note && <div className="note-strip">⚠ {t('Customer note')}: <b>{order.note}</b></div>}
      {!compact && units.map((u) => u.lines.map((l, i) => (
        <div className={`pack-row ${l.status === 'arrived' ? '' : 'not-here'}`} key={l.id}>
          <Thumb line={l} size="xl" />
          <div>
            <div className="pname">{l.item.replace(' (GIFT)', '')}{l.qty > 1 ? ` × ${l.qty}` : ''} {isGift(l) && <span className="tag gift">{t('GIFT')}</span>} {l.fromOrder && <span className="tag new">{t('Removed from {o}', { o: l.fromOrder })}</span>}</div>
            <div className="psize">{tSize(fullSize(l)) || t('One size')}</div>
            <div className="pmetal">{t(platingLabel(l.plating))}</div>
            <div className="row" style={{ marginTop: 8 }}>
              {where(l)}
              {l.status !== 'arrived' && l.status !== 'new' && <button className="btn sm" onClick={() => { receiveLine(l.id); notify(t('{name} marked as here', { name: l.item.replace(' (GIFT)', '') })); }}>{t("It's here")}</button>}
              {l.status === 'arrived' && group !== 'ready' && <button className="btn plain sm" onClick={() => unreceiveLine(l.id)}>{t('Not here')}</button>}
              {admin && <button className="btn plain sm" onClick={() => setEditing(l.id)}>{t('Edit')}</button>}
            </div>
          </div>
          {!order.isStock && (i === 0 ? <div className="box-tag">{t(u.box)}{u.lines.length > 1 && <small>{t('all {n} pieces together', { n: u.lines.length })}</small>}</div> : <div />)}
        </div>
      )))}
      {compact && <div className="card-pad small muted">{lines.map((l) => `${l.item.replace(' (GIFT)', ` ${t('(gift)')}`)}${fullSize(l) ? ` ${tSize(fullSize(l))}` : ''}${l.fromOrder ? ` (${t('Removed from {o}', { o: l.fromOrder })})` : ''}`).join(' · ')}</div>}
      {group === 'ready' && (
        <>
          <div className="checks">
            {checks.map((c) => (
              <label className={`check ${done.has(c.id) ? 'on' : ''}`} key={c.id}>
                <input type="checkbox" checked={done.has(c.id)} onChange={() => setDone((p) => { const n = new Set(p); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                {c.text}
              </label>
            ))}
          </div>
          <div className="pack-foot"><span className="spacer" /><button className={`btn lg ${all ? 'success' : 'primary'}`} disabled={!all} onClick={() => { packOrder(order.id); notify(order.isStock ? t('Done') : t('{name} packed', { name: order.name })); }}>{all ? t('Packed ✓') : t('Tick everything first')}</button></div>
        </>
      )}
      {group === 'arriving' && info.pkgs.length > 0 && <div className="pack-foot muted">{t('Comes with {p}', { p: info.pkgs.map((p) => (p.note ? t(p.number) : t('{p} (sent {d})', { p: t(p.number), d: fmtDate(p.shippedAt) }))).join(', ') })}</div>}
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
  const ids = sh.lineIds.filter((id) => s.lines[id]?.status === 'shipped');
  // "Earlier packages" holds items from several real boxes: only mark what's ticked, nothing goes "missing".
  const partial = !!sh.note;
  const finish = () => {
    if (partial) { got.forEach((id) => receiveLine(id)); onClose(); notify(t('{n} marked as here', { n: got.size })); return; }
    receiveShipment(sh.id, [...got]); onClose(); notify(got.size === ids.length ? t('All checked in') : t('{n} item(s) marked missing', { n: ids.length - got.size }));
  };
  return (
    <Modal wide flush title={t('{p}: open the box and tick each item you find ({n}/{m})', { p: t(sh.number), n: got.size, m: ids.length })} onClose={onClose} footer={<>
      <button className="btn" onClick={() => setGot(new Set(ids))}>{t('Tick all')}</button>
      <button className={`btn ${got.size === ids.length ? 'success' : 'primary'}`} disabled={partial && !got.size} onClick={finish}>
        {got.size === ids.length ? t('Done: everything is here') : partial ? t('Save: {n} here', { n: got.size }) : t('Done ({n} missing)', { n: ids.length - got.size })}
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
            <div style={{ flex: 1 }}><div className="strong" style={{ fontSize: 15 }}>{l.item.replace(' (GIFT)', '')}{isGift(l) ? ` ${t('(gift)')}` : ''}</div><div>{t(platingLabel(l.plating))} · <b style={{ fontSize: 15 }}>{tSize(fullSize(l)) || t('one size')}</b>{l.qty > 1 ? ` · ×${l.qty}` : ''}</div></div>
            <div className="strong">{l.orderName}</div>
          </label>
        );
      })}
    </Modal>
  );
}

// Shopify-style list of every open order (same sorting), with select-all and bulk "Packed".
const GROUP_LABEL = { ready: ['Ready to pack', 'here'], arriving: ['Arrives with package', 'coming'], standby: ['Standby', 'new'], waiting: ['Waiting', ''] };
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
              <th>{t('Order')}</th><th>{t('Customer')}</th><th>{t('Items')}</th><th>{t('Status')}</th><th className="c">{t('Here')}</th><th>{t('Ordered')}</th>
            </tr></thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.order.id} className={`has-chk ${sel.has(x.order.id) ? 'sel' : ''}`} style={{ cursor: 'pointer' }} onClick={() => onOpen(x.order.id)}>
                  <td className="chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={sel.has(x.order.id)} onChange={() => toggle(x.order.id)} /></td>
                  <td className="strong" style={{ fontSize: 15 }}>{x.order.isStock ? t('STOCK') : x.order.name}</td>
                  <td data-label={t('Customer')}>{x.order.customer}<div className="small faint">{x.order.city}</div></td>
                  <td data-label={t('Items')}><div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>{x.lines.slice(0, 5).map((l) => <Thumb key={l.id} line={l} />)}{x.lines.length > 5 && <span className="faint small">+{x.lines.length - 5}</span>}</div></td>
                  <td data-label={t('Status')}><span className={`tag ${GROUP_LABEL[x.group][1]}`}>{t(GROUP_LABEL[x.group][0])}</span></td>
                  <td data-label={t('Here')} className="c strong">{x.here.length}/{x.lines.length}</td>
                  <td data-label={t('Ordered')}><AgeTag order={x.order} plain /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {picked.length > 0 && (
        <div className="bulkbar">
          <span className="strong">{t('{n} selected', { n: picked.length })}</span>
          <button className="btn primary" disabled={!packable.length} onClick={() => { packable.forEach((x) => packOrder(x.order.id)); setSel(new Set()); notify(t('{n} orders marked packed', { n: packable.length })); }}>
            {packable.length !== picked.length ? t('Mark packed ({n} ready)', { n: packable.length }) : t('Mark packed')}
          </button>
          <button className="btn plain" onClick={() => setSel(new Set())}>{t('Clear')}</button>
        </div>
      )}
    </>
  );
}

// How long ago the customer ordered. Yellow from 14 days, red from 21 days (pack these first).
function AgeTag({ order, plain }) {
  if (order.isStock) return null;
  const d = daysSince(order.createdAt);
  const tone = d >= 21 ? 'late' : d >= 14 ? 'new' : '';
  if (plain && !tone) return <span className="muted">{t('{d}d ago', { d })}</span>;
  return <span className={`tag ${tone}`}>{tone === 'late' ? '⚠ ' : ''}{t('{d} days', { d })}</span>;
}
