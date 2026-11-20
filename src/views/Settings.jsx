import React, { useState } from 'react';
import { useStore, replaceAll, exportAll } from '../lib/store.js';
import { saveFile } from '../lib/platform.js';
import { PageHead, useConfirm, useToast, copyText } from '../ui.jsx';

export default function Settings({ supplierKey }) {
  const s = useStore();
  const ask = useConfirm();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const base = typeof location !== 'undefined' ? `${location.origin}/` : '';
  const supplierLink = supplierKey ? `${base}?s=${encodeURIComponent(supplierKey)}` : '';
  const counts = `${Object.keys(s.orders).length} orders · ${Object.keys(s.lines).length} items · ${Object.keys(s.pos).length} POs · ${Object.keys(s.shipments).length} packages`;

  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.lines || !data.orders) throw new Error('This is not a Zenora data file.');
      if (!(await ask({ title: 'Load this data?', text: `It REPLACES everything in the system with: ${Object.keys(data.orders).length} orders, ${Object.keys(data.lines).length} items, ${Object.keys(data.pos || {}).length} POs. Everyone will see it within a few seconds.`, ok: 'Load data', danger: true }))) return;
      setBusy(true);
      replaceAll(data);
      notify('Loading… keep this page open until it says Saved');
    } catch (er) { notify(er.message, 'err'); }
    setBusy(false);
  }

  return (
    <div className="page narrow">
      <PageHead title="Settings" />
      <div className="card card-pad">
        <h3 style={{ marginBottom: 8 }}>Team links</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>Packing and customer service open the normal link and type their code. The supplier gets her own private link, with no code needed. It only opens her screen.</div>
        <div className="field"><label>App link (for you, packing, customer service)</label><div className="row" style={{ flexWrap: 'nowrap' }}><input type="text" readOnly value={base} /><button className="btn" onClick={() => copyText(base, notify)}>Copy</button></div></div>
        <div className="field"><label>Supplier's private link</label><div className="row" style={{ flexWrap: 'nowrap' }}><input type="text" readOnly value={supplierLink || 'Set SUPPLIER_KEY in Vercel first'} /><button className="btn" disabled={!supplierLink} onClick={() => copyText(supplierLink, notify)}>Copy</button></div></div>
      </div>
      <div className="card card-pad">
        <h3 style={{ marginBottom: 8 }}>Data</h3>
        <div className="muted small" style={{ marginBottom: 10 }}>{counts}</div>
        <div className="row">
          <button className="btn" onClick={() => saveFile(`zenora-backup-${new Date().toISOString().slice(0, 10)}.json`, new Blob([JSON.stringify(exportAll())], { type: 'application/json' }))}>Download backup</button>
          <label className="btn" style={{ cursor: 'pointer' }}>{busy ? 'Loading…' : 'Load data file'}<input type="file" accept=".json,application/json" hidden onChange={onFile} /></label>
        </div>
      </div>
    </div>
  );
}
