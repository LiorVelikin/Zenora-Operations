import React from 'react';
import { useStore, deleteShipment, setShipmentField } from '../lib/store.js';
import { fmtDate, daysSince } from '../lib/status.js';
import { Thumb, Badge, useConfirm } from '../ui.jsx';

// Packages the supplier sent (from her Excel or her link). Shown under Purchase orders.
export function PackagesList() {
  const s = useStore();
  const ask = useConfirm();
  const shipments = Object.values(s.shipments).sort((a, b) => b.shippedAt.localeCompare(a.shippedAt));
  if (!shipments.length) return null;
  return (
    <>
      <h3 style={{ margin: '24px 0 10px', fontSize: 15 }}>Packages from the supplier</h3>
      {shipments.map((sh) => (
        <div className="card" key={sh.id}>
          <div className="card-head">
            <h3>{sh.number}</h3>
            <span className="muted">sent {fmtDate(sh.shippedAt)} · {daysSince(sh.shippedAt)} days ago · {sh.lineIds.length} items{sh.source === 'excel' ? ' · from her Excel' : sh.source === 'supplier' ? ' · from her link' : ''}</span>
            <span className="spacer" />
            {sh.arrivedAt ? <Badge tone="green">Arrived {fmtDate(sh.arrivedAt)}</Badge> : <Badge tone="purple">On the way</Badge>}
            <input type="text" style={{ width: 160 }} placeholder="Tracking number" value={sh.tracking || ''} onChange={(e) => setShipmentField(sh.id, { tracking: e.target.value })} />
            <button className="btn plain sm danger" onClick={async () => { if (await ask({ title: `Delete ${sh.number}?`, text: 'Items that haven\'t arrived go back to "being made".', ok: 'Delete', danger: true })) deleteShipment(sh.id); }}>Delete</button>
          </div>
          <div className="card-pad row" style={{ paddingTop: 0, gap: 6 }}>
            {sh.lineIds.map((id) => s.lines[id]).filter(Boolean).map((l) => <span key={l.id} title={`${l.item} · ${l.orderName}`}><Thumb line={l} /></span>)}
          </div>
        </div>
      ))}
    </>
  );
}
