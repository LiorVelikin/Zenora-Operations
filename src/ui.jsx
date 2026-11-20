import React, { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { PLATINGS, platingLabel } from './lib/parse.js';
import { stageOf } from './lib/status.js';
import { imageUrl, compressImage } from './lib/platform.js';
import { updateLine } from './lib/store.js';

// ---------- icons ----------
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
export const Icon = {
  home: <svg viewBox="0 0 20 20" {...P}><path d="M3 9.5 10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z" /></svg>,
  orders: <svg viewBox="0 0 20 20" {...P}><path d="M4 3.5h12v13H4z" /><path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" /></svg>,
  po: <svg viewBox="0 0 20 20" {...P}><path d="M3 5h14v11H3z" /><path d="M3 8.5h14M7 12h2" /></svg>,
  price: <svg viewBox="0 0 20 20" {...P}><path d="M10.5 3H17v6.5L9.5 17 3 10.5z" /><circle cx="13.5" cy="6.5" r="1.2" /></svg>,
  supplier: <svg viewBox="0 0 20 20" {...P}><path d="M2.5 8 10 4l7.5 4v8.5h-15z" /><path d="M7 16.5v-5h6v5" /></svg>,
  packing: <svg viewBox="0 0 20 20" {...P}><path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" /><path d="M3 6.5 10 10l7-3.5M10 10v7" /></svg>,
  service: <svg viewBox="0 0 20 20" {...P}><path d="M4 4h12v9H8l-4 3.5z" /><path d="M7 7.5h6M7 10h4" /></svg>,
  search: <svg viewBox="0 0 20 20" {...P}><circle cx="9" cy="9" r="5.5" /><path d="m13 13 4 4" /></svg>,
  back: <svg viewBox="0 0 20 20" {...P} width="16" height="16"><path d="M12 4 6 10l6 6" /></svg>,
};
const ITEM_ICON = {
  ring: <svg viewBox="0 0 24 24" {...P}><circle cx="12" cy="14.5" r="6" /><path d="M9.5 5.5 12 3l2.5 2.5L12 8.5z" /></svg>,
  earrings: <svg viewBox="0 0 24 24" {...P}><circle cx="7" cy="9" r="2.6" /><circle cx="17" cy="9" r="2.6" /><path d="M7 11.6V15M17 11.6V15" /><circle cx="7" cy="17" r="1.6" /><circle cx="17" cy="17" r="1.6" /></svg>,
  bracelet: <svg viewBox="0 0 24 24" {...P}><ellipse cx="12" cy="12" rx="8.5" ry="5.5" /><circle cx="7" cy="9" r="1" /><circle cx="12" cy="6.6" r="1" /><circle cx="17" cy="9" r="1" /></svg>,
  necklace: <svg viewBox="0 0 24 24" {...P}><path d="M4 4c1 7 4 11 8 11s7-4 8-11" /><path d="M12 15l-2 3 2 3 2-3z" /></svg>,
  other: <svg viewBox="0 0 24 24" {...P}><path d="M6 4h12l3 5-9 11L3 9z" /><path d="M3 9h18" /></svg>,
};

export function Thumb({ line, size = '' }) {
  const [failed, setFailed] = useState(false);
  const src = imageUrl(line?.customImage) || imageUrl(line?.image, size === 'xl' ? 500 : 160) || imageUrl(line?.supplierImage);
  return (
    <div className={`thumb ${size}`} title={line?.shopifyTitle || line?.item}>
      {src && !failed ? <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} /> : (ITEM_ICON[line?.category] || ITEM_ICON.other)}
    </div>
  );
}

// Thumbnail you can click to upload / replace the photo.
export function PhotoUpload({ line, size = '' }) {
  const notify = useToast();
  async function onFile(e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try { updateLine(line.id, { customImage: await compressImage(f) }); notify('Photo saved'); }
    catch (er) { notify(er.message || 'Could not use that photo', 'err'); }
  }
  return (
    <label className="photo-up" title="Click to upload a photo">
      <Thumb line={line} size={size} />
      <span className="cam">📷</span>
      <input type="file" accept="image/*" hidden onChange={onFile} />
    </label>
  );
}

export function Metal({ plating, supplier }) {
  const p = PLATINGS.find((x) => x.id === plating);
  if (!p) return <span className="badge red">Not set</span>;
  return <span className="metal">{supplier ? p.supplier : p.label}</span>;
}

export function MetalSelect({ value, onChange }) {
  return (
    <select className={`cell-in ${value ? '' : 'need'}`} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="" disabled>Choose…</option>
      {PLATINGS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
    </select>
  );
}

const STAGE_TONE = { new: '', ordered: 'blue', shipped: 'purple', arrived: 'yellow', done: 'green', cancelled: 'red' };
export function StageBadge({ status }) {
  const s = stageOf(status);
  return <span className={`badge ${STAGE_TONE[s.id] || ''}`}>{s.short}</span>;
}
export function Badge({ tone = '', children }) { return <span className={`badge ${tone}`}>{children}</span>; }

export function Empty({ title, children }) {
  return <div className="empty"><h3>{title}</h3><div>{children}</div></div>;
}

export function PageHead({ title, sub, back, children }) {
  return (
    <div className="page-head">
      {back && <button className="back" onClick={back} aria-label="Back">{Icon.back}</button>}
      <h1>{title}</h1>
      <span className="spacer" />
      {children}
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(([id, label, n]) => (
        <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}{n != null && <span className="n">{n}</span>}</button>
      ))}
    </div>
  );
}

// ---------- modal ----------
export function Modal({ title, onClose, children, footer, wide, flush }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head"><h3>{title}</h3><span className="spacer" /><button className="btn plain sm" onClick={onClose} aria-label="Close">✕</button></div>
        <div className={`modal-body ${flush ? 'flush' : ''}`}>{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// In-page confirm + toast (browser dialogs are blocked in the preview frame).
const ConfirmCtx = createContext(null);
const ToastCtx = createContext(null);
export function Providers({ children }) {
  const [confirmState, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setConfirm({ ...opts, resolve })), []);
  const notify = useCallback((text, kind = '') => setToast({ text, kind, id: Math.random() }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === 'err' ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const close = (v) => { confirmState?.resolve(v); setConfirm(null); };
  return (
    <ConfirmCtx.Provider value={ask}>
      <ToastCtx.Provider value={notify}>
        {children}
        {confirmState && (
          <Modal title={confirmState.title} onClose={() => close(false)} footer={<>
            <button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${confirmState.danger ? 'danger' : 'primary'}`} onClick={() => close(true)}>{confirmState.ok || 'OK'}</button>
          </>}>
            <div className="muted" style={{ fontSize: 13.5 }}>{confirmState.text}</div>
          </Modal>
        )}
        {toast && <div className={`toast ${toast.kind}`} key={toast.id}>{toast.text}</div>}
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);
export const useToast = () => useContext(ToastCtx);

export async function copyText(text, notify) {
  try { await navigator.clipboard.writeText(text); notify?.('Copied'); }
  catch { notify?.('Copy blocked here: select the text and copy it manually', 'err'); }
}

export { platingLabel };
