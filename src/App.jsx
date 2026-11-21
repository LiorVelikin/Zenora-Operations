import React, { useEffect, useState } from 'react';
import { useStore, poStatus, resetAll, sync, startLive } from './lib/store.js';
import { getKey, setKey, api } from './lib/remote.js';
import Login from './views/Login.jsx';
import Settings from './views/Settings.jsx';
import { IS_PREVIEW } from './lib/platform.js';
import { Providers, useConfirm, useToast, Icon, LangButton } from './ui.jsx';
import Orders from './views/Orders.jsx';
import { POList, PODetail } from './views/POs.jsx';
import Prices from './views/Prices.jsx';
import Supplier from './views/Supplier.jsx';
import Packing from './views/Packing.jsx';
import Service from './views/Service.jsx';
import { t, useLang } from './lib/i18n.js';

// Each person gets one screen. In the live app the login decides the screen;
// in the preview you switch with the buttons in the top bar.
const ROLES = [
  { id: 'admin', label: 'Lior (admin)' },
  { id: 'supplier', label: 'Supplier' },
  { id: 'packing', label: 'Packing' },
  { id: 'service', label: 'Customer service' },
];
const ADMIN_PAGES = ['orders', 'pos', 'po', 'prices', 'settings', 'supplier', 'packing', 'service'];
const load = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

function parseHash() {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace('#', '');
  if (h.startsWith('po-')) return { page: 'po', id: h.slice(3) };
  return { page: ADMIN_PAGES.includes(h) ? h : 'orders', id: null };
}

const LABEL = { admin: 'Admin', supplier: 'Supplier', packing: 'Packing', service: 'Customer service' };

function SyncBadge() {
  useStore();
  if (IS_PREVIEW) return null;
  const label = sync.status === 'offline' ? 'Offline: retrying…' : sync.status === 'saving' ? 'Saving…' : 'Saved';
  return <span className={`sync ${sync.status}`} title={sync.error}>{t(label)}</span>;
}


// Live website: log in with a code (or the supplier's link), then load the shared data.
function LiveGate() {
  const [me, setMe] = useState(null);
  const [phase, setPhase] = useState(() => (getKey() ? 'checking' : 'login'));
  const [err, setErr] = useState('');
  async function enter(who) {
    setMe(who); setPhase('loading');
    try { await startLive(); setPhase('in'); } catch (e) { setErr(e.message); setPhase('error'); }
  }
  useEffect(() => {
    if (phase !== 'checking') return;
    api('/api/whoami').then(enter).catch((e) => { if (e.status === 401) setKey(''); setErr(e.status === 401 ? '' : e.message); setPhase('login'); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (phase === 'login') return <Login onIn={enter} error={err} />;
  if (phase === 'error') return <div className="login"><div className="login-card"><div className="login-logo">ZENORA</div><p>Could not load the data: {err}</p><button className="btn primary" onClick={() => location.reload()}>Try again</button></div></div>;
  if (phase !== 'in') return <div className="login"><div className="login-card"><div className="login-logo">ZENORA</div><p className="muted">{t('Loading…')}</p></div></div>;
  return <Shell liveRole={me.role} supplierKey={me.supplierKey} />;
}

function Shell({ liveRole = null, supplierKey = '' }) {
  const s = useStore();
  useLang();
  const ask = useConfirm();
  const notify = useToast();
  const [role, setRoleState] = useState(() => liveRole || load('zenora-ops-role', 'admin'));
  const logout = () => { setKey(''); location.reload(); };
  const [route, setRoute] = useState(parseHash);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const f = () => setRoute(parseHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  const setRole = (r) => { setRoleState(r); keep('zenora-ops-role', r); window.scrollTo(0, 0); };
  const nav = (page, id = null) => {
    setRoute({ page, id }); setMenuOpen(false);
    try { location.hash = page === 'po' ? `po-${id}` : page; } catch { /* ignore */ }
    window.scrollTo(0, 0);
  };

  const pos = Object.values(s.pos);
  const lines = Object.values(s.lines);
  const counts = {
    orders: lines.filter((l) => l.status === 'new' && !l.poId).length,
    pos: pos.filter((p) => ['draft', 'priced'].includes(poStatus(s, p).id)).length,
  };
  const item = (page, label, icon, n) => (
    <button className={`nav-item ${route.page === page || (page === 'pos' && route.page === 'po') ? 'on' : ''}`} onClick={() => nav(page)}>
      {icon}{label}{n > 0 && <span className="cnt">{n}</span>}
    </button>
  );

  const showLang = role === 'packing' || role === 'service' || (role === 'admin' && (route.page === 'packing' || route.page === 'service'));
  const switcher = !IS_PREVIEW ? (
    <div className="right-items">{showLang && <LangButton />}<SyncBadge /><span className="who-am-i">{t(LABEL[role])}</span>{role !== 'supplier' && <button className="link-btn" onClick={logout}>{t('Log out')}</button>}</div>
  ) : (
    <>
      <div className="role-switch desktop-only">
        {ROLES.map((r) => <button key={r.id} className={role === r.id ? 'on' : ''} onClick={() => setRole(r.id)}>{r.label}</button>)}
      </div>
      <select className="mobile-only role-select" value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
      </select>
      {showLang && <LangButton />}
    </>
  );
  const resetBtn = IS_PREVIEW && (
    <button className="btn plain sm" style={{ padding: '4px 0' }} onClick={async () => { if (await ask({ title: 'Reset the preview?', text: 'Clears all orders, POs and prices in this preview. Nothing in Shopify changes.', ok: 'Reset', danger: true })) { resetAll(); notify('Preview reset'); } }}>Reset preview</button>
  );

  // ---------- team member: one simple screen ----------
  if (role !== 'admin') {
    return (
      <div className="simple">
        <header className="topbar">
          <div className="logo"><b>ZENORA</b><span>{t(LABEL[role])}</span></div>
          <span className="spacer" />
          {switcher}
        </header>
        <main className="content">
          {role === 'supplier' && <Supplier />}
          {role === 'packing' && <Packing />}
          {role === 'service' && <Service />}
          {IS_PREVIEW && <div className="page small faint" style={{ marginTop: 30 }}>Preview: saved in this browser only. {resetBtn}</div>}
        </main>
      </div>
    );
  }

  // ---------- admin ----------
  return (
    <>
      <header className="topbar">
        <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">☰</button>
        <div className="logo"><b>ZENORA</b><span>Operations</span></div>
        <span className="spacer" />
        {switcher}
      </header>
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="nav-group">
          {item('orders', 'Orders', Icon.orders, counts.orders)}
          {item('pos', 'Purchase orders', Icon.po, counts.pos)}
          {item('prices', 'Prices', Icon.price)}
        </div>
        <div className="nav-group">
          {!IS_PREVIEW && item('settings', 'Settings', null)}
          <div className="nav-label" style={{ marginTop: 10 }}>Team screens</div>
          {item('supplier', 'Supplier', Icon.supplier)}
          {item('packing', 'Packing', Icon.packing)}
          {item('service', 'Customer service', Icon.service)}
        </div>
        {IS_PREVIEW && <div className="foot">Preview: saved in this browser only.<br />{resetBtn}</div>}
      </aside>
      {menuOpen && <div className="scrim" onClick={() => setMenuOpen(false)} />}
      <main className="content">
        {route.page === 'orders' && <Orders nav={nav} />}
        {route.page === 'pos' && <POList nav={nav} />}
        {route.page === 'po' && (s.pos[route.id] ? <PODetail poId={route.id} nav={nav} /> : <POList nav={nav} />)}
        {route.page === 'prices' && <Prices />}
        {route.page === 'settings' && <Settings supplierKey={supplierKey} />}
        {route.page === 'supplier' && <Supplier admin />}
        {route.page === 'packing' && <Packing admin />}
        {route.page === 'service' && <Service admin />}
      </main>
    </>
  );
}

export default function App() {
  return <Providers>{IS_PREVIEW ? <Shell /> : <LiveGate />}</Providers>;
}
