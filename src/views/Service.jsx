import { fullSize } from '../lib/parse.js';
import React, { useMemo, useState } from 'react';
import { useStore, linesOfOrder, deleteOrder } from '../lib/store.js';
import EditLine from './EditLine.jsx';
import EditOrder from './EditOrder.jsx';
import { STAGES, stageIndex, orderStatus, csText, fmtDate, daysSince } from '../lib/status.js';
import { Thumb, Metal, StageBadge, Empty, useToast, useConfirm, copyText, Icon } from '../ui.jsx';

// Customer service: search → see where the order is → copy the reply.
export default function Service({ admin = false }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState(null);

  const all = useMemo(() => Object.values(s.orders)
    .filter((o) => !o.isStock && linesOfOrder(s, o.id).length)
    .map((o) => ({ o, st: orderStatus(linesOfOrder(s, o.id)) }))
    .sort((a, b) => b.o.createdAt.localeCompare(a.o.createdAt)), [s]);
  const term = q.trim().toLowerCase().replace(/^#/, '');
  const digits = term.replace(/\D/g, '');
  const list = term ? all.filter(({ o }) => {
    const phone = String(o.phone || '').replace(/\D/g, '');
    return o.name.toLowerCase().includes(term) || (o.customer || '').toLowerCase().includes(term)
      || (digits.length >= 4 && (phone.includes(digits) || phone.includes(digits.replace(/^0/, ''))));
  }) : all.slice(0, 15);
  const open = openId && all.find((x) => x.o.id === openId);

  if (open) return <OrderCard o={open.o} st={open.st} admin={admin} back={() => setOpenId(null)} />;

  return (
    <div className="page narrow">
      <div className="hello">Find an order</div>
      <div className="muted" style={{ marginBottom: 14 }}>Type the order number, the customer's name or phone.</div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <input className="cs-search" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 1496 or 054…" />
      </div>
      <div className="card">
        <div className="card-head"><h3>{term ? `${list.length} found` : 'Latest orders'}</h3></div>
        {!all.length && <Empty title="No orders yet" />}
        {all.length > 0 && !list.length && <Empty title="No order found">Check the number, or ask Lior.</Empty>}
        {list.map(({ o, st }) => (
          <div key={o.id} className="result" onClick={() => setOpenId(o.id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row" style={{ gap: 8 }}><b style={{ fontSize: 15 }}>{o.name}</b><span>{o.customer}</span></div>
              <div className="small faint">{fmtDate(o.createdAt)} · {daysSince(o.createdAt)} days ago</div>
            </div>
            <StageBadge status={st.stage.id} />
            <span className="faint">›</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrderCard({ o, st, back, admin }) {
  const s = useStore();
  const notify = useToast();
  const ask = useConfirm();
  const [editing, setEditing] = useState(null);
  const [editOrder, setEditOrder] = useState(false);
  const lines = linesOfOrder(s, o.id);
  const text = csText(st.stage.id);
  const first = (o.customer || '').split(' ')[0] || 'there';
  const reply = text.reply({ first, name: o.name });
  const cur = stageIndex(st.stage.id);
  const days = daysSince(o.createdAt);
  const late = st.stage.id !== 'done' && st.stage.id !== 'cancelled' && days >= 14;

  return (
    <div className="page narrow">
      <button className="btn plain" onClick={back} style={{ marginBottom: 10, paddingLeft: 0 }}>{Icon.back} Back to search</button>
      <div className="card">
        <div className="card-head"><h3 style={{ fontSize: 20 }}>{o.name}</h3><span style={{ fontSize: 15 }}>{o.customer}</span><span className="spacer" /><span className="muted small">ordered {fmtDate(o.createdAt)} · {days} days ago</span></div>
        <div className="card-pad" style={{ paddingTop: 4 }}>
          {st.stage.id === 'cancelled' ? <div className="strong">This order was cancelled or refunded.</div> : (
            <div className="steps">
              {STAGES.map((t, i) => <div key={t.id} className={`step ${i < cur || st.stage.id === 'done' ? 'done' : ''} ${i === cur && st.stage.id !== 'done' ? 'cur' : ''}`}><span className="b" />{t.short}</div>)}
            </div>
          )}
          <div style={{ marginTop: 14, fontSize: 14 }}><b>{st.stage.label}.</b> <span className="muted">{text.internal}</span></div>
          {late && <div className="note-strip" style={{ margin: '12px 0 0' }}>Ordered {days} days ago. Ask Lior before promising a date.</div>}
        </div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Reply to the customer</h3><span className="spacer" /><button className="btn primary" onClick={() => copyText(reply, notify)}>Copy</button></div>
        <div className="card-pad" style={{ paddingTop: 0 }}><div className="reply">{reply}</div></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>What they ordered</h3></div>
        {lines.map((l) => (
          <div className="result" key={l.id} style={{ cursor: 'default' }}>
            <Thumb line={l} />
            <div style={{ flex: 1, minWidth: 0 }}><b>{l.item}{l.qty > 1 ? ` × ${l.qty}` : ''}</b><div className="small muted"><Metal plating={l.plating} /> · {fullSize(l) || 'one size'}</div></div>
            <StageBadge status={l.status} />
            {admin && <button className="btn plain sm" onClick={() => setEditing(l.id)}>Edit</button>}
          </div>
        ))}
      </div>
      {admin && <div className="row" style={{ marginBottom: 12 }}><button className="btn" onClick={() => setEditOrder(true)}>Edit customer details</button><span className="spacer" /><button className="btn plain danger" onClick={async () => { if (await ask({ title: `Delete ${o.name} from the system?`, text: 'All its items are removed here (nothing changes in Shopify). You can add the order again later.', ok: 'Delete order', danger: true })) { deleteOrder(o.id); back(); notify('Order deleted'); } }}>Delete order from system</button></div>}
      {editing && <EditLine lineId={editing} onClose={() => setEditing(null)} />}
      {editOrder && <EditOrder orderId={o.id} onClose={() => setEditOrder(false)} />}
      <div className="muted small">Phone {o.phone || '—'} · {o.city}{o.note ? ` · Note: ${o.note}` : ''}</div>
    </div>
  );
}
