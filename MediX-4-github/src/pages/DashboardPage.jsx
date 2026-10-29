import React, { useEffect, useRef, useState } from 'react';
import { useLive } from '../useLive.js';
import { store } from '../store.js';

// ------------------------------------------------------------------ data
const HOSPITALS = [
  { name: 'Apex Trauma & Cardiac Center', km: 3.8, type: 'Level-1 emergency' },
  { name: 'GreenValley Memorial Hospital', km: 6.4, type: 'Multi-specialty' },
  { name: 'Highland Mountain Clinic', km: 2.1, type: 'Rural emergency outpost' },
];
const SCEN = {
  stable: { label: 'Stable', hr: 78, spo2: 97, sys: 124, dia: 80, temp: 36.9, rr: 16 },
  tachy: { label: 'Tachycardia', hr: 132, spo2: 94, sys: 142, dia: 92, temp: 37.6, rr: 22 },
  critical: { label: 'Critical', hr: 151, spo2: 86, sys: 86, dia: 52, temp: 38.7, rr: 28 },
};
const CAP_WH = 5120;

const ecgWave = (p) => {
  if (p < 0.1) return Math.sin((p / 0.1) * Math.PI) * 0.12;
  if (p > 0.16 && p < 0.18) return -0.15;
  if (p >= 0.18 && p < 0.205) return 1;
  if (p >= 0.205 && p < 0.235) return -0.3;
  if (p > 0.36 && p < 0.52) return Math.sin(((p - 0.36) / 0.16) * Math.PI) * 0.24;
  return 0;
};
const plethWave = (p) => {
  const up = p < 0.16 ? Math.sin((p / 0.16) * Math.PI / 2) : Math.exp(-(p - 0.16) * 3.2);
  const notch = p > 0.34 && p < 0.5 ? Math.sin(((p - 0.34) / 0.16) * Math.PI) * 0.12 : 0;
  return up * 0.9 + notch - 0.35;
};
const respWave = (p) => Math.sin(p * Math.PI * 2) * 0.8;

// ------------------------------------------------------------------ page
export default function DashboardPage({ active }) {
  const live = useLive();
  useEffect(() => { store.set({ dashOpen: active }); }, [active]);

  // patient vitals (simulated, drift around the chosen scenario)
  const [scen, setScen] = useState('stable');
  const [vit, setVit] = useState(SCEN.stable);
  useEffect(() => {
    if (!active) return;
    const S = SCEN[scen];
    const i = setInterval(() => {
      setVit((v) => ({
        hr: Math.round(S.hr + (Math.random() - 0.5) * 4),
        spo2: Math.max(70, Math.min(100, Math.round(S.spo2 + (Math.random() - 0.6) * 1.6))),
        sys: Math.round(S.sys + (Math.random() - 0.5) * 4), dia: Math.round(S.dia + (Math.random() - 0.5) * 3),
        temp: +(v.temp + (S.temp - v.temp) * 0.3 + (Math.random() - 0.5) * 0.04).toFixed(1),
        rr: Math.round(S.rr + (Math.random() - 0.5) * 2),
      }));
    }, 1500);
    return () => clearInterval(i);
  }, [scen, active]);
  useEffect(() => { setVit(SCEN[scen]); }, [scen]);

  // trip / hospital routing
  const trip = useRef({ hosp: 0, start: null, arrivedAt: null });
  const T = trip.current;
  if (T.start === null && live.odo !== undefined) T.start = live.odo;
  let remain = HOSPITALS[T.hosp].km - ((live.odo || 0) - (T.start || 0));
  if (remain <= 0 && T.arrivedAt === null) T.arrivedAt = Date.now();
  if (T.arrivedAt && Date.now() - T.arrivedAt > 9000) { T.hosp = (T.hosp + 1) % HOSPITALS.length; T.start = live.odo; T.arrivedAt = null; remain = HOSPITALS[T.hosp].km; }
  remain = Math.max(0, remain);
  const avgKmh = Math.max(12, live.speed * 0.6 + 18);
  const etaMin = remain / avgKmh * 60;

  // battery figures
  const soc = live.soc;
  const packV = 48.0 + (soc / 100) * 6.0 - Math.max(-1, Math.min(1.2, live.power * 0.12));
  const current = (live.power * 1000) / packV;
  const rangeKm = (soc / 100) * CAP_WH / Math.max(40, live.whkm || 95);

  // alerts feed
  const [alerts, setAlerts] = useState([]);
  const prev = useRef({});
  const push = (lvl, msg) => setAlerts((a) => [{ t: new Date(), lvl, msg, id: Math.random() }, ...a].slice(0, 7));
  useEffect(() => {
    const p = prev.current;
    if (live.zone && p.zone && live.zone !== p.zone) push('info', `Entering ${live.zone}`);
    if (live.overtaking && !p.overtaking) push('info', 'Overtaking: oncoming lane clear');
    if (live.status === 'REGEN' && p.status !== 'REGEN' && (!p.regenT || Date.now() - p.regenT > 15000)) { push('ok', `Regenerative braking ${Math.abs(live.power).toFixed(1)} kW`); p.regenT = Date.now(); }
    if (live.status === 'PEAK' && p.status !== 'PEAK' && (!p.peakT || Date.now() - p.peakT > 20000)) { push('warn', live.grade > 1 ? `Motor at peak power climbing ${live.grade.toFixed(1)}% grade` : 'Motor at peak power: hard acceleration'); p.peakT = Date.now(); }
    if (soc < 20 && p.soc >= 20) push('warn', 'Battery below 20 %');
    Object.assign(p, { zone: live.zone, overtaking: live.overtaking, status: live.status, soc });
  }, [live]);
  useEffect(() => {
    const p = prev.current;
    if (vit.spo2 < 92 && !(p.spo2 < 92)) push('crit', `SpO2 ${vit.spo2}%: low oxygen saturation`);
    if (vit.hr > 120 && !(p.hr > 120)) push('crit', `Heart rate ${vit.hr} bpm: tachycardia`);
    if (vit.sys < 90 && !(p.sys < 90)) push('crit', `BP ${vit.sys}/${vit.dia}: hypotension`);
    p.spo2 = vit.spo2; p.hr = vit.hr; p.sys = vit.sys;
  }, [vit]);
  useEffect(() => { push('ok', 'Hospital uplink connected'); push('info', `Pre-alert sent to ${HOSPITALS[0].name}`); }, []);
  const arrived = T.arrivedAt !== null;
  const prevArr = useRef(false);
  useEffect(() => { if (arrived && !prevArr.current) push('ok', `Arrived at ${HOSPITALS[T.hosp].name}: patient handover`); prevArr.current = arrived; }, [arrived]);

  const vAlarm = { hr: vit.hr > 120 || vit.hr < 50, spo2: vit.spo2 < 92, bp: vit.sys < 90 || vit.sys > 160, temp: vit.temp > 38, rr: vit.rr > 24 };
  const patientState = vAlarm.spo2 || vAlarm.bp ? 'crit' : vAlarm.hr || vAlarm.temp || vAlarm.rr ? 'warn' : 'ok';

  // trends for sparklines (one sample per second)
  const hist = useRef({ hr: [], spo2: [], power: [], soc: [] });
  const lastSample = useRef(0);
  const nowMs = Date.now();
  if (nowMs - lastSample.current > 1000) {
    lastSample.current = nowMs;
    const H = hist.current;
    const add = (k, v) => { H[k].push(v); if (H[k].length > 60) H[k].shift(); };
    add('hr', vit.hr); add('spo2', vit.spo2); add('power', live.power); add('soc', soc);
  }
  const t0 = useRef(Date.now());
  const runS = Math.floor((nowMs - t0.current) / 1000);
  const tripKm = HOSPITALS[T.hosp].km;
  const progress = Math.max(0, Math.min(1, 1 - remain / tripKm));
  const crit = patientState === 'crit';

  return (
    <div className="dash dash2">
      {/* ---------------- mission bar */}
      <section className={'mission' + (crit ? ' crit' : '')}>
        <div className="ms-case">
          <i className="ms-dot" />
          <div>
            <span className="label">Emergency run · Case MX-0427</span>
            <b>Male, 54 · Suspected cardiac event</b>
          </div>
        </div>
        <div className="ms-route">
          <div className="ms-ends"><span>Pickup</span><span>{HOSPITALS[T.hosp].name}</span></div>
          <div className="ms-track">
            <i className="ms-fill" style={{ width: `${progress * 100}%` }} />
            <span className="ms-amb" style={{ left: `${progress * 100}%` }}><DIcon k="amb" /></span>
            <span className="ms-pin start" /><span className="ms-pin end"><DIcon k="hosp" /></span>
          </div>
        </div>
        <div className="ms-stats">
          <div><span className="label">ETA</span><b>{arrived ? 'Here' : `${Math.max(1, Math.round(etaMin))}`}<small>{arrived ? '' : ' min'}</small></b></div>
          <div><span className="label">Left</span><b>{remain.toFixed(1)}<small> km</small></b></div>
          <div><span className="label">On run</span><b>{String(Math.floor(runS / 60)).padStart(2, '0')}:{String(runS % 60).padStart(2, '0')}</b></div>
          <div className="ms-link"><DIcon k="wifi" /><span>5G · Hospital linked</span></div>
        </div>
      </section>

      {/* ---------------- patient */}
      <section className={'dcard d-patient ' + patientState} style={{ '--acc': '#ff5d6c' }}>
        <CardHead icon="heart" title="Patient monitor" sub="MX-0427 · Lead II" beat={vit.hr}
          pill={<span className={'pill ' + (patientState === 'ok' ? 'ok' : patientState === 'warn' ? 'warn' : 'crit')}>{patientState === 'ok' ? 'STABLE' : patientState === 'warn' ? 'WATCH' : 'ALARM'}</span>} />
        <div className="d-waves">
          <div className="wave-row"><span className="wave-tag" style={{ color: '#39ff88' }}>ECG II</span><Sweep fn={ecgWave} rate={vit.hr / 60} color="#39ff88" active={active} /></div>
          <div className="wave-row"><span className="wave-tag" style={{ color: '#4dc3ff' }}>PLETH</span><Sweep fn={plethWave} rate={vit.hr / 60} color="#4dc3ff" active={active} /></div>
          <div className="wave-row"><span className="wave-tag" style={{ color: '#f2e14b' }}>RESP</span><Sweep fn={respWave} rate={vit.rr / 60} color="#f2e14b" active={active} thin /></div>
        </div>
        <div className="d-vitals">
          <Vital label="Heart rate" unit="bpm" v={vit.hr} color="#39ff88" alarm={vAlarm.hr} trend={hist.current.hr} />
          <Vital label="SpO2" unit="%" v={vit.spo2} color="#4dc3ff" alarm={vAlarm.spo2} trend={hist.current.spo2} />
          <Vital label="NIBP mmHg" unit="" v={`${vit.sys}/${vit.dia}`} color="#eef1f3" alarm={vAlarm.bp} small />
          <Vital label="Temp" unit="°C" v={vit.temp.toFixed(1)} color="#ffb547" alarm={vAlarm.temp} />
          <Vital label="Resp" unit="/min" v={vit.rr} color="#f2e14b" alarm={vAlarm.rr} />
        </div>
        <div className="seg d-scen">
          {Object.entries(SCEN).map(([k, s]) => <button key={k} className={scen === k ? 'on' : ''} onClick={() => setScen(k)}>{s.label}</button>)}
        </div>
      </section>

      {/* ---------------- instrument cluster */}
      <section className="dcard d-speed" style={{ '--acc': '#39ff88' }}>
        <CardHead icon="gauge" title="Drive" sub={live.zone || 'City Traffic'}
          pill={<span className="pill ok">{live.auto ? 'AUTOPILOT · TOUR' : 'AUTOPILOT'}</span>} />
        <Cluster speed={live.speed} limit={live.limit} power={live.power} soc={soc} status={live.status} />
        <div className="d-trip">
          <div><DIcon k="odo" /><span><span className="label">Odometer</span><b>{(1245.6 + (live.odo || 0)).toFixed(1)}<small> km</small></b></span></div>
          <div><DIcon k="route" /><span><span className="label">Trip</span><b>{(live.odo || 0).toFixed(2)}<small> km</small></b></span></div>
          <div><DIcon k="grade" /><span><span className="label">Grade</span><b>{live.grade >= 0 ? '+' : ''}{live.grade.toFixed(1)}<small> %</small></b></span></div>
          <div><DIcon k="mtn" /><span><span className="label">Altitude</span><b>{Math.round(live.elevation * 10 + 420)}<small> m</small></b></span></div>
        </div>
      </section>

      {/* ---------------- battery */}
      <section className="dcard d-batt" style={{ '--acc': soc < 20 ? '#ff3b4a' : '#39ff88' }}>
        <CardHead icon="battery" title="Battery" sub="16S LFP · 5.12 kWh"
          pill={<span className={'pill ' + (soc < 20 ? 'crit' : 'ok')}>{live.status === 'REGEN' ? 'CHARGING · REGEN' : 'DISCHARGING'}</span>} />
        <BatteryGfx soc={soc} charging={live.status === 'REGEN'} />
        <div className="d-range">
          <div><b>{Math.round(rangeKm)}</b><small>km range</small></div>
          <div><b>{Math.round(live.whkm || 95)}</b><small>Wh/km</small></div>
        </div>
        <div className="d-spark">
          <span className="label">Power · last 60 s</span>
          <Spark data={hist.current.power} zero color="#39ff88" neg="#4d8dff" />
        </div>
        <div className="kv">
          <div><span>Pack</span><b>{packV.toFixed(1)} V</b></div>
          <div><span>Current</span><b>{current.toFixed(0)} A</b></div>
          <div><span>Energy</span><b>{(soc / 100 * 5.12).toFixed(2)} kWh</b></div>
          <div><span>Pack temp</span><b>{(27 + Math.max(0, live.power) * 0.6).toFixed(1)} °C</b></div>
        </div>
      </section>

      {/* ---------------- navigation */}
      <section className="dcard d-nav" style={{ '--acc': '#4dc3ff' }}>
        <CardHead icon="nav" title="Navigation" sub="AI route · fastest hospital" pill={<span className="pill ok">GPS 3D · 12 SAT</span>} />
        <MiniMap active={active} />
        <div className="d-dest">
          <span className="d-hosp"><DIcon k="hosp" /></span>
          <div className="d-dest-main">
            <span className="label">{arrived ? 'Arrived' : 'Destination'} · {HOSPITALS[T.hosp].type}</span>
            <b>{HOSPITALS[T.hosp].name}</b>
          </div>
          <div className="d-eta"><b>{remain.toFixed(1)}</b><small>km</small></div>
          <div className="d-eta hi"><b>{arrived ? '0' : Math.max(1, Math.round(etaMin))}</b><small>min</small></div>
        </div>
      </section>

      {/* ---------------- vehicle health */}
      <section className="dcard d-veh" style={{ '--acc': '#b18cff' }}>
        <CardHead icon="car" title="Vehicle health" sub="All systems"
          pill={<span className={'pill ' + (live.status === 'PEAK' ? 'warn' : 'ok')}>{live.status}</span>} />
        <div className="vh">
          <TopView power={live.power} status={live.status} />
          <div className="vh-tiles">
            <Tile icon="motor" label="Motor" v={`${Math.round(live.motorTemp)}°C`} pct={(live.motorTemp - 20) / 100} sub={`${live.power.toFixed(1)} kW`} />
            <Tile icon="chip" label="Inverter" v={`${Math.round(live.motorTemp - 3 + Math.max(0, live.power) * 0.5)}°C`} pct={(live.motorTemp - 20) / 100} sub="FOC" />
            <Tile icon="bolt" label="12 V aux" v="13.4 V" pct={0.92} sub="92 %" />
            <Tile icon="sun" label="Solar" v={`+${Math.round(236 + Math.sin(nowMs / 9000) * 14)} W`} pct={0.8} sub="roof" />
            <Tile icon="o2" label="Oxygen" v={`${Math.max(40, 185 - (live.odo || 0) * 2.2).toFixed(0)} bar`} pct={Math.max(40, 185 - (live.odo || 0) * 2.2) / 200} sub="cylinder" />
            <Tile icon="fan" label="Cabin" v="23.5°C" pct={0.55} sub="HEPA on" />
          </div>
        </div>
      </section>

      {/* ---------------- emergency */}
      <section className="dcard d-emg" style={{ '--acc': '#ff3b4a' }}>
        <CardHead icon="siren" title="Emergency" sub="Warning systems" pill={<span className="pill crit">CODE 3</span>} />
        <Emergency />
      </section>

      {/* ---------------- alerts */}
      <section className="dcard d-alerts" style={{ '--acc': '#ffb547' }}>
        <CardHead icon="bell" title="Alerts" sub="Live feed" pill={<span className="pill ok">{alerts.length}</span>} />
        <ul className="alist">
          {alerts.map((a) => (
            <li key={a.id} className={a.lvl}>
              <span className="al-ico">{{ ok: '✓', info: 'i', warn: '!', crit: '!' }[a.lvl]}</span>
              <span className="al-txt"><span>{a.msg}</span><time>{a.t.toLocaleTimeString([], { hour12: false })}</time></span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ widgets
function CardHead({ icon, title, sub, pill, beat }) {
  return (
    <header className="ch">
      <span className={'ch-ico' + (beat ? ' beat' : '')} style={beat ? { animationDuration: `${60 / beat}s` } : undefined}><DIcon k={icon} /></span>
      <span className="ch-txt"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {pill}
    </header>
  );
}

function Vital({ label, unit, v, color, alarm, small, trend }) {
  return (
    <div className={'vital' + (alarm ? ' alarm' : '')} style={{ '--vc': color }}>
      <span className="label">{label}</span>
      <b style={{ color: alarm ? undefined : color, fontSize: small ? 21 : undefined }}>{v}<small>{unit}</small></b>
      {trend && trend.length > 2 ? <Spark data={trend} color={alarm ? '#ff5a66' : color} thin /> : <i className="vital-bar" />}
    </div>
  );
}

function Spark({ data, color, neg, zero, thin }) {
  const W = 120, H = thin ? 18 : 40;
  if (!data || data.length < 2) return <svg className={'spark' + (thin ? ' thin' : '')} viewBox={`0 0 ${W} ${H}`} />;
  let lo = Math.min(...data), hi = Math.max(...data);
  if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (hi - lo < 1e-3) { hi += 1; lo -= 1; }
  const X = (i) => W - (data.length - 1 - i) * (W / 59), Y = (v) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const zy = Y(0);
  const gid = 'sg' + color.slice(1) + (thin ? 't' : '');
  return (
    <svg className={'spark' + (thin ? ' thin' : '')} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {zero && <line x1="0" x2={W} y1={zy} y2={zy} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 3" />}
      {!thin && <path d={`${d} L${W} ${zero ? zy : H} L${X(0).toFixed(1)} ${zero ? zy : H} Z`} fill={`url(#${gid})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth={thin ? 1.4 : 1.8} vectorEffect="non-scaling-stroke" />
      {neg && data.map((v, i) => (v < -0.1 ? <circle key={i} cx={X(i)} cy={Y(v)} r="1.6" fill={neg} /> : null))}
      <circle cx={X(data.length - 1)} cy={Y(data[data.length - 1])} r={thin ? 2 : 2.8} fill={color} />
    </svg>
  );
}

function arc(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const sweep = a1 >= a0 ? 1 : 0;
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${sweep} ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

// EV-style instrument cluster: speed (outer), power/regen (left), battery (right)
function Cluster({ speed, limit, power, soc, status }) {
  const MAX = 80, A0 = 135, SWEEP = 270;
  const ang = (v) => A0 + (SWEEP * Math.min(MAX, Math.max(0, v))) / MAX;
  const cx = 180, cy = 150, R = 124;
  const ticks = [];
  for (let v = 0; v <= MAX; v += 2.5) {
    const a = (ang(v) * Math.PI) / 180, major = v % 10 === 0, mid = v % 5 === 0;
    const r1 = R - (major ? 13 : mid ? 8 : 5);
    const lit = v <= speed;
    ticks.push(<line key={v} x1={cx + R * Math.cos(a)} y1={cy + R * Math.sin(a)} x2={cx + r1 * Math.cos(a)} y2={cy + r1 * Math.sin(a)} className={'tk' + (major ? ' major' : '') + (lit ? ' lit' : '')} />);
    if (major) ticks.push(<text key={'t' + v} x={cx + (R - 26) * Math.cos(a)} y={cy + (R - 26) * Math.sin(a) + 4} className={'tk-num' + (lit ? ' lit' : '')}>{v}</text>);
  }
  // power arc (left, bottom → top): -6..8 kW, zero at 25 %
  const PA0 = 150, PA1 = 214, pz = PA0 + (PA1 - PA0) * (6 / 14);
  const pAng = PA0 + (PA1 - PA0) * ((Math.max(-6, Math.min(8, power)) + 6) / 14);
  // battery arc (right, bottom → top)
  const BA0 = 30, BA1 = -34;
  const bAng = BA0 + (BA1 - BA0) * (soc / 100);
  const ri = 72;
  const pcol = power < -0.1 ? '#4d8dff' : status === 'PEAK' ? '#ffb547' : '#39ff88';
  const bcol = soc < 20 ? '#ff3b4a' : soc < 40 ? '#ffb547' : '#39ff88';
  const over = speed > limit + 2;
  return (
    <div className="speedo">
      <svg viewBox="0 0 360 285" role="img" aria-label={`Speed ${Math.round(speed)} km/h`}>
        <defs>
          <linearGradient id="spg2" x1="0" x2="1" y1="1" y2="0"><stop offset="0" stopColor="#1aa35a" /><stop offset="0.55" stopColor="#39ff88" /><stop offset="0.85" stopColor="#d4ff5a" /><stop offset="1" stopColor="#ffb547" /></linearGradient>
          <radialGradient id="spbg" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#163024" stopOpacity="0.9" /><stop offset="0.7" stopColor="#0c1411" stopOpacity="0.5" /><stop offset="1" stopColor="#0c1411" stopOpacity="0" /></radialGradient>
          <filter id="spglow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <circle cx={cx} cy={cy} r={R - 14} fill="url(#spbg)" />
        <path d={arc(cx, cy, R + 9, A0, A0 + SWEEP)} className="sp-track" />
        <path d={arc(cx, cy, R + 9, A0, ang(speed) + 0.01)} className="sp-fill glow" stroke="url(#spg2)" filter="url(#spglow)" />
        <path d={arc(cx, cy, R + 9, A0, ang(speed) + 0.01)} className="sp-fill" stroke="url(#spg2)" />
        <path d={arc(cx, cy, R + 9, ang(70), A0 + SWEEP)} className="sp-red" />
        {ticks}
        {/* inner arcs */}
        <path d={arc(cx, cy, ri, PA0, PA1)} className="ia-track" />
        <path d={arc(cx, cy, ri, Math.min(pz, pAng), Math.max(pz, pAng) + 0.01)} className="ia-fill" stroke={pcol} />
        <line x1={cx + (ri - 7) * Math.cos(pz * Math.PI / 180)} y1={cy + (ri - 7) * Math.sin(pz * Math.PI / 180)} x2={cx + (ri + 7) * Math.cos(pz * Math.PI / 180)} y2={cy + (ri + 7) * Math.sin(pz * Math.PI / 180)} stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" />
        <path d={arc(cx, cy, ri, BA1, BA0)} className="ia-track" />
        <path d={arc(cx, cy, ri, bAng, BA0)} className="ia-fill" stroke={bcol} />
        <text x={cx - 50} y={cy + 40} className="ia-lab" textAnchor="middle" fill={pcol}>{power < -0.1 ? 'REGEN' : 'POWER'}</text>
        <text x={cx - 50} y={cy + 55} className="ia-val" textAnchor="middle">{power.toFixed(1)}<tspan className="ia-u"> kW</tspan></text>
        <text x={cx + 50} y={cy + 40} className="ia-lab" textAnchor="middle" fill={bcol}>BATT</text>
        <text x={cx + 50} y={cy + 55} className="ia-val" textAnchor="middle">{Math.round(soc)}<tspan className="ia-u"> %</tspan></text>
        {/* needle */}
        <g className="needle" style={{ transform: `rotate(${ang(speed)}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          <path d={`M${cx + 80} ${cy - 2.5} L${cx + R - 6} ${cy} L${cx + 80} ${cy + 2.5} Z`} />
        </g>
        {/* centre read-out */}
        <text x={cx} y={cy + 8} className="sp-big">{Math.round(speed)}</text>
        <text x={cx} y={cy + 28} className="sp-unit">KM/H</text>
        <g transform={`translate(${cx},${cy + 66})`} className={over ? 'limit over' : 'limit'}>
          <circle r="17" /><circle r="12.5" className="in" />
          <text y="4.5">{Math.round(limit)}</text>
        </g>
        <text x={cx - 70} y={cy + 118} className="sp-gear">P R N <tspan className="on">D</tspan></text>
        <text x={cx + 70} y={cy + 118} className="sp-gear dim">{status === 'REGEN' ? 'REGEN' : status === 'PEAK' ? 'BOOST' : 'E-MODE'}</text>
      </svg>
    </div>
  );
}

function BatteryGfx({ soc, charging }) {
  const col = soc < 20 ? '#ff3b4a' : soc < 40 ? '#ffb547' : '#39ff88';
  return (
    <div className={'bgfx' + (charging ? ' charging' : '')} style={{ '--bc': col }}>
      <div className="bgfx-body">
        <div className="bgfx-fill" style={{ width: `${soc}%` }}><i className="bgfx-stripes" /></div>
        <div className="bgfx-cells">{Array.from({ length: 16 }, (_, i) => <i key={i} />)}</div>
        <div className="bgfx-txt"><b>{soc.toFixed(1)}</b><small>%</small>{charging && <span className="bgfx-bolt"><DIcon k="bolt" /></span>}</div>
      </div>
      <span className="bgfx-cap" />
    </div>
  );
}

function TopView({ power, status }) {
  const regen = power < -0.1;
  const flow = regen ? '#4d8dff' : '#39ff88';
  const tyres = [['FL', 30, 38, 3.4], ['FR', 130, 38, 3.4], ['RL', 30, 150, 3.5], ['RR', 130, 150, 3.4]];
  return (
    <svg className="topview" viewBox="0 0 160 210" aria-label="Vehicle top view">
      <defs>
        <linearGradient id="tvb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#1b2329" /><stop offset="1" stopColor="#11171b" /></linearGradient>
      </defs>
      {tyres.map(([n, x, y, b]) => (
        <g key={n}>
          <rect x={x - 7} y={y - 14} width="14" height="28" rx="4" fill="#0a0c0e" stroke="#39ff88" strokeOpacity="0.55" />
          <text x={x < 80 ? x - 12 : x + 12} y={y + 3} className="tv-t" textAnchor={x < 80 ? 'end' : 'start'}>{b.toFixed(1)}</text>
        </g>
      ))}
      <rect x="38" y="10" width="84" height="190" rx="18" fill="url(#tvb)" stroke="rgba(255,255,255,0.18)" />
      <path d="M46 34 Q80 18 114 34 L110 54 Q80 46 50 54 Z" fill="rgba(120,200,255,0.18)" stroke="rgba(120,200,255,0.4)" />
      <rect x="52" y="62" width="56" height="10" rx="3" className="tv-bar" />
      <rect x="52" y="62" width="28" height="10" rx="3" fill="#ff3b4a" className="tv-lr" />
      <rect x="80" y="62" width="28" height="10" rx="3" fill="#4d8dff" className="tv-lb" />
      <line x1="44" x2="116" y1="84" y2="84" stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
      <rect x="54" y="96" width="52" height="44" rx="6" fill="rgba(57,255,136,0.08)" stroke="#39ff88" strokeOpacity="0.6" />
      <text x="80" y="122" className="tv-l" textAnchor="middle">BATTERY</text>
      <circle cx="80" cy="168" r="11" fill="rgba(177,140,255,0.12)" stroke="#b18cff" strokeOpacity="0.8" />
      <text x="80" y="171" className="tv-l" textAnchor="middle" fill="#b18cff">M</text>
      <path d="M80 140 V157" stroke={flow} strokeWidth="2.5" strokeDasharray="4 4" className={'tv-flow' + (regen ? ' rev' : '')} style={{ opacity: Math.abs(power) > 0.1 ? 1 : 0.25 }} />
      <path d="M86 26 h-12 l6 -8 z" fill="rgba(255,255,255,0.4)" />
      <text x="80" y="206" className="tv-l" textAnchor="middle" fill={status === 'PEAK' ? '#ffb547' : '#8a939c'}>{regen ? 'REGEN ↑' : 'DRIVE ↓'}</text>
    </svg>
  );
}

function Tile({ icon, label, v, pct, sub }) {
  const p = Math.max(0, Math.min(1, pct));
  const col = p > 0.85 && (icon === 'motor' || icon === 'chip') ? '#ffb547' : 'var(--acc)';
  return (
    <div className="tile">
      <span className="tile-ico"><DIcon k={icon} /></span>
      <span className="tile-txt"><span className="label">{label}</span><b>{v}</b></span>
      <i className="tile-bar"><i style={{ width: `${p * 100}%`, background: col }} /></i>
      <small>{sub}</small>
    </div>
  );
}

function Emergency() {
  const [siren, setSiren] = useState('Wail');
  const [lights, setLights] = useState(true);
  const [lat, setLat] = useState(18);
  useEffect(() => { const i = setInterval(() => setLat(14 + Math.round(Math.random() * 9)), 2000); return () => clearInterval(i); }, []);
  return (
    <div className="emg">
      <button className={'lightbar' + (lights ? ' on' : '')} onClick={() => setLights(!lights)} aria-pressed={lights} title="Toggle light bar">
        {Array.from({ length: 8 }, (_, i) => <i key={i} className={i < 4 ? 'r' : 'b'} style={{ animationDelay: `${(i % 4) * 0.06}s` }} />)}
      </button>
      <div className="emg-siren">
        <span className={'emg-spk' + (siren !== 'Off' ? ' on' : '')}><DIcon k="speaker" /><i /><i /></span>
        <div className="seg mini2">
          {['Wail', 'Yelp', 'Hi-Lo', 'Off'].map((m) => <button key={m} className={siren === m ? 'on' : ''} onClick={() => setSiren(m)}>{m}</button>)}
        </div>
      </div>
      <ul className="emg-list">
        <li><DIcon k="wifi" /><span>Hospital uplink</span><b>{lat} ms</b></li>
        <li><DIcon k="send" /><span>Pre-alert</span><b>Sent</b></li>
        <li><DIcon k="lock" /><span>Stretcher</span><b>Locked</b></li>
        <li><DIcon k="door" /><span>Rear doors</span><b>Closed</b></li>
      </ul>
    </div>
  );
}

function DIcon({ k }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const I = {
    heart: <path {...p} d="M12 20 C3 14 3.5 6.5 8 6 C10 5.8 11.4 7.2 12 8.3 C12.6 7.2 14 5.8 16 6 C20.5 6.5 21 14 12 20 Z M6.5 12.5 H9.5 L11 9.5 L13 15 L14.5 12.5 H17.5" />,
    gauge: <g {...p}><path d="M4 16 A8 8 0 1 1 20 16" /><path d="M12 16 L16 9" /><circle cx="12" cy="16" r="1.4" fill="currentColor" /></g>,
    battery: <g {...p}><rect x="3" y="7" width="16" height="10" rx="2" /><path d="M21 10.5 V13.5 M10.5 9 L8.5 12.5 H11.5 L9.5 15" /></g>,
    nav: <path {...p} d="M12 3 L19 20 L12 16 L5 20 Z" />,
    car: <g {...p}><path d="M5 15 L6.5 9.5 Q7 8 8.5 8 H15.5 Q17 8 17.5 9.5 L19 15" /><rect x="3.5" y="15" width="17" height="4" rx="1.5" /><circle cx="7.5" cy="19.5" r="1.3" /><circle cx="16.5" cy="19.5" r="1.3" /></g>,
    siren: <g {...p}><path d="M6 18 V13 A6 6 0 0 1 18 13 V18 Z M4 20.5 H20 M12 3.5 V5.5 M4.8 6.3 L6.2 7.7 M19.2 6.3 L17.8 7.7" /></g>,
    bell: <g {...p}><path d="M6 16 V11 A6 6 0 0 1 18 11 V16 L19.5 18 H4.5 Z M10 20.5 H14" /></g>,
    amb: <g {...p} strokeWidth="1.5"><path d="M2.5 16 V8.5 H14 V16 M14 10.5 H18 L21.5 13.5 V16 H2.5" /><circle cx="7" cy="17" r="1.8" fill="#0b0e11" /><circle cx="17" cy="17" r="1.8" fill="#0b0e11" /><path d="M8.2 10.5 V14 M6.5 12.2 H10" stroke="#ff3b4a" /></g>,
    hosp: <g {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8 V16 M8 12 H16" /></g>,
    wifi: <g {...p}><path d="M4 9.5 A11 11 0 0 1 20 9.5 M7 12.8 A6.5 6.5 0 0 1 17 12.8 M10 16 A2.5 2.5 0 0 1 14 16" /><circle cx="12" cy="18.6" r="0.9" fill="currentColor" /></g>,
    odo: <g {...p}><circle cx="12" cy="12" r="8" /><path d="M12 7 V12 L15 14" /></g>,
    route: <g {...p}><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18 H15 A3 3 0 0 0 15 12 H9 A3 3 0 0 1 9 6 H16" /></g>,
    grade: <path {...p} d="M3 19 L21 9 V19 Z" />,
    mtn: <path {...p} d="M2.5 19 L9 8 L13 14 L15.5 10.5 L21.5 19 Z" />,
    motor: <g {...p}><circle cx="12" cy="12" r="7.5" /><circle cx="12" cy="12" r="2.5" /><path d="M12 4.5 V9.5 M12 14.5 V19.5 M4.5 12 H9.5 M14.5 12 H19.5" /></g>,
    chip: <g {...p}><rect x="6.5" y="6.5" width="11" height="11" rx="1.5" /><path d="M9.5 4 V6.5 M14.5 4 V6.5 M9.5 17.5 V20 M14.5 17.5 V20 M4 9.5 H6.5 M4 14.5 H6.5 M17.5 9.5 H20 M17.5 14.5 H20" /></g>,
    bolt: <path {...p} d="M13.5 3 L6 13.5 H11.5 L10.5 21 L18 10.5 H12.5 Z" />,
    sun: <g {...p}><circle cx="12" cy="12" r="4" />{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <line key={i} x1={12 + Math.cos(a) * 6.5} y1={12 + Math.sin(a) * 6.5} x2={12 + Math.cos(a) * 9} y2={12 + Math.sin(a) * 9} />; })}</g>,
    o2: <g {...p}><rect x="8" y="6" width="8" height="15" rx="4" /><path d="M10 6 V3.5 H14 V6" /><path d="M10.5 13.5 A1.6 1.6 0 1 0 10.6 13.4" /></g>,
    fan: <g {...p}><circle cx="12" cy="12" r="1.8" /><path d="M12 10.2 C11 5 16 4 16 7.5 M13.6 13 C18 15.5 15.5 20 13 17.5 M10.4 13 C6 15 4 10.5 7.5 9.5" /></g>,
    speaker: <path {...p} d="M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z" />,
    send: <path {...p} d="M4 12 L20 4 L14 20 L11.5 13 Z" />,
    lock: <g {...p}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11 V8 A4 4 0 0 1 16 8 V11" /></g>,
    door: <g {...p}><rect x="6" y="3.5" width="12" height="17" rx="1.5" /><circle cx="15" cy="12" r="0.9" fill="currentColor" /></g>,
  };
  return <svg className="dico" viewBox="0 0 24 24" aria-hidden="true">{I[k] || null}</svg>;
}

// sweeping physiological trace
function Sweep({ fn, rate, color, active, thin }) {
  const ref = useRef(null);
  const st = useRef({ rate, color });
  st.current = { rate, color };
  useEffect(() => {
    const c = ref.current, x = c.getContext('2d');
    let raf, px = 0, prev = null, phase = 0, last = performance.now();
    const fit = () => {
      const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(10, r.width * d); c.height = Math.max(10, r.height * d);
      x.fillStyle = '#07090b'; x.fillRect(0, 0, c.width, c.height); px = 0; prev = null;
    };
    const ro = new ResizeObserver(fit); ro.observe(c); fit();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const speed = c.width / 5;
      const n = Math.max(1, Math.round(speed * dt));
      for (let i = 0; i < n; i++) {
        phase += (st.current.rate * dt) / n;
        const y = c.height * 0.55 - fn(phase % 1) * c.height * 0.4;
        x.fillStyle = '#07090b'; x.fillRect(px, 0, 14, c.height);
        x.strokeStyle = st.current.color; x.lineWidth = Math.max(1.2, c.height / (thin ? 60 : 40));
        x.shadowColor = st.current.color; x.shadowBlur = 6;
        if (prev !== null) { x.beginPath(); x.moveTo(px - 1, prev); x.lineTo(px, y); x.stroke(); }
        x.shadowBlur = 0; prev = y; px++;
        if (px >= c.width) { px = 0; prev = null; }
      }
    };
    if (active) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [active, fn]);
  return <canvas className="sweep" ref={ref} />;
}

// heading-up minimap drawn from the live simulation
function MiniMap({ active }) {
  const ref = useRef(null);
  const [info, setInfo] = useState({ next: '', turn: '' });
  useEffect(() => {
    if (!active) return;
    const c = ref.current, x = c.getContext('2d');
    let raf, lastInfo = 0;
    const draw = (now) => {
      raf = requestAnimationFrame(draw);
      const sim = store.get().sim;
      const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(r.width * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
      const W = c.width, H = c.height;
      x.fillStyle = '#080b0d'; x.fillRect(0, 0, W, H);
      // grid
      x.strokeStyle = 'rgba(57,255,136,0.05)'; x.lineWidth = 1;
      for (let gx = 0; gx < W; gx += 24 * dpr) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
      for (let gy = 0; gy < H; gy += 24 * dpr) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
      if (!sim || !sim.driver || !sim.path) return;
      const p = sim.path, d = sim.driver;
      const me = p.point(d.s, d.u);
      const h = me.h, ch = Math.cos(h), sh = Math.sin(h);
      const sc = 1.15 * dpr, cx = W / 2, cy = H * 0.74;
      const S = (wx, wz) => {
        const dx = wx - me.x, dz = wz - me.z;
        const f = dx * ch - dz * sh, l = -dx * sh - dz * ch;
        return [cx - l * sc, cy - f * sc];
      };
      const s0 = Math.max(p.base + 1, d.s - 70), s1 = Math.min(p.length - 2, d.s + 260);
      // road surface
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.strokeStyle = '#2a3036';
      for (let s = s0; s < s1; s += 3) {
        const a = p.point(s), b = p.point(Math.min(s1, s + 3));
        const [ax, ay] = S(a.x, a.z), [bx, by] = S(b.x, b.z);
        x.lineWidth = Math.max(3 * dpr, p.val('hw', s) * 2 * sc);
        x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
      }
      // route ahead
      x.strokeStyle = '#39ff88'; x.lineWidth = 2.2 * dpr; x.shadowColor = '#39ff88'; x.shadowBlur = 8;
      x.beginPath();
      for (let s = d.s; s < s1; s += 3) { const a = p.point(s, p.val('li', s) * 0.4); const [ax, ay] = S(a.x, a.z); s === d.s ? x.moveTo(ax, ay) : x.lineTo(ax, ay); }
      x.stroke(); x.shadowBlur = 0;
      // traffic
      for (const v of sim.traffic.list) {
        if (v.s < s0 || v.s > s1) continue;
        const a = p.point(v.s, v.u); const [vx, vy] = S(a.x, a.z);
        x.fillStyle = v.dir > 0 ? '#c9d2da' : '#ff7a59';
        x.beginPath(); x.arc(vx, vy, (v.type === 'bus' || v.type === 'truck' ? 3.6 : v.type === 'bike' ? 2 : 2.8) * dpr, 0, 7); x.fill();
      }
      // ambulance arrow
      x.save(); x.translate(cx, cy);
      x.fillStyle = '#39ff88'; x.shadowColor = '#39ff88'; x.shadowBlur = 12;
      x.beginPath(); x.moveTo(0, -9 * dpr); x.lineTo(6 * dpr, 7 * dpr); x.lineTo(0, 3.5 * dpr); x.lineTo(-6 * dpr, 7 * dpr); x.closePath(); x.fill();
      x.restore();
      // info: next environment and next sharp turn
      if (now - lastInfo > 500) {
        lastInfo = now;
        const nz = p.zones.find((z) => z.s0 > d.s + 1 && z.type !== p.zoneAt(d.s).type);
        let turn = 'Straight ahead';
        for (let s = d.s + 10; s < Math.min(p.length - 2, d.s + 400); s += 2) {
          const k = p.val('k', s);
          if (Math.abs(k) > 1 / 45) {
            const dist = Math.round((s - d.s) / 10) * 10;
            turn = `${Math.abs(k) > 1 / 20 ? 'Hairpin' : 'Sharp'} ${k > 0 ? 'left' : 'right'} in ${dist} m`;
            break;
          }
        }
        setInfo({ next: nz ? `${ZONE_LABEL[nz.type]} in ${(Math.max(0, nz.s0 - d.s) / 1000).toFixed(1)} km` : 'Same environment ahead', turn });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return (
    <div className="minimap">
      <canvas ref={ref} />
      <div className="mm-turn"><span className="mm-arrow">↱</span>{info.turn}</div>
      <div className="mm-next">{info.next}</div>
    </div>
  );
}
const ZONE_LABEL = { city: 'City traffic', market: 'Market', narrow: 'Narrow lanes', ghat: 'Ghat climb', hairpin: 'Hairpin bends', hillstation: 'Hill station', descent: 'Mountain descent' };

