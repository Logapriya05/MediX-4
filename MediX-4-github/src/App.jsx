import React, { useState, useEffect } from 'react';
import DrivePage from './pages/DrivePage.jsx';
import LayoutPage from './pages/LayoutPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import HospitalsPage from './pages/HospitalsPage.jsx';
import ComponentsPage from './pages/ComponentsPage.jsx';
import InteriorPage from './pages/InteriorPage.jsx';
import SystemsPage from './pages/SystemsPage.jsx';

const TABS = [
  ['drive', 'DRIVE', DrivePage, 'Drive'],
  ['dashboard', 'DASHBOARD', DashboardPage, 'Dash'],
  ['hospitals', 'HOSPITALS', HospitalsPage, 'Hospitals'],
  ['layout', 'LAYOUT', LayoutPage, 'Layout'],
  ['components', 'COMPONENTS', ComponentsPage, 'Parts'],
  ['interior', 'INTERIOR', InteriorPage, 'Interior'],
  ['systems', 'SYSTEMS', SystemsPage, 'Systems'],
];

function TabIcon({ k }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const I = {
    drive: <g {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /><path d="M3.8 10.5 H10 M14 10.5 H20.2 M12 14 V20.5" /></g>,
    dashboard: <g {...p}><path d="M4 16 A8 8 0 1 1 20 16" /><path d="M12 16 L16 9.5" /><circle cx="12" cy="16" r="1.3" fill="currentColor" /></g>,
    hospitals: <g {...p}><path d="M12 21 C7 15.5 5 12.3 5 9.5 A7 7 0 0 1 19 9.5 C19 12.3 17 15.5 12 21 Z" /><path d="M12 6.5 V12.5 M9 9.5 H15" /></g>,
    layout: <g {...p}><rect x="3" y="7" width="15" height="10" rx="2" /><path d="M18 10 H20.5 L21.5 13 V17 H18" /><path d="M6 12 H9 L10.5 10 L12 14 L13.5 12 H15" /></g>,
    components: <g {...p}><path d="M12 3 L20 7.5 V16.5 L12 21 L4 16.5 V7.5 Z" /><path d="M4 7.5 L12 12 L20 7.5 M12 12 V21" /></g>,
    interior: <g {...p}><path d="M3 15 H15 V11 H8 A2 2 0 0 0 6 13 V15" /><path d="M3 15 V18 M15 15 V18 M3 18 H21 M18 18 V8 M16 8 H20" /></g>,
    systems: <g {...p}><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="9" y="14" width="6" height="6" rx="1.5" /><path d="M7 10 V12 H17 V10 M12 12 V14" /></g>,
  };
  return <svg className="tab-ico" viewBox="0 0 24 24" aria-hidden="true">{I[k]}</svg>;
}

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span>{t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>;
}

export default function App() {
  const initial = (typeof location !== 'undefined' && location.hash.slice(1)) || 'drive';
  const [tab, setTab] = useState(TABS.some((t) => t[0] === initial) ? initial : 'drive');
  // the drive is always mounted so the Dashboard can read it live
  const [visited, setVisited] = useState(() => new Set([tab, 'drive']));
  const go = (k) => {
    setTab(k);
    setVisited((v) => new Set(v).add(k));
    try { history.replaceState(null, '', '#' + k); } catch (e) { /* ignore */ }
  };
  useEffect(() => {
    const h = (e) => { if (e.detail && e.detail.comp) window.__medixComp = e.detail.comp; go(e.detail.tab); };
    window.addEventListener('medix:open', h);
    return () => window.removeEventListener('medix:open', h);
  });
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <svg viewBox="0 0 16 16"><path d="M6 1h4v5h5v4h-5v5H6v-5H1V6h5z" fill="#39ff88" /></svg>
          </div>
          <div className="brand-name">MEDIX<span>·</span>4</div>
          <div className="brand-sub">EV AMBULANCE</div>
        </div>
        <nav className="tabs">
          {TABS.map(([k, label, , short]) => (
            <button key={k} className={'tab' + (tab === k ? ' active' : '')} onClick={() => go(k)} aria-label={label} aria-current={tab === k ? 'page' : undefined}>
              <TabIcon k={k} />
              <span className="tab-long">{label}</span>
              <span className="tab-short">{short}</span>
            </button>
          ))}
        </nav>
        <div className="live"><i className="dot" /><span>LIVE ·</span> <Clock /></div>
      </header>
      <main className="stage">
        {TABS.map(([k, , Comp]) => (
          <section key={k} className={'page' + (tab === k ? ' active' : '')} aria-hidden={tab !== k}>
            {visited.has(k) && <Comp active={tab === k} />}
          </section>
        ))}
      </main>
    </div>
  );
}
