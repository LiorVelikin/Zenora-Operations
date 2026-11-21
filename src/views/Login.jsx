import React, { useState } from 'react';
import { api, setKey } from '../lib/remote.js';
import { t, useLang } from '../lib/i18n.js';
import { LangButton } from '../ui.jsx';

export default function Login({ onIn, error }) {
  useLang();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error || '');
  async function submit(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    setKey(code.trim());
    try { const r = await api('/api/whoami'); onIn(r); }
    catch (er) { setKey(''); setErr(er.status === 401 ? t('Wrong code. Try again.') : er.message); }
    setBusy(false);
  }
  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-logo">ZENORA</div>
        <div className="muted" style={{ marginBottom: 18 }}>Operations</div>
        <input type="password" inputMode="numeric" autoFocus placeholder={t('Your code')} value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn primary lg" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} disabled={busy || !code.trim()}>{busy ? t('Checking…') : t('Enter')}</button>
        {err && <div className="note-strip" style={{ margin: '12px 0 0', background: 'var(--b-red-bg)', color: 'var(--b-red)' }}>{err}</div>}
        <div style={{ marginTop: 18 }}><LangButton /></div>
      </form>
    </div>
  );
}
