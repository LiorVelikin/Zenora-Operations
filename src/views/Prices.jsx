import React, { useMemo, useState } from 'react';
import { useStore, deletePrice } from '../lib/store.js';
import { fmtDate, money } from '../lib/status.js';
import { Metal, Empty, PageHead } from '../ui.jsx';

export default function Prices() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    const m = new Map();
    s.prices.forEach((p) => {
      if (!m.has(p.key)) m.set(p.key, { ...p, history: [] });
      m.get(p.key).history.push(p);
    });
    return [...m.values()].filter((r) => !q || r.key.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.item.localeCompare(b.item));
  }, [s.prices, q]);

  return (
    <div className="page">
      <PageHead title="Prices" sub="What you paid per item, saved each time you confirm a purchase order. Same item + plating + size = one row." />
      <div className="card">
        <div className="card-pad" style={{ paddingBottom: 12 }}><input type="search" placeholder="Filter items…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} /></div>
        {!s.prices.length ? <Empty title="No prices yet">Prices are saved here every time you confirm a purchase order.</Empty> : (
          <div className="sheet-wrap">
            <table className="sheet m-cards">
              <thead><tr><th>Item</th><th>Plating</th><th>Size</th><th className="r">Last price</th><th className="r">Lowest</th><th className="r">Highest</th><th className="c">Bought</th><th>Last PO</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const ps = r.history.map((h) => h.price);
                  return (
                    <React.Fragment key={r.key}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setOpen(open === r.key ? null : r.key)}>
                        <td className="strong">{open === r.key ? '▾' : '▸'} {r.item}</td><td data-label="Metal"><Metal plating={r.plating} /></td><td data-label="Size">{r.size || '—'}</td>
                        <td data-label="Last price" className="r strong">{money(r.price)}</td><td data-label="Lowest" className="r">{money(Math.min(...ps))}</td><td data-label="Highest" className="r">{money(Math.max(...ps))}</td>
                        <td data-label="Bought" className="c">{r.history.reduce((t, h) => t + (h.qty || 1), 0)}</td>
                        <td data-label="Last PO" className="muted">{r.po} · {fmtDate(r.at)}</td>
                      </tr>
                      {open === r.key && r.history.map((h, i) => (
                        <tr key={i}><td className="muted" style={{ paddingLeft: 30 }} colSpan={3}>{h.po} · {fmtDate(h.at)}</td><td className="r">{money(h.price)}</td><td colSpan={2} /><td className="c muted">{h.qty}</td><td className="r"><button className="btn plain sm danger" onClick={() => deletePrice(h.at, h.key)}>Delete</button></td></tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
