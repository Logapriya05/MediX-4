import React, { useEffect, useMemo, useRef, useState } from 'react';

// "How charging works": four ways energy gets into MEDIX-4, each shown as an
// animated energy path, a step-by-step walkthrough, a live chart and readings.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r1 = (v) => v.toFixed(1);
const FORM = {
  ac: { c: '#ffb547', l: 'AC' },
  pdc: { c: '#ff8a3d', l: 'Pulsing DC' },
  dc: { c: '#39ff88', l: 'DC' },
  ph3: { c: '#b18cff', l: '3-phase AC' },
  light: { c: '#ffe066', l: 'Sunlight' },
  mech: { c: '#cfd6dc', l: 'Motion' },
};
const MASS = 1450; // kg, loaded mini ambulance

export const METHODS = {
  ac: {
    name: 'Plug-in AC', icon: 'plug', power: '3.3 kW', when: 'Parked at base or hospital',
    facts: [['20 → 80 %', '≈ 62 min'], ['80 → 100 %', '≈ 42 min'], ['Grid energy, 20→100 %', '≈ 4.5 kWh'], ['Cost at ₹8 / kWh', '≈ ₹36'], ['Range added per hour', '≈ 32 km']],
    stages: [['evse', 'Charging point', 'Wall box / socket'], ['type2', 'Type-2 inlet', 'Plug + pilot signal'], ['rect', 'Rectifier', 'AC → DC'], ['pfc', 'PFC boost', 'Smooths to 390 V'], ['dcdc', 'Isolated DC-DC', 'Sets battery V & A'], ['bms', 'BMS + contactors', 'Safety gate'], ['pack', 'Battery cells', '16 LFP cells']],
    links: [['ac', '230 V~'], ['ac', '230 V~'], ['pdc', '0–325 V'], ['dc', '390 V DC'], ['dc', '≤ 58.4 V'], ['dc', '≤ 58.4 V']],
    steps: [
      { t: 'Plug in', hl: [0, 1], flow: 0, d: 'The Type-2 plug clicks in and locks. A pilot signal (CP pin) tells the ambulance how much current the charging point can give (16 A), and the ambulance is blocked from driving while plugged in.' },
      { t: 'Safety handshake', hl: [1, 5], flow: 0, d: 'The BMS checks every cell voltage and temperature, then closes the pre-charge contactor (soft start) followed by the main contactor. Only now can current flow.' },
      { t: 'Rectify AC to DC', hl: [2], flow: 2, d: 'Mains electricity is 230 V AC, reversing direction 50 times a second. A diode bridge flips the negative half-waves up, giving pulsing DC that peaks at 325 V.' },
      { t: 'PFC boost', hl: [3], flow: 3, d: 'The Power-Factor-Correction stage smooths the pulses into a steady 390 V DC and draws current in step with the mains voltage (power factor 0.99), so no grid capacity is wasted.' },
      { t: 'Isolated DC-DC', hl: [4], flow: 4, d: 'A high-frequency transformer (100 kHz) steps 390 V down to battery voltage and electrically isolates the ambulance from the grid. This stage decides exactly how many amps go into the pack.' },
      { t: 'Constant current (CC)', hl: [5, 6], flow: 6, d: 'The charger pushes a steady ~57 A into the pack. Cell voltage climbs slowly from 3.3 V to 3.55 V. This fast phase takes the battery to 80 % in about an hour.' },
      { t: 'Constant voltage (CV)', hl: [5, 6], flow: 6, d: 'At 80 % the charger holds the pack at 58.4 V (3.65 V per cell) and current falls away naturally. The BMS balances cells by bleeding a little energy from the highest ones.' },
      { t: 'Full · stop', hl: [5, 6], flow: 0, d: 'When current drops below 3 A the pack is full. The charger stops, contactors open and the plug unlocks. The ambulance is ready to go.' },
    ],
  },
  solar: {
    name: 'Solar roof', icon: 'sun', power: 'up to 300 W', when: 'Whenever the sun is out, parked or driving',
    facts: [['Peak output', '≈ 290 W'], ['Sunny day', '≈ 1.2 kWh'], ['Cloudy day', '≈ 0.4 kWh'], ['Range per sunny day', '≈ 12 km'], ['Cost', 'Free']],
    stages: [['sun', 'Sunlight', 'Up to 1000 W/m²'], ['pv', 'PV panels', '2 × 150 W in series'], ['mppt', 'MPPT controller', 'Finds max power'], ['bms', 'BMS', 'Accepts trickle charge'], ['pack', 'Battery cells', '16 LFP cells']],
    links: [['light', 'photons'], ['dc', '30–44 V'], ['dc', '≈ 54 V'], ['dc', '≈ 54 V']],
    steps: [
      { t: 'Sunlight hits the roof', hl: [0, 1], flow: 1, d: 'Photons from the sun land on the silicon cells in the roof panels. Brighter sun means more photons and more power. Clouds can cut it by two thirds.' },
      { t: 'Panels make DC', hl: [1], flow: 1, d: 'Each photon knocks an electron loose in the silicon, creating a direct current. Two 150 W panels wired in series give about 36 V at full sun.' },
      { t: 'MPPT finds the sweet spot', hl: [2], flow: 2, d: 'Panel power depends on the voltage it is held at. The MPPT controller tests the voltage every 100 ms to find the maximum-power point, then boosts it up to battery voltage (≈ 54 V).' },
      { t: 'Trickle into the pack', hl: [3, 4], flow: 4, d: 'The BMS accepts the small current (up to ~5 A). On a sunny day the roof adds about 1.2 kWh, which is roughly 12 km of range or 7 hours of medical equipment.' },
    ],
  },
  regen: {
    name: 'Regen braking', icon: 'motor', power: 'up to 5 kW', when: 'Every time the ambulance slows down',
    facts: [['Max regen power', '5 kW (BMS limit)'], ['City trips', '15–25 % energy back'], ['Ghat descents', 'up to 35 % back'], ['Below 8 km/h', 'Friction brakes only'], ['Brake pad wear', '≈ 50 % less']],
    stages: [['wheel', 'Wheels', 'Still rolling'], ['gen', 'Motor as generator', 'Magnets spin past coils'], ['inv', 'Controller', 'Rectifies + boosts'], ['bms', 'BMS', 'Limits charge current'], ['pack', 'Battery cells', '16 LFP cells']],
    links: [['mech', 'motion'], ['ph3', '3-phase AC'], ['dc', '≈ 54 V'], ['dc', '≈ 54 V']],
    steps: [
      { t: 'Driver lifts off or brakes', hl: [0], flow: 1, d: 'The moment the driver lifts the accelerator or touches the brake pedal, the controller switches the motor from "drive" to "generate". The ambulance\'s motion is now the energy source.' },
      { t: 'Motor becomes a generator', hl: [1], flow: 2, d: 'The wheels keep turning the motor. Its spinning magnets sweep past the copper coils and induce 3-phase AC (back-EMF). Resisting that current is what slows the ambulance down.' },
      { t: 'Controller turns it into DC', hl: [2], flow: 3, d: 'The controller\'s six MOSFET switches work in reverse as a synchronous rectifier: they turn the 3-phase AC into DC and boost it just above pack voltage so current flows into the battery.' },
      { t: 'BMS takes what it safely can', hl: [3, 4], flow: 4, d: 'The BMS caps charging at about 5 kW (1C for this pack), less when the pack is cold or above 95 %. Any extra braking force, and the final crawl below 8 km/h, goes to the normal friction brakes.' },
    ],
  },
  aux: {
    name: '12 V aux battery', icon: 'bolt', power: '≈ 1.2 kW', when: 'Always, whenever the main pack is on',
    facts: [['DC-DC rating', '1.2 kW · 13.8 V'], ['Aux battery', '12 V 40 Ah AGM'], ['Bulk / absorption', '14.4 V'], ['Float', '13.6 V'], ['Medical backup', '≈ 45 min']],
    stages: [['pack', 'Main pack', '51.2 V'], ['dcdc', 'DC-DC converter', '51 V → 14.4 V'], ['aux', '12 V AGM battery', 'Backup for medical'], ['loads', 'Medical + lights', 'Monitor, suction, siren']],
    links: [['dc', '51.2 V'], ['dc', '13.6–14.4 V'], ['dc', '12–13.8 V']],
    steps: [
      { t: 'Main pack feeds the DC-DC', hl: [0, 1], flow: 1, d: 'The 12 V system has no alternator like a diesel ambulance. Instead, the 51.2 V traction pack feeds a DC-DC converter.' },
      { t: 'Step down to 12 V', hl: [1], flow: 2, d: 'The converter switches at 100 kHz through a small transformer and outputs a regulated 13.6–14.4 V, isolated from the high-voltage side.' },
      { t: '3-stage charging', hl: [2], flow: 2, d: 'Bulk: constant current until ~80 %. Absorption: holds 14.4 V while current tapers. Float: drops to 13.6 V to keep the battery topped up without overcharging it.' },
      { t: 'Medical backup', hl: [2, 3], flow: 3, d: 'The same rail runs the patient monitor, suction, lights and siren. If the main pack is switched off, the 12 V battery keeps the medical equipment running for about 45 minutes.' },
    ],
  },
};

// ------------------------------------------------------------ simulations
function useSim(method, active, ctl) {
  const ref = useRef(null);
  const [, setK] = useState(0);
  if (!ref.current || ref.current.method !== method) ref.current = initSim(method);
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    const i = setInterval(() => {
      const now = performance.now(); const dt = Math.min(0.25, (now - last) / 1000); last = now;
      if (!ctl.current.paused) stepSim(ref.current, dt * ctl.current.speed, ctl.current);
      setK((k) => (k + 1) % 1e6);
    }, 100);
    return () => clearInterval(i);
  }, [active, method]); // eslint-disable-line
  return ref.current;
}

function initSim(method) {
  return { method, t: 0, phase: 'steps', stepT: 0, step: 0, soc: 22, realMin: 0, v: 50, wh: 0, totalWh: 0, aux: 58, auxMin: 0, hour: 12.5 };
}
// AC timeline: steps 1–5 at 3 s each, then CC and CV run accelerated
const AC_STEP_S = 3.2;
function acValues(S) {
  const soc = S.soc;
  const cv = S.phase === 'cv' || (S.phase === 'done');
  const cellV = S.phase === 'cc' ? 3.3 + (soc / 80) * 0.25 : cv ? 3.65 : 3.2 + soc * 0.0016;
  const packV = cellV * 16;
  let ib = 0;
  if (S.phase === 'cc') ib = 3300 * 0.92 / packV;
  if (S.phase === 'cv') ib = (3300 * 0.92 / 58.4) * Math.exp(-3 * (soc - 80) / 20);
  const pout = ib * packV;
  const iac = pout > 0 ? pout / 0.92 / 230 : (S.phase === 'steps' && S.step >= 1 ? 0.2 : 0);
  return { cellV, packV, ib, pout, iac, cv };
}
function stepSim(S, dt, ctl) {
  S.t += dt;
  if (S.method === 'ac') {
    if (S.phase === 'steps') {
      S.stepT += dt; S.step = Math.floor(S.stepT / AC_STEP_S);
      if (S.step >= 5) { S.phase = 'cc'; S.step = 5; }
    } else if (S.phase === 'cc') {
      const d = 2.8 * dt; S.soc = Math.min(80, S.soc + d); S.realMin += d / 100 * 5.12 / 3.04 * 60;
      if (S.soc >= 80) { S.phase = 'cv'; S.step = 6; }
    } else if (S.phase === 'cv') {
      const k = Math.exp(-3 * (S.soc - 80) / 20);
      const d = 2.8 * dt * Math.max(0.12, k); S.soc = Math.min(100, S.soc + d); S.realMin += d / 100 * 5.12 / (3.04 * k) * 60;
      if (k * 57 < 3) { S.phase = 'done'; S.step = 7; S.stepT = 0; }
    } else if (S.phase === 'done') {
      S.stepT += dt;
      if (S.stepT > 6) Object.assign(S, initSim('ac'));
    }
  } else if (S.method === 'regen') {
    const a = { lift: 0.6, brake: 1.6, hard: 4.0 }[ctl.brake];
    if (S.phase === 'steps') S.phase = 'brake';
    if (S.phase === 'brake') {
      const v = S.v / 3.6;
      const r = regenAt(S.v, a);
      S.wh += (r.pe * dt) / 3600;
      S.v = Math.max(0, (v - a * dt) * 3.6);
      if (S.v <= 0) { S.phase = 'stopped'; S.stepT = 0; S.totalWh += S.wh; }
    } else if (S.phase === 'stopped') {
      S.stepT += dt;
      if (S.stepT > 1.8) { S.phase = 'drive'; }
    } else if (S.phase === 'drive') {
      S.v = Math.min(ctl.v0, S.v + 9 * dt);
      if (S.v >= ctl.v0) { S.phase = 'brake'; S.wh = 0; }
    }
  } else if (S.method === 'aux') {
    const d = dt * 2.2;
    S.aux = S.aux + (S.aux < 80 ? d : S.aux < 98 ? d * 0.35 : 0);
    S.auxMin += dt * 2.5;
    if (S.aux >= 98) { S.stepT += dt; if (S.stepT > 8) { S.aux = 58; S.stepT = 0; S.auxMin = 0; } }
  } else if (S.method === 'solar') {
    if (ctl.timelapse) { S.hour += dt * 0.35; if (S.hour > 18.2) S.hour = 6; ctl.setHour && ctl.setHour(S.hour); }
  }
}
function regenAt(kmh, a) {
  const v = kmh / 3.6;
  const pm = MASS * a * v; // braking power needed (W)
  let pe = Math.min(pm * 0.85, 5000); // motor + controller efficiency, BMS cap (1C)
  if (kmh < 8) pe *= clamp((kmh - 2) / 6, 0, 1); // back-EMF too low near standstill
  const share = pm > 1 ? clamp(pe / 0.85 / pm, 0, 1) : 0;
  return { pm, pe, share };
}
function solarAt(hour, cloudy) {
  const G = Math.max(0, Math.sin(Math.PI * (hour - 6) / 12)) * 1000 * (cloudy ? 0.35 : 1);
  const Voc = G > 5 ? 44 + 2.4 * Math.log(G / 1000) : 0;
  const Isc = 8.9 * G / 1000;
  const Vt = 3.1;
  const I = (V) => Math.max(0, Isc * (1 - (Math.exp(V / Vt) - 1) / (Math.exp(Math.max(Voc, 1) / Vt) - 1)));
  let best = { v: 0, p: 0, i: 0 };
  for (let V = 0; V <= Voc; V += 0.25) { const p = V * I(V); if (p > best.p) best = { v: V, p, i: I(V) }; }
  return { G, Voc, Isc, I, mpp: best };
}

// ------------------------------------------------------------ view
export default function ChargingView({ active, method, setMethod }) {
  const [auto, setAuto] = useState(true);
  const [pick, setPick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [brake, setBrake] = useState('brake');
  const [v0, setV0] = useState(50);
  const [hour, setHour] = useState(12.5);
  const [cloudy, setCloudy] = useState(false);
  const [timelapse, setTimelapse] = useState(false);
  const ctl = useRef({});
  ctl.current = { paused, speed, brake, v0, timelapse, setHour };
  const S = useSim(method, active, ctl);
  const M = METHODS[method];

  // which step is active
  const [autoIdx, setAutoIdx] = useState(0);
  useEffect(() => { setAutoIdx(0); setPick(0); setAuto(true); }, [method]);
  useEffect(() => {
    if (!active || method === 'ac' || !auto || paused) return;
    const i = setInterval(() => setAutoIdx((k) => (k + 1) % M.steps.length), 4200);
    return () => clearInterval(i);
  }, [active, method, auto, paused, M.steps.length]);
  useEffect(() => { if (method === 'solar' && S) S.hour = hour; }, [hour]); // eslint-disable-line

  let stepIdx;
  if (method === 'ac') stepIdx = auto ? clamp(S.step, 0, 7) : pick;
  else stepIdx = auto ? autoIdx : pick;
  const step = M.steps[stepIdx];

  const chooseStep = (i) => {
    if (method === 'ac') {
      // jump the charging session to that moment
      Object.assign(S, initSim('ac'));
      if (i < 5) { S.stepT = i * AC_STEP_S + 0.01; S.step = i; }
      else if (i === 5) { S.phase = 'cc'; S.step = 5; S.stepT = 99; S.soc = 30; S.realMin = 8; }
      else if (i === 6) { S.phase = 'cv'; S.step = 6; S.soc = 81; S.realMin = 62; }
      else { S.phase = 'done'; S.step = 7; S.soc = 100; S.realMin = 104; S.stepT = 0; }
      setAuto(true);
    } else { setPick(i); setAuto(false); }
  };

  // live numbers for the selected method
  const live = useMemo(() => liveValues(method, S, { brake, hour, cloudy }), [method, S, S.t, brake, hour, cloudy, S.v, S.soc]); // eslint-disable-line
  const flowK = method === 'ac' ? (S.phase === 'cc' ? 1 : S.phase === 'cv' ? live.ib / 57 : 0.25)
    : method === 'regen' ? (S.phase === 'brake' ? clamp(live.pe / 5000, 0.1, 1) : 0)
    : method === 'solar' ? clamp(live.p / 300, 0, 1) : 0.7;
  const flowN = method === 'ac' ? step.flow : method === 'regen' && S.phase !== 'brake' ? 0 : method === 'solar' && live.p < 2 ? 0 : M.links.length;

  return (
    <>
      <div className="cv-methods">
        {Object.entries(METHODS).map(([k, m]) => (
          <button key={k} className={'cv-mtab' + (method === k ? ' on' : '')} onClick={() => setMethod(k)}>
            <span className="cv-mico"><svg viewBox="-12 -12 24 24"><MIcon k={m.icon} /></svg></span>
            <span><b>{m.name}</b><small>{m.power} · {m.when}</small></span>
          </button>
        ))}
      </div>

      <div className="card cv-diagram">
        <h3>
          <span>Energy path · {M.name}</span>
          <span className="cv-path">{M.stages.map((s) => s[1]).join('  →  ')}</span>
        </h3>
        <Path M={M} method={method} S={S} live={live} step={step} flowN={flowN} flowK={flowK} active={active} />
        <div className="cv-callout" key={method + stepIdx}>
          <span className="cv-cnum">{stepIdx + 1}</span>
          <div><b>{step.t}</b><p>{step.d}</p></div>
        </div>
        <div className="cv-forms">
          {[...new Set(M.links.map((l) => l[0]))].map((f) => <span key={f} style={{ '--fc': FORM[f].c }}><i />{FORM[f].l}</span>)}
          <em className="sx-swipe">swipe the path →</em>
        </div>
      </div>

      <div className="card cv-steps">
        <h3>
          <span>Step by step</span>
          <span className="sx-scen small">
            <button className={auto ? 'on' : ''} onClick={() => setAuto(true)}>Auto</button>
            <button className={paused ? 'on' : ''} onClick={() => setPaused(!paused)}>{paused ? 'Paused' : 'Pause'}</button>
          </span>
        </h3>
        <ol className="cv-list">
          {M.steps.map((s, i) => (
            <li key={i} className={(i === stepIdx ? 'on' : '') + (i < stepIdx ? ' done' : '')}>
              <button onClick={() => chooseStep(i)}>
                <span className="cv-num">{i < stepIdx ? '✓' : i + 1}</span>
                <span className="cv-st"><b>{s.t}</b></span>
              </button>
            </li>
          ))}
        </ol>
        <div className="cv-facts">
          <span className="label">Quick facts · {M.name}</span>
          <div className="list">
            {M.facts.map(([a, b]) => <div className="list-row" key={a}><span>{a}</span><span>{b}</span></div>)}
          </div>
        </div>
      </div>

      <div className="card cv-chart">
        <Chart method={method} S={S} live={live} hour={hour} cloudy={cloudy} brake={brake} v0={v0} />
      </div>

      <div className="card cv-live">
        <h3><span>Live readings</span><span className="pill ok">{live.badge}</span></h3>
        <div className="cv-metrics">
          {live.metrics.map(([l, v, u]) => <div key={l}><span className="label">{l}</span><b>{v}<small>{u}</small></b></div>)}
        </div>
        <div className="cv-ctl">
          {method === 'ac' && (<>
            <span className="label">Time-lapse</span>
            <span className="sx-scen small">{[1, 2, 4].map((k) => <button key={k} className={speed === k ? 'on' : ''} onClick={() => setSpeed(k)}>{k}×</button>)}</span>
            <button className="cv-btn" onClick={() => chooseStep(0)}>↺ Restart</button>
          </>)}
          {method === 'solar' && (<>
            <label className="cv-slider"><span className="label">Time {fmtHour(hour)}</span>
              <input type="range" min="6" max="18" step="0.1" value={hour} onChange={(e) => { setTimelapse(false); setHour(+e.target.value); }} /></label>
            <span className="sx-scen small">
              <button className={cloudy ? 'on' : ''} onClick={() => setCloudy(!cloudy)}>Cloudy</button>
              <button className={timelapse ? 'on' : ''} onClick={() => setTimelapse(!timelapse)}>Day ▶</button>
            </span>
          </>)}
          {method === 'regen' && (<>
            <label className="cv-slider"><span className="label">Start speed {v0} km/h</span>
              <input type="range" min="20" max="80" step="5" value={v0} onChange={(e) => setV0(+e.target.value)} /></label>
            <span className="sx-scen small">
              {[['lift', 'Lift-off'], ['brake', 'Brake'], ['hard', 'Hard']].map(([k, l]) => <button key={k} className={brake === k ? 'on' : ''} onClick={() => setBrake(k)}>{l}</button>)}
            </span>
          </>)}
          {method === 'aux' && (<>
            <span className="label">3-stage charger · bulk → absorption → float</span>
          </>)}
        </div>
      </div>
    </>
  );
}

function fmtHour(h) { const H = Math.floor(h), m = Math.floor((h - H) * 60); return `${String(H).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }

function liveValues(method, S, { brake, hour, cloudy }) {
  if (method === 'ac') {
    const a = acValues(S);
    const left = S.phase === 'done' ? 0 : Math.max(0, 104 - S.realMin);
    return {
      ...a, badge: { steps: 'CONNECTING', cc: 'CC · FAST', cv: 'CV · TAPER', done: 'FULL' }[S.phase],
      metrics: [['State of charge', r1(S.soc), '%'], ['Charge current', a.ib.toFixed(1), 'A'], ['Pack voltage', r1(a.packV), 'V'], ['Grid draw', r1(a.iac), 'A'], ['Cell voltage', a.cellV.toFixed(3), 'V'], ['Time left', S.phase === 'steps' ? '≈ 104' : left.toFixed(0), 'min']],
    };
  }
  if (method === 'regen') {
    const a = { lift: 0.6, brake: 1.6, hard: 4.0 }[brake];
    const r = regenAt(S.v, a);
    const braking = S.phase === 'brake';
    const rpm = (S.v / 3.6) / (2 * Math.PI * 0.28) * 60 * 6.2;
    return {
      ...r, pe: braking ? r.pe : 0, rpm, badge: braking ? 'REGENERATING' : S.phase === 'stopped' ? 'STOPPED' : 'DRIVING',
      metrics: [['Speed', S.v.toFixed(0), 'km/h'], ['Regen power', braking ? (r.pe / 1000).toFixed(2) : '0.00', 'kW'], ['Into battery', braking ? (r.pe / 53).toFixed(0) : '0', 'A'], ['Motor EMF', (rpm * 0.011).toFixed(0), 'V AC'], ['Regen share', braking ? Math.round(r.share * 100) : 0, '%'], ['This stop', r1(S.wh), 'Wh']],
    };
  }
  if (method === 'solar') {
    const s = solarAt(hour, cloudy);
    const p = s.mpp.p * 0.97;
    let wh = 0; for (let h = 6; h < hour; h += 0.1) wh += solarAt(h, cloudy).mpp.p * 0.97 * 0.1;
    return {
      ...s, p, badge: p > 2 ? 'HARVESTING' : 'NIGHT',
      metrics: [['Sunlight', s.G.toFixed(0), 'W/m²'], ['Panel voltage', r1(s.mpp.v), 'V'], ['Panel current', r1(s.mpp.i), 'A'], ['To battery', p.toFixed(0), 'W'], ['Charge current', (p / 54).toFixed(2), 'A'], ['Today so far', wh.toFixed(0), 'Wh']],
    };
  }
  const st = S.aux < 80 ? 'BULK' : S.aux < 98 ? 'ABSORPTION' : 'FLOAT';
  const v = st === 'BULK' ? 12.8 + (S.aux - 55) / 25 * 1.6 : st === 'ABSORPTION' ? 14.4 : 13.6;
  const i = st === 'BULK' ? 25 : st === 'ABSORPTION' ? 25 * Math.exp(-(S.aux - 80) / 6) : 0.8;
  return {
    st, v, i, badge: st,
    metrics: [['Aux battery', S.aux.toFixed(0), '%'], ['Charge voltage', r1(v), 'V'], ['Charge current', r1(i), 'A'], ['Medical load', '165', 'W'], ['Lights + siren', '220', 'W'], ['DC-DC output', ((v * i + 385) / 1000).toFixed(2), 'kW']],
  };
}

// ------------------------------------------------------------ energy path diagram
function Path({ M, method, S, live, step, flowN, flowK, active }) {
  const N = M.stages.length;
  const W = 1000, X0 = 80, X1 = 920, Y = 132;
  const xs = M.stages.map((_, i) => X0 + (i * (X1 - X0)) / (N - 1));
  const gap = (X1 - X0) / (N - 1);
  const bw = Math.min(118, gap - 54);
  const sc = Math.min(1, (bw - 8) / 76);
  const dur = (2.4 - flowK * 1.8).toFixed(2);
  const wrap = useRef(null);
  const focusX = xs[step.hl[step.hl.length - 1]];
  useEffect(() => {
    // on phones the path scrolls sideways: keep the active stage in view
    const w = wrap.current;
    if (!w || w.scrollWidth <= w.clientWidth + 4) return;
    const svgW = w.scrollWidth;
    w.scrollTo({ left: clamp((focusX / W) * svgW - w.clientWidth / 2, 0, svgW), behavior: 'smooth' });
  }, [focusX, method]);
  return (
    <div className="cv-svgwrap" ref={wrap}>
      <svg className="cv-svg" viewBox={`0 14 ${W} 232`} preserveAspectRatio="xMidYMid meet" style={{ animationPlayState: active ? 'running' : 'paused' }}>
        <defs>
          <filter id="cvGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
        </defs>
        {M.links.map(([f, lab], i) => {
          const x1 = xs[i] + bw / 2, x2 = xs[i + 1] - bw / 2;
          const on = i < flowN;
          const c = FORM[f].c;
          const mid = (x1 + x2) / 2;
          return (
            <g key={i}>
              <line x1={x1} x2={x2} y1={Y} y2={Y} stroke={c} strokeOpacity="0.16" strokeWidth="8" strokeLinecap="round" />
              {on && <line x1={x1} x2={x2} y1={Y} y2={Y} stroke={c} strokeWidth="3" strokeDasharray="7 9" strokeLinecap="round" className="cv-flow" style={{ animationDuration: dur + 's' }} />}
              {on && <circle r="4" fill={c} filter="url(#cvGlow)"><animateMotion dur={dur + 's'} repeatCount="indefinite" path={`M${x1} ${Y} H${x2}`} /></circle>}
              <line x1={mid} x2={mid} y1={Y - 62} y2={Y - 6} stroke={c} strokeOpacity={on ? 0.45 : 0.12} strokeDasharray="2 3" />
              <Wave f={f} x={mid} y={Y - 76} on={on} id={`${method}${i}`} />
              <text x={mid} y={Y - 98} textAnchor="middle" className="cv-llab" fill={on ? c : '#5b636b'}>{lab}</text>
            </g>
          );
        })}
        {M.stages.map(([k, title, sub], i) => {
          const hot = step.hl.includes(i);
          const x = xs[i];
          return (
            <g key={k + i} className={'cv-stage' + (hot ? ' hot' : '')}>
              {hot && <rect x={x - bw / 2 - 4} y={Y - 52} width={bw + 8} height="104" rx="18" fill="#39ff88" opacity="0.18" filter="url(#cvGlow)" />}
              <rect x={x - bw / 2} y={Y - 48} width={bw} height="96" rx="15" fill="#0b0f0d" stroke={hot ? '#39ff88' : 'rgba(255,255,255,0.13)'} strokeWidth={hot ? 2 : 1} />
              <g transform={`translate(${x},${Y - 4}) scale(${sc})`} color={hot ? '#39ff88' : '#9aa4ad'}>
                <Illus k={k} method={method} S={S} live={live} step={step} />
              </g>
              <text x={x} y={Y + 72} textAnchor="middle" className="cv-stitle" fill={hot ? '#eef1f3' : '#b8c0c7'}>{title}</text>
              <text x={x} y={Y + 87} textAnchor="middle" className="cv-ssub">{sub}</text>
              <text x={x} y={Y + 104} textAnchor="middle" className="cv-sread" fill={hot ? '#39ff88' : '#8a939c'}>{reading(method, i, S, live)}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function reading(method, i, S, L) {
  if (method === 'ac') {
    const flowing = S.phase === 'cc' || S.phase === 'cv';
    const conn = S.phase !== 'steps' || S.step >= 1;
    const en = (k) => flowing || (S.phase === 'steps' && S.step >= k);
    return [
      flowing ? `230 V · ${r1(L.iac)} A` : '230 V ready',
      S.phase === 'done' ? 'Unlocked' : 'CP 16 A · locked',
      en(2) ? '325 V peak' : '—',
      en(3) ? '390 V DC' : '—',
      flowing ? `${r1(L.packV)} V · ${r1(L.ib)} A` : en(4) ? '58.4 V max' : '—',
      S.phase === 'done' ? 'Open' : conn ? 'Closed ✓' : 'Checking…',
      `${r1(S.soc)} %`,
    ][i];
  }
  if (method === 'solar') {
    return [`${L.G.toFixed(0)} W/m²`, `${r1(L.mpp.v)} V · ${r1(L.mpp.i)} A`, `${L.p.toFixed(0)} W @ 54 V`, `${(L.p / 54).toFixed(2)} A in`, '+ trickle'][i];
  }
  if (method === 'regen') {
    const b = S.phase === 'brake';
    return [`${S.v.toFixed(0)} km/h`, `${L.rpm.toFixed(0)} rpm · ${(L.rpm * 0.011).toFixed(0)} V~`, b ? `${(L.pe / 1000).toFixed(2)} kW DC` : 'Drive mode', b ? `${(L.pe / 53).toFixed(0)} A ≤ 94 A` : '—', `+${r1(S.wh)} Wh`][i];
  }
  return ['51.2 V', `${r1(L.v)} V out`, `${S.aux.toFixed(0)} % · ${L.st}`, '385 W'][i];
}

function Wave({ f, x, y, on, id }) {
  const c = FORM[f].c, w = 64, h = 26;
  let d = '', period = 24;
  const sine = (fn, amp, ph = 0) => { let s = ''; for (let i = 0; i <= w * 2 + period; i += 2) s += `${i ? 'L' : 'M'}${i} ${(-fn((i / period) * 2 * Math.PI + ph) * amp).toFixed(2)}`; return s; };
  if (f === 'ac') d = sine(Math.sin, 8);
  if (f === 'pdc') d = sine((a) => Math.abs(Math.sin(a / 2)) * 2 - 1, 7);
  if (f === 'dc') d = `M0 -5 H${w * 2 + period}`;
  if (f === 'light') { period = 12; d = sine(Math.sin, 4); }
  return (
    <g transform={`translate(${x - w / 2},${y - h / 2})`} opacity={on ? 1 : 0.35}>
      <rect width={w} height={h} rx="8" fill="#0b0e11" stroke={on ? c : 'rgba(255,255,255,0.1)'} strokeOpacity={on ? 0.6 : 1} />
      <clipPath id={`cw${id}`}><rect x="3" y="0" width={w - 6} height={h} /></clipPath>
      <g clipPath={`url(#cw${id})`}>
        <g transform={`translate(0,${h / 2})`}>
          {f === 'ph3' ? [0, 1, 2].map((k) => (
            <path key={k} d={sine(Math.sin, 7, (k * 2 * Math.PI) / 3)} stroke={['#b18cff', '#4dc3ff', '#ff6b9a'][k]} strokeWidth="1.5" fill="none" className={on ? 'cv-wave' : ''} style={{ '--p': `-${period}px` }} />
          )) : f === 'mech' ? (
            <g transform={`translate(${w / 2},0)`}><path d="M-7 -6 A9 9 0 1 1 -9 3" stroke={c} strokeWidth="1.8" fill="none" className={on ? 'cv-rot' : ''} /><path d="M-11 0 L-9 3.5 L-5.5 1.5" stroke={c} strokeWidth="1.8" fill="none" className={on ? 'cv-rot' : ''} /></g>
          ) : (
            <path d={d} stroke={c} strokeWidth="1.8" fill="none" className={on && f !== 'dc' ? 'cv-wave' : ''} style={{ '--p': `-${period}px` }} />
          )}
          {f === 'dc' && on && [0, 1, 2].map((k) => <circle key={k} r="1.8" cy="-5" fill={c}><animate attributeName="cx" from="4" to={w - 4} dur="1.2s" begin={`${k * 0.4}s`} repeatCount="indefinite" /></circle>)}
        </g>
      </g>
    </g>
  );
}

// ------------------------------------------------------------ stage illustrations
function Illus({ k, method, S, live, step }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (k) {
    case 'evse': return (
      <g {...p}>
        <rect x="-15" y="-30" width="30" height="54" rx="6" />
        <rect x="-10" y="-24" width="20" height="13" rx="2" fill="currentColor" fillOpacity="0.15" />
        <path d="M-2 -21 L-5 -16 H-1 L-3 -13" />
        <path d="M15 8 C30 8 30 22 38 22" strokeWidth="2.4" />
        <path d="M-22 26 H22" />
      </g>
    );
    case 'type2': {
      const lit = method === 'ac' && (S.phase === 'steps' && S.step <= 1);
      return (
        <g {...p}>
          <path d="M-17 -19 A26 26 0 1 0 17 -19 Z" />
          {[[-11, -2], [0, -4], [11, -2], [-6, 11], [6, 11]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.6" />)}
          {[[-6, -13], [6, -13]].map(([x, y], i) => <circle key={'s' + i} cx={x} cy={y} r="2.2" fill={lit ? '#ffb547' : 'none'} stroke={lit ? '#ffb547' : 'currentColor'} className={lit ? 'cv-blink' : ''} />)}
          <text x="-6" y="-21" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">PP</text>
          <text x="6" y="-21" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">CP</text>
        </g>
      );
    }
    case 'rect': return (
      <g {...p}>
        <path d="M0 -24 L24 0 L0 24 L-24 0 Z" strokeOpacity="0.45" />
        {[[-12, -12, 45], [12, -12, 135], [-12, 12, -45], [12, 12, -135]].map(([x, y, a], i) => (
          <g key={i} transform={`translate(${x},${y}) rotate(${a})`}><path d="M-4 -4 L4 0 L-4 4 Z" fill="currentColor" fillOpacity="0.35" /><path d="M4 -4 V4" /></g>
        ))}
        <text x="-32" y="4" className="cv-tiny" textAnchor="middle" stroke="none" fill="#ffb547">~</text>
        <text x="32" y="4" className="cv-tiny" textAnchor="middle" stroke="none" fill="#ffb547">~</text>
        <text x="0" y="-28" className="cv-tiny" textAnchor="middle" stroke="none" fill="#39ff88">+</text>
        <text x="0" y="34" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">−</text>
      </g>
    );
    case 'pfc': return (
      <g {...p}>
        <path d="M-34 -10 H-28 a3.5 3.5 0 0 1 7 0 a3.5 3.5 0 0 1 7 0 a3.5 3.5 0 0 1 7 0 a3.5 3.5 0 0 1 7 0 H8 H30" />
        <path d="M2 -10 V14 M-3 4 H2 M2 -2 L-2 2" />
        <path d="M14 -14 L20 -10 L14 -6 Z" fill="currentColor" fillOpacity="0.3" />
        <path d="M24 -10 V-2 M18 -2 H30 M18 2 H30 M24 2 V14 M-34 14 H30" />
        <text x="-14" y="-16" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">L</text>
        <text x="34" y="2" className="cv-tiny" stroke="none" fill="currentColor">C</text>
      </g>
    );
    case 'dcdc': return (
      <g {...p}>
        {[-1, 1].map((s) => <path key={s} d={`M${s * 14} -20 ${[0, 1, 2, 3].map(() => `a5 5 0 0 ${s > 0 ? 0 : 1} 0 10`).join(' ')}`} />)}
        <path d="M-3 -22 V22 M3 -22 V22" strokeOpacity="0.6" />
        <path d="M-14 -20 H-30 M-14 20 H-30 M14 -20 H30 M14 20 H30" />
        <text x="0" y="33" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">100 kHz</text>
      </g>
    );
    case 'bms': {
      const closed = method !== 'ac' || (S.phase === 'steps' ? S.step >= 1 : S.phase !== 'done');
      return (
        <g {...p}>
          <rect x="-20" y="-28" width="40" height="26" rx="4" />
          <path d="M-10 -15 L-4 -9 L8 -21" />
          <path d="M-30 16 H-12" /><circle cx="-12" cy="16" r="2" fill="currentColor" />
          <path d={closed ? 'M-12 16 L12 16' : 'M-12 16 L8 4'} strokeWidth="2.2" style={{ transition: 'd 0.4s' }} />
          <circle cx="12" cy="16" r="2" fill="currentColor" /><path d="M12 16 H30" />
          <text x="0" y="31" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">{closed ? 'CLOSED' : 'OPEN'}</text>
        </g>
      );
    }
    case 'pack': {
      const soc = method === 'ac' ? S.soc : method === 'aux' && k === 'pack' ? 86 : 86;
      const cvBal = method === 'ac' && S.phase === 'cv';
      return (
        <g {...p}>
          <rect x="-34" y="-20" width="64" height="40" rx="5" />
          <rect x="30" y="-7" width="4" height="14" rx="1" fill="currentColor" />
          {Array.from({ length: 8 }, (_, i) => {
            const x = -30 + i * 7.5, fh = 32 * (soc / 100) * (1 + Math.sin(i * 2.1) * 0.012);
            const bal = cvBal && (i === 2 || i === 5) && Math.floor(S.t * 2) % 2 === 0;
            return (
              <g key={i}>
                <rect x={x} y="-16" width="6" height="32" rx="1.5" strokeWidth="1" strokeOpacity="0.5" />
                <rect x={x} y={16 - fh} width="6" height={fh} rx="1.5" fill={bal ? '#ffb547' : '#39ff88'} fillOpacity="0.75" stroke="none" />
              </g>
            );
          })}
          {cvBal && <text x="0" y="33" className="cv-tiny" textAnchor="middle" stroke="none" fill="#ffb547">balancing</text>}
        </g>
      );
    }
    case 'sun': return (
      <g {...p} color="#ffe066">
        <circle r="11" fill="#ffe066" fillOpacity="0.2" />
        <g className="cv-rot slow">{Array.from({ length: 10 }, (_, i) => { const a = i * Math.PI / 5; return <line key={i} x1={Math.cos(a) * 16} y1={Math.sin(a) * 16} x2={Math.cos(a) * 23} y2={Math.sin(a) * 23} />; })}</g>
      </g>
    );
    case 'pv': return (
      <g {...p}>
        <path d="M-30 14 L-20 -18 H32 L22 14 Z" fill="currentColor" fillOpacity="0.08" />
        {[1, 2, 3].map((i) => <path key={'v' + i} d={`M${-30 + i * 13} 14 L${-20 + i * 13} -18`} strokeWidth="1" strokeOpacity="0.6" />)}
        {[1, 2].map((i) => <path key={'h' + i} d={`M${-30 + i * 3.33} ${14 - i * 10.67} H${22 + i * 3.33}`} strokeWidth="1" strokeOpacity="0.6" />)}
        <path d="M-4 14 V24 M-12 24 H4" />
        <text x="22" y="26" className="cv-tiny" stroke="none" fill="#39ff88">+ −</text>
      </g>
    );
    case 'mppt': {
      const L = live.mpp ? live : null;
      const pts = []; let mx = 0, my = 0;
      if (L && L.Voc > 0) {
        for (let i = 0; i <= 24; i++) { const V = (L.Voc * i) / 24; const P = V * L.I(V); pts.push([-28 + (i / 24) * 56, 14 - (P / 310) * 32]); }
        mx = -28 + (L.mpp.v / L.Voc) * 56; my = 14 - (L.mpp.p / 310) * 32;
      }
      return (
        <g {...p}>
          <rect x="-34" y="-24" width="68" height="46" rx="5" />
          <path d="M-28 14 H28 M-28 14 V-20" strokeOpacity="0.4" strokeWidth="1" />
          {pts.length > 1 && <path d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ')} stroke="#ffe066" />}
          {pts.length > 1 && <circle cx={mx} cy={my} r="3" fill="#39ff88" stroke="none" className="cv-blink" />}
          <text x="0" y="32" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">P–V curve</text>
        </g>
      );
    }
    case 'wheel': {
      const sp = S.v || 0;
      return (
        <g {...p}>
          <circle r="25" strokeWidth="5" stroke="#2a3036" />
          <circle r="25" />
          <g style={{ animation: sp > 1 ? `cvspin ${(30 / Math.max(sp, 1)).toFixed(2)}s linear infinite` : 'none' }} className="cv-spin">
            <circle r="13" />
            {Array.from({ length: 5 }, (_, i) => { const a = i * 2 * Math.PI / 5; return <line key={i} x1="0" y1="0" x2={Math.cos(a) * 13} y2={Math.sin(a) * 13} />; })}
          </g>
        </g>
      );
    }
    case 'gen': {
      const sp = S.v || 0;
      return (
        <g {...p}>
          <circle r="26" />
          {Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return <rect key={i} x="-3.5" y="-25" width="7" height="8" rx="1.5" transform={`rotate(${a * 180 / Math.PI})`} fill={['#b18cff', '#4dc3ff', '#ff6b9a'][i % 3]} fillOpacity="0.5" stroke="none" />; })}
          <g className="cv-spin" style={{ animation: sp > 1 ? `cvspin ${(14 / Math.max(sp, 1)).toFixed(2)}s linear infinite` : 'none' }}>
            <path d="M-13 0 A13 13 0 0 1 13 0 Z" fill="#ff3b4a" fillOpacity="0.6" stroke="none" />
            <path d="M-13 0 A13 13 0 0 0 13 0 Z" fill="#4d8dff" fillOpacity="0.6" stroke="none" />
            <text y="-4" className="cv-tiny" textAnchor="middle" stroke="none" fill="#fff">N</text>
            <text y="10" className="cv-tiny" textAnchor="middle" stroke="none" fill="#fff">S</text>
          </g>
        </g>
      );
    }
    case 'inv': {
      const on = S.phase === 'brake';
      return (
        <g {...p}>
          {[-1, 0, 1].map((c) => [-1, 1].map((r) => {
            const lit = on && Math.floor(S.t * 6 + c * 2 + (r > 0 ? 3 : 0)) % 3 === 0;
            return (
              <g key={c + '' + r} transform={`translate(${c * 20},${r * 12})`}>
                <rect x="-6" y="-6" width="12" height="12" rx="2" fill={lit ? '#39ff88' : 'none'} fillOpacity="0.4" />
                <path d="M-2 -3 V3 M-2 0 H-6 M1 -3 L4 -5 M1 3 L4 5" strokeWidth="1.1" />
              </g>
            );
          }))}
          <text x="0" y="31" className="cv-tiny" textAnchor="middle" stroke="none" fill="currentColor">6 × MOSFET</text>
        </g>
      );
    }
    case 'aux': return (
      <g {...p}>
        <rect x="-26" y="-16" width="52" height="34" rx="4" />
        <rect x="-20" y="-21" width="8" height="5" rx="1" /><rect x="12" y="-21" width="8" height="5" rx="1" />
        <rect x="-22" y={14 - 28 * (S.aux / 100)} width="44" height={28 * (S.aux / 100)} rx="2" fill="#39ff88" fillOpacity="0.3" stroke="none" />
        <text y="6" className="cv-tiny big" textAnchor="middle" stroke="none" fill="currentColor">12 V</text>
      </g>
    );
    case 'loads': return (
      <g {...p}>
        <rect x="-32" y="-20" width="30" height="22" rx="3" />
        <path d="M-29 -9 H-23 L-20 -15 L-16 -3 L-13 -9 H-5" stroke="#ff6b9a" />
        <circle cx="16" cy="-10" r="9" /><path d="M12 -1 V5 H20 V-1" />
        <path d="M-28 14 H28" strokeOpacity="0.5" /><path d="M-24 22 L-14 10 M-4 22 L6 10 M16 22 L26 10" stroke="#ff3b4a" strokeOpacity="0.8" />
      </g>
    );
    default: return null;
  }
}

function MIcon({ k }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (k === 'plug') return <path {...p} d="M-3 -8 V-4 M3 -8 V-4 M-6 -4 H6 V-1 A6 6 0 0 1 -6 -1 Z M0 5 V8.5" />;
  if (k === 'sun') return <g {...p}><circle r="3.6" />{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <line key={i} x1={Math.cos(a) * 6} y1={Math.sin(a) * 6} x2={Math.cos(a) * 8.5} y2={Math.sin(a) * 8.5} />; })}</g>;
  if (k === 'motor') return <g {...p}><circle r="7.5" /><path d="M-3 -3 A4 4 0 1 1 -4 1 M-4 1 L-5.5 -1.5 M-4 1 L-1.5 0" /></g>;
  return <path {...p} d="M1.5 -8.5 L-5 1 H0 L-1.5 8.5 L5 -1 H0 Z" />;
}

// ------------------------------------------------------------ charts
function Chart({ method, S, live, hour, cloudy, brake, v0 }) {
  const W = 420, H = 170, L = 34, R = 34, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const axis = (
    <g className="cv-axis">
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} />
      <line x1={L} x2={L} y1={T} y2={H - B} />
    </g>
  );
  if (method === 'ac') {
    // full session curves vs real minutes (0..110)
    const pts = [], cur = []; let soc = 22, t = 0;
    while (t < 110) {
      const cc = soc < 80; const k = cc ? 1 : Math.exp(-3 * (soc - 80) / 20);
      pts.push([t, soc]); cur.push([t, cc ? 57 : 57 * k]);
      const dt = 1; soc = Math.min(100, soc + (3.04 * (cc ? 1 : k)) / 5.12 * 100 * dt / 60); t += dt;
    }
    const X = (m) => L + (m / 110) * pw, Y = (v) => T + ph - (v / 100) * ph, YI = (a) => T + ph - (a / 60) * ph;
    const tCv = pts.find((p) => p[1] >= 80)[0];
    const nowX = X(clamp(S.realMin, 0, 110));
    return (
      <>
        <h3><span>CC → CV charging curve</span><span className="cv-key"><i style={{ background: '#39ff88' }} />SoC <i style={{ background: '#4dc3ff' }} />Current</span></h3>
        <svg className="cv-chartsvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <rect x={L} y={T} width={X(tCv) - L} height={ph} fill="#39ff88" opacity="0.05" />
          <rect x={X(tCv)} y={T} width={W - R - X(tCv)} height={ph} fill="#ffb547" opacity="0.06" />
          <text x={(L + X(tCv)) / 2} y={T + 24} className="cv-ctext" textAnchor="middle">CONSTANT CURRENT</text>
          <text x={(X(tCv) + W - R) / 2} y={T + 24} className="cv-ctext" textAnchor="middle" fill="#ffb547">CONSTANT VOLTAGE</text>
          {axis}
          <path d={cur.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${YI(p[1]).toFixed(1)}`).join(' ')} stroke="#4dc3ff" strokeWidth="1.8" fill="none" strokeDasharray="4 3" />
          <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} stroke="#39ff88" strokeWidth="2.2" fill="none" />
          <line x1={nowX} x2={nowX} y1={T} y2={H - B} stroke="#eef1f3" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx={nowX} cy={Y(S.soc)} r="4.5" fill="#39ff88" />
          <circle cx={nowX} cy={YI(live.ib)} r="3.5" fill="#4dc3ff" />
          {[0, 30, 60, 90].map((m) => <text key={m} x={X(m)} y={H - 10} className="cv-ctext" textAnchor="middle">{m} min</text>)}
          {[0, 50, 100].map((v) => <text key={v} x={L - 5} y={Y(v) + 3} className="cv-ctext" textAnchor="end">{v}%</text>)}
          {[0, 30, 60].map((a) => <text key={a} x={W - R + 5} y={YI(a) + 3} className="cv-ctext" fill="#4dc3ff">{a}A</text>)}
        </svg>
      </>
    );
  }
  if (method === 'solar') {
    const X = (h) => L + ((h - 6) / 12) * pw, Y = (p) => T + ph - (p / 320) * ph;
    const day = []; for (let h = 6; h <= 18; h += 0.25) day.push([h, solarAt(h, cloudy).mpp.p * 0.97]);
    const now = live.p;
    const fill = day.filter((d) => d[0] <= hour);
    return (
      <>
        <h3><span>Solar power through the day</span><span className="cv-key"><i style={{ background: '#ffe066' }} />Output W</span></h3>
        <svg className="cv-chartsvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {axis}
          {fill.length > 1 && <path d={`${fill.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} L${X(fill[fill.length - 1][0])} ${H - B} L${X(6)} ${H - B} Z`} fill="#ffe066" opacity="0.14" />}
          <path d={day.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} stroke="#ffe066" strokeWidth="2" fill="none" />
          <line x1={X(hour)} x2={X(hour)} y1={T} y2={H - B} stroke="#eef1f3" strokeOpacity="0.4" strokeDasharray="2 3" />
          <circle cx={X(hour)} cy={Y(now)} r="4.5" fill="#39ff88" />
          <text x={X(hour) + 7} y={Y(now) - 6} className="cv-ctext" fill="#eef1f3">{now.toFixed(0)} W</text>
          {[6, 9, 12, 15, 18].map((h) => <text key={h} x={X(h)} y={H - 10} className="cv-ctext" textAnchor="middle">{h}:00</text>)}
          {[0, 150, 300].map((v) => <text key={v} x={L - 5} y={Y(v) + 3} className="cv-ctext" textAnchor="end">{v}</text>)}
          <text x={W - R} y={H - B - 6} className="cv-ctext" textAnchor="end">shaded = energy banked today</text>
        </svg>
      </>
    );
  }
  if (method === 'regen') {
    const a = { lift: 0.6, brake: 1.6, hard: 4.0 }[brake];
    const X = (v) => L + (v / 80) * pw, Y = (p) => T + ph - (p / 8000) * ph;
    const need = [], got = [];
    for (let v = 0; v <= 80; v += 1) { const r = regenAt(v, a); need.push([v, Math.min(r.pm, 8000)]); got.push([v, r.pe]); }
    const ke = 0.5 * MASS * (v0 / 3.6) ** 2 / 3600; // Wh
    let rec = 0; for (let v = v0 / 3.6; v > 0; v -= a * 0.05) rec += regenAt(v * 3.6, a).pe * 0.05 / 3600;
    const r = regenAt(S.v, a);
    return (
      <>
        <h3><span>Braking power: battery vs friction</span><span className="cv-key"><i style={{ background: '#39ff88' }} />Back to battery <i style={{ background: '#ff6b5a' }} />Friction brakes</span></h3>
        <svg className="cv-chartsvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {axis}
          <path d={`${need.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} L${X(80)} ${H - B} L${X(0)} ${H - B} Z`} fill="#ff6b5a" opacity="0.18" />
          <path d={`${got.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} L${X(80)} ${H - B} L${X(0)} ${H - B} Z`} fill="#39ff88" opacity="0.3" />
          <path d={got.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(' ')} stroke="#39ff88" strokeWidth="2" fill="none" />
          <line x1={L} x2={W - R} y1={Y(5000)} y2={Y(5000)} stroke="#39ff88" strokeOpacity="0.4" strokeDasharray="3 3" />
          <text x={W - R} y={Y(5000) - 4} className="cv-ctext" textAnchor="end" fill="#39ff88">BMS limit 5 kW</text>
          {S.phase === 'brake' && <><line x1={X(S.v)} x2={X(S.v)} y1={T} y2={H - B} stroke="#eef1f3" strokeOpacity="0.4" strokeDasharray="2 3" /><circle cx={X(S.v)} cy={Y(r.pe)} r="4.5" fill="#39ff88" /></>}
          {[0, 20, 40, 60, 80].map((v) => <text key={v} x={X(v)} y={H - 10} className="cv-ctext" textAnchor="middle">{v} km/h</text>)}
          {[0, 4, 8].map((v) => <text key={v} x={L - 5} y={Y(v * 1000) + 3} className="cv-ctext" textAnchor="end">{v}kW</text>)}
          <text x={L + 8} y={T + 10} className="cv-ctext" fill="#eef1f3">{v0}→0 km/h: {ke.toFixed(0)} Wh of motion · {rec.toFixed(0)} Wh back to battery ({Math.round(rec / ke * 100)}%)</text>
        </svg>
      </>
    );
  }
  // aux: 3-stage profile
  const X = (s) => L + ((s - 55) / 45) * pw;
  const V = (s) => (s < 80 ? 12.8 + (s - 55) / 25 * 1.6 : s < 98 ? 14.4 : 13.6);
  const I = (s) => (s < 80 ? 25 : s < 98 ? 25 * Math.exp(-(s - 80) / 6) : 0.8);
  const YV = (v) => T + ph - ((v - 12) / 3) * ph, YI = (i) => T + ph - (i / 30) * ph;
  const vs = [], is = []; for (let s = 55; s <= 100; s += 0.5) { vs.push([s, V(s)]); is.push([s, I(s)]); }
  return (
    <>
      <h3><span>12 V three-stage charging</span><span className="cv-key"><i style={{ background: '#39ff88' }} />Voltage <i style={{ background: '#4dc3ff' }} />Current</span></h3>
      <svg className="cv-chartsvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <rect x={X(55)} y={T} width={X(80) - X(55)} height={ph} fill="#39ff88" opacity="0.05" />
        <rect x={X(80)} y={T} width={X(98) - X(80)} height={ph} fill="#ffb547" opacity="0.06" />
        <rect x={X(98)} y={T} width={X(100) - X(98)} height={ph} fill="#4dc3ff" opacity="0.08" />
        <text x={(X(55) + X(80)) / 2} y={T + 12} className="cv-ctext" textAnchor="middle">BULK</text>
        <text x={(X(80) + X(98)) / 2} y={T + 12} className="cv-ctext" textAnchor="middle" fill="#ffb547">ABSORPTION</text>
        <text x={X(99)} y={T + 24} className="cv-ctext" textAnchor="middle" fill="#4dc3ff">FLOAT</text>
        {axis}
        <path d={is.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${YI(p[1]).toFixed(1)}`).join(' ')} stroke="#4dc3ff" strokeWidth="1.8" fill="none" strokeDasharray="4 3" />
        <path d={vs.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)} ${YV(p[1]).toFixed(1)}`).join(' ')} stroke="#39ff88" strokeWidth="2.2" fill="none" />
        <line x1={X(Math.min(100, S.aux))} x2={X(Math.min(100, S.aux))} y1={T} y2={H - B} stroke="#eef1f3" strokeOpacity="0.4" strokeDasharray="2 3" />
        <circle cx={X(Math.min(100, S.aux))} cy={YV(V(S.aux))} r="4.5" fill="#39ff88" />
        {[60, 70, 80, 90, 100].map((s) => <text key={s} x={X(s)} y={H - 10} className="cv-ctext" textAnchor="middle">{s}%</text>)}
        {[12, 13, 14, 15].map((v) => <text key={v} x={L - 5} y={YV(v) + 3} className="cv-ctext" textAnchor="end">{v}V</text>)}
        {[0, 10, 20, 30].map((a) => <text key={a} x={W - R + 5} y={YI(a) + 3} className="cv-ctext" fill="#4dc3ff">{a}A</text>)}
      </svg>
    </>
  );
}
