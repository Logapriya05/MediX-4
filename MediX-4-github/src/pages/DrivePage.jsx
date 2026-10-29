import React, { useEffect, useRef, useState } from 'react';
import { Simulator } from '../sim/Simulator.js';
import { store } from '../store.js';

const ENVS = [
  ['auto', 'Auto tour'], ['city', 'City traffic'], ['market', 'Market'], ['narrow', 'Narrow lanes'],
  ['ghat', 'Ghat climb'], ['hairpin', 'Hairpins'], ['hillstation', 'Hill station'], ['descent', 'Descent'],
];

const MODEL = (typeof window !== 'undefined' && window.__MEDIX_MODEL__) || `${import.meta.env.BASE_URL}ambulance.glb`;

export default function DrivePage({ active }) {
  const host = useRef(null);
  const sim = useRef(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState(null);
  const [st, setSt] = useState(null);
  const [env, setEnv] = useState('auto');
  const [building, setBuilding] = useState(false);

  const pickEnv = (k) => {
    if (k === env || building || !sim.current) return;
    setEnv(k);
    setBuilding(true);
    // let the overlay paint before the (synchronous) rebuild
    setTimeout(() => {
      try { sim.current.setEnvironment(k === 'auto' ? null : k); } catch (e) { console.error(e); }
      setTimeout(() => setBuilding(false), 120);
    }, 60);
  };

  useEffect(() => {
    let s;
    try {
      s = new Simulator(host.current, {
        modelUrl: MODEL,
        onStats: (x) => { setSt(x); store.set(x); },
        onReady: (e) => { if (e) setErr('The ambulance model could not be loaded.'); setReady(true); },
      });
      sim.current = s;
      window.__medix = s;
    } catch (e) {
      console.error(e);
      setErr('WebGL is not available in this browser.');
      setReady(true);
    }
    return () => { s && s.dispose(); };
  }, []);

  // keep driving in the background while the Dashboard tab is open
  const [dashOpen, setDashOpen] = useState(store.get().dashOpen || false);
  useEffect(() => store.sub((x) => setDashOpen(!!(x.dashOpen || x.sysOpen))), []);
  useEffect(() => { sim.current && sim.current.setActive(active, !active && dashOpen); }, [active, dashOpen]);
  useEffect(() => { store.set({ sim: sim.current }); }, [ready]);

  const speed = st ? Math.round(st.speed) : 0;
  return (
    <div className="feed">
      <div className="feed-canvas" ref={host} />
      <div className={'loader' + (ready && !building ? ' done' : '') + (building ? ' soft' : '')}>
        <div className="loader-inner">
          <div className="loader-ring" />
          <div className="label">{building ? `Loading ${ENVS.find((e) => e[0] === env)[1]}` : 'Building route'}</div>
        </div>
      </div>
      {err && <div className="hud glass hud-env" style={{ top: 'auto', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>{err}</div>}
      {st && (
        <>
          <div className="hud glass hud-env">
            <i className="env-icon" />
            <div>
              <div className="label">{env === 'auto' ? 'Environment · auto tour' : 'Environment · repeating'}</div>
              <div key={st.zoneKey} className="env-name env-swap">{st.zone}</div>
            </div>
          </div>
          <div className="hud glass hud-siren"><i className="siren-lamp" />CODE 3</div>
          <div className="envbar glass" role="tablist" aria-label="Choose environment">
            {ENVS.map(([k, l]) => (
              <button key={k} role="tab" aria-selected={env === k} className={env === k ? 'on' : ''} onClick={() => pickEnv(k)}>{l}</button>
            ))}
          </div>
          <div className="hud hud-cluster">
            <div className="glass gauge speed">
              <div className="label">Speed</div>
              <div className="big">{speed}<small>KM/H</small></div>
              <div className="speed-arc"><i style={{ width: `${Math.min(100, speed / 60 * 100)}%` }} /></div>
            </div>
            <div className="glass gauge">
              <div className="label">Battery</div>
              <div className="mid">{st.soc.toFixed(1)}<small>%</small></div>
              <div className="bar"><i style={{ width: `${st.soc}%`, background: st.soc < 20 ? 'var(--red)' : undefined }} /></div>
            </div>
            <div className="glass gauge">
              <div className="label">Motor</div>
              <div className="mid">{st.power.toFixed(1)}<small>kW</small></div>
              <div className={'state ' + st.status}>{st.status} · {Math.round(st.motorTemp)}°C</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
