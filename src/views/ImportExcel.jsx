import React, { useEffect, useMemo, useState } from 'react';
import { useStore, applyImport, poRows, importPricesFromSheet } from '../lib/store.js';
import { fullSize, platingLabel, PLATINGS } from '../lib/parse.js';
import { money } from '../lib/status.js';
import { getSampler } from '../lib/platform.js';
import { readWorkbookForAI, readSupplierExcel } from '../lib/excel.js';
import { smartRead, candidateLines } from '../lib/smartImport.js';
import { Modal, Thumb, Badge, Empty, useToast } from '../ui.jsx';

const CONF_TONE = { high: 'green', medium: 'yellow', low: 'red' };
const SAMPLE_ERR = {
  not_granted: 'Claude access was not allowed for this page. Allow it when asked, then try again.',
  sampling_disabled: 'Claude is not available on this account.',
  rate_limited: 'Too many requests right now. Wait a minute and try again.',
  prompt_too_large: 'This file is too big to read at once. Split it into smaller files.',
  invalid_json: 'Claude could not structure this file. Try again.',
  image_rejected: 'One of the photos in the file could not be read.',
};

// Upload the supplier's Excel → Claude reads it → you check the matches → apply.
export default function ImportExcel({ onClose, poId = null }) {
  const s = useStore();
  const notify = useToast();
  const [stage, setStage] = useState('pick'); // pick | reading | review
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [rows, setRows] = useState([]);
  const [cands, setCands] = useState([]);
  const [shipping, setShipping] = useState('');
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(true);
  const [fileName, setFileName] = useState('');
  const [sampler, setSampler] = useState(undefined);
  useEffect(() => { getSampler().then((fn) => setSampler(() => fn)); }, []);

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFileName(f.name); setErr(''); setStage('reading'); setProgress('Opening the file…');
    try {
      if (!sampler) {
        // No Claude here: simple reading by Ser No. (works for our own exported PO files)
        if (!poId) throw new Error('Smart reading needs Claude. Open this page in Claude, or import from inside a purchase order.');
        const r = await readSupplierExcel(f, poRows(s, poId));
        importPricesFromSheet(poId, r.matches, r.shipping);
        notify(`Imported ${r.matches.length} prices`); onClose(); return;
      }
      const wb = await readWorkbookForAI(f);
      setProgress(`Found ${wb.sheets.reduce((t, x) => t + x.rows.length, 0)} rows and ${wb.images.length} photos. Claude is reading…`);
      const res = await smartRead({ s, sampler, workbook: wb, poId, onProgress: (t) => setProgress(`${t} (${wb.images.length} photos, can take a minute)`) });
      setRows(res.rows); setCands(res.candidates); setShipping(res.shipping ?? ''); setNotes(res.notes || '');
      setStage('review');
    } catch (e2) {
      setErr(SAMPLE_ERR[e2?.code] || e2?.message || 'Could not read that file');
      setStage('pick');
    }
  }

  const upd = (id, patch) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const used = useMemo(() => new Set(rows.filter((r) => r.use && r.lineId).map((r) => r.lineId)), [rows]);
  const matched = rows.filter((r) => r.use && (r.lineId || r.createNew));
  const total = matched.reduce((t, r) => t + (Number(r.price) || 0) * (r.qty || 1), 0);

  function apply() {
    const r = applyImport({ rows, shipping: shipping === '' ? null : Number(shipping), confirm, fileName });
    notify(`${r.count} items updated${r.po ? ` · new ${r.po}` : ''}${r.shipped ? ` · ${r.shipped} marked shipped` : ''}`);
    onClose(r);
  }

  return (
    <Modal wide flush title={stage === 'review' ? `Check the matches · ${fileName}` : 'Import supplier Excel'} onClose={() => onClose()} footer={stage === 'review' ? <>
      <label className="inline" style={{ marginRight: 'auto' }}><input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />Prices are agreed (already ordered): confirm them</label>
      <button className="btn" onClick={() => setStage('pick')}>Start over</button>
      <button className="btn primary" disabled={!matched.length} onClick={apply}>Apply {matched.length} items</button>
    </> : null}>
      {stage === 'pick' && (
        <div className="card-pad">
          <p className="muted" style={{ marginTop: 0 }}>Upload the Excel the supplier sent: any layout, any tabs. Claude reads it, including the product photos, and matches each row to your open order items. Rows marked as shipped are detected. You check everything before anything changes.</p>
          {sampler === null && !poId && <div className="note-strip" style={{ margin: '0 0 12px' }}>Smart reading needs Claude and isn't available in this view.</div>}
          <label className="upload-box" style={{ height: 120 }}>
            <span style={{ fontSize: 24 }}>📄</span><span className="strong">Choose Excel file</span><span className="small faint">.xlsx</span>
            <input type="file" accept=".xlsx,.xlsm" hidden onChange={onFile} />
          </label>
          {err && <div className="note-strip" style={{ margin: '12px 0 0', background: 'var(--b-red-bg)', color: 'var(--b-red)' }}>{err}</div>}
          <div className="small faint" style={{ marginTop: 10 }}>{poId ? `Matching only against ${s.pos[poId]?.number}.` : `Matching against your ${candidateLines(s).length} open items (New, Ordered, On the way). Add the orders first so they can be matched.`}</div>
        </div>
      )}
      {stage === 'reading' && <Empty title="Reading the file…">{progress}</Empty>}
      {stage === 'review' && (
        <>
          <div className="card-pad row" style={{ borderBottom: '1px solid var(--border2)' }}>
            <span><b>{rows.length}</b> rows read</span>
            <Badge tone="green">{rows.filter((r) => r.lineId).length} matched</Badge>
            {rows.some((r) => !r.lineId) && <Badge tone="red">{rows.filter((r) => !r.lineId).length} not matched</Badge>}
            <Badge tone="purple">{rows.filter((r) => r.shipped).length} marked shipped</Badge>
            <span className="spacer" />
            <span className="muted">Items {money(total)}</span>
            <label className="inline">DHL <input type="number" style={{ width: 90 }} value={shipping} onChange={(e) => setShipping(e.target.value)} /></label>
          </div>
          {notes && <div className="note-strip" style={{ margin: '12px 16px 0' }}>{notes}</div>}
          <table className="sheet m-cards">
            <thead><tr><th className="chk">Use</th><th className="pic">Excel photo</th><th>In the Excel</th><th className="r" style={{ width: 100 }}>Price</th><th className="c">Shipped</th><th style={{ minWidth: 280 }}>Matched to your order item</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const line = r.lineId && s.lines[r.lineId];
                return (
                  <tr key={r.id} className="has-chk" style={{ opacity: r.use ? 1 : 0.45 }}>
                    <td className="chk"><input type="checkbox" checked={r.use} onChange={(e) => upd(r.id, { use: e.target.checked })} /></td>
                    <td className="pic"><div className="thumb md">{r.image ? <img src={r.image} alt="" /> : <span className="faint small">—</span>}</div></td>
                    <td className="item">
                      <b>{r.what || 'Item'}</b>
                      <div className="sub">{[r.plating && PLATINGS.find((p) => p.id === r.plating)?.supplier, r.carat, r.size, `qty ${r.qty}`].filter(Boolean).join(' · ')}</div>
                      <div className="sub">{r.sheet} · row {r.row}{r.ser !== '' ? ` · Ser ${r.ser}` : ''}</div>
                    </td>
                    <td data-label="Price" className="r"><input className="cell-in price filled" type="number" step="0.01" value={r.price ?? ''} onChange={(e) => upd(r.id, { price: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                    <td data-label="Shipped" className="c"><input type="checkbox" checked={r.shipped} onChange={(e) => upd(r.id, { shipped: e.target.checked })} /></td>
                    <td data-label="Match">
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        {line ? <Thumb line={line} /> : null}
                        <select value={r.createNew ? '__new' : (r.lineId || '')} onChange={(e) => upd(r.id, e.target.value === '__new' ? { createNew: true, lineId: null, confidence: null } : { createNew: false, lineId: e.target.value || null, confidence: e.target.value ? 'manual' : null })}>
                          <option value="">— Not matched (skip) —</option>
                          <option value="__new">+ Add as new stock item</option>
                          {cands.map(({ line: c }) => (
                            <option key={c.id} value={c.id} disabled={used.has(c.id) && c.id !== r.lineId}>
                              {c.orderName} · {c.item} · {platingLabel(c.plating)} · {fullSize(c) || 'no size'}{c.poId ? ` · ${s.pos[c.poId]?.number}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                      {r.confidence && r.confidence !== 'manual' && <div className="flag info"><Badge tone={CONF_TONE[r.confidence]}>{r.confidence}</Badge> {r.why}</div>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </Modal>
  );
}
