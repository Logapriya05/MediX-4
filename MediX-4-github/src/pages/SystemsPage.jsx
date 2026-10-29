import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLive } from '../useLive.js';
import { store } from '../store.js';
import ChargingView from './ChargingView.jsx';

const CHG_LINK = { charger: 'ac', battery: 'ac', bms: 'ac', solar: 'solar', mcu: 'regen', motor: 'regen', dcdc: 'aux', medical: 'aux' };

// ------------------------------------------------------------ scenarios
const SCEN = {
  live: { label: 'Live drive', hint: 'Follows the ambulance on the Drive page' },
  regen: { label: 'Regen', hint: 'Braking downhill, motor charges the pack' },
  charge: { label: 'Charging', hint: 'Parked at base, 3.3 kW AC' },
  emergency: { label: 'Emergency', hint: 'Critical patient, full medical load' },
};
const PATIENT = {
  stable: { label: 'Stable', hr: 72, spo2: 98, bp: [120, 80], temp: 36.8, color: '#39ff88' },
  tachy: { label: 'Tachycardia', hr: 128, spo2: 95, bp: [138, 90], temp: 37.4, color: '#ffb547' },
  critical: { label: 'Critical', hr: 146, spo2: 87, bp: [88, 54], temp: 38.6, color: '#ff3b4a' },
};

// ------------------------------------------------------------ architecture (top view, front = right)
const NODES = {
  monitor: { x: 190, y: 170, label: 'Patient monitor', icon: 'heart', g: 'medical' },
  medical: { x: 330, y: 170, label: 'Medical bus', icon: 'cross', g: 'medical' },
  solar: { x: 500, y: 170, label: 'Solar roof', icon: 'sun', g: 'power' },
  hvac: { x: 660, y: 170, label: 'HVAC + UV-C', icon: 'fan', g: 'climate', lab: 'above' },
  motor: { x: 190, y: 280, label: 'BLDC motor', icon: 'motor', g: 'drive' },
  mcu: { x: 330, y: 280, label: 'Motor controller', icon: 'chip', g: 'drive' },
  battery: { x: 500, y: 280, label: 'Battery pack', icon: 'battery', g: 'power', big: true },
  gateway: { x: 700, y: 280, label: '5G gateway', icon: 'antenna', g: 'connect' },
  charger: { x: 190, y: 400, label: 'Charge port', icon: 'plug', g: 'power' },
  bms: { x: 500, y: 400, label: 'BMS', icon: 'shield', g: 'power' },
  dcdc: { x: 660, y: 400, label: 'DC-DC 12 V', icon: 'bolt', g: 'power' },
  ai: { x: 880, y: 210, label: 'AI navigation', icon: 'nav', g: 'connect' },
  siren: { x: 880, y: 350, label: 'Siren + lights', icon: 'siren', g: 'safety' },
  cloud: { x: 880, y: 52, label: 'Hospital cloud', icon: 'cloud', g: 'connect', lab: 'left' },
};
// t: hv = traction power, lv = 12 V aux, data = CAN bus, up = wireless uplink
const EDGES = [
  { a: 'battery', b: 'mcu', t: 'hv', d: 'M425 280 H352', f: (S) => S.power / 6 },
  { a: 'mcu', b: 'motor', t: 'hv', d: 'M308 280 H212', f: (S) => S.power / 6 },
  { a: 'solar', b: 'battery', t: 'hv', d: 'M522 170 H545 V245', f: (S) => S.solarW / 300 },
  { a: 'charger', b: 'battery', t: 'hv', d: 'M212 400 H440 V315', f: (S) => S.chargeKw / 3.3 },
  { a: 'battery', b: 'dcdc', t: 'hv', d: 'M560 315 V400 H638', f: (S) => S.auxW / 900 },
  { a: 'dcdc', b: 'hvac', t: 'lv', d: 'M660 378 V192', f: (S) => S.hvacW / 500 },
  { a: 'hvac', b: 'medical', t: 'lv', d: 'M638 170 H612 V126 H330 V148', f: (S) => S.medW / 400 },
  { a: 'medical', b: 'monitor', t: 'lv', d: 'M308 170 H212', f: (S) => S.medW / 400 },
  { a: 'dcdc', b: 'siren', t: 'lv', d: 'M682 400 H800 V350 H858', f: (S) => (S.siren ? 0.8 : 0) },
  { a: 'bms', b: 'battery', t: 'data', d: 'M500 378 V315' },
  { a: 'battery', b: 'gateway', t: 'data', d: 'M575 270 H678' },
  { a: 'monitor', b: 'gateway', t: 'data', d: 'M168 170 H128 V234 H700 V258' },
  { a: 'mcu', b: 'gateway', t: 'data', d: 'M330 258 V234' },
  { a: 'gateway', b: 'ai', t: 'data', d: 'M722 280 H800 V210 H858' },
  { a: 'gateway', b: 'cloud', t: 'up', d: 'M716 265 V92 H880 V74' },
];
const LAYERS = [['hv', 'Traction power', '#39ff88'], ['lv', '12 V aux', '#ffb547'], ['data', 'CAN data', '#4dc3ff'], ['up', '5G uplink', '#b18cff']];
const COLOR = Object.fromEntries(LAYERS.map(([k, , c]) => [k, c]));

const HEALTH = [
  ['Powertrain', ['motor', 'mcu'], 'motor'],
  ['Battery', ['battery', 'bms'], 'battery'],
  ['Medical', ['monitor', 'medical'], 'monitor'],
  ['Connectivity', ['gateway', 'cloud', 'ai'], 'gateway'],
  ['Safety', ['siren'], 'siren'],
  ['Climate', ['hvac'], 'hvac'],
];

const r1 = (v) => v.toFixed(1);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// per-subsystem detail. ring: [0..1, caption, value text]; m: live readings; spark: history key
const INFO = {
  battery: {
    role: 'Energy storage', desc: '16S LFP traction pack under the cabin floor. Feeds the motor controller at 51.2 V and the 12 V systems through the DC-DC converter.',
    ring: (S) => [S.soc / 100, 'State of charge', `${r1(S.soc)}%`], spark: 'soc', sparkLabel: 'SoC %',
    m: (S) => [['Pack voltage', r1(S.packV), 'V'], ['Current', S.current.toFixed(0), 'A'], ['Energy left', (S.soc / 100 * 5.12).toFixed(2), 'kWh'], ['Est. range', S.range.toFixed(0), 'km']],
    specs: [['Chemistry', 'LiFePO4 · 16S1P'], ['Capacity', '100 Ah · 5.12 kWh'], ['Nominal', '51.2 V'], ['Cycle life', '3000+ cycles']],
  },
  bms: {
    role: 'Battery management', desc: 'Watches every cell voltage and temperature, balances the pack and cuts power if anything goes outside safe limits.',
    ring: (S) => [S.soh / 100, 'State of health', `${S.soh}%`], spark: 'cellT', sparkLabel: 'Max cell °C',
    m: (S) => [['Cell spread', S.cellDelta.toFixed(0), 'mV'], ['Max cell temp', r1(S.cellMaxT), '°C'], ['Balancing', S.balancing, ''], ['Isolation', '>500', 'kΩ']],
    specs: [['Protection', 'OV · UV · OC · OT'], ['Balancing', 'Passive, 60 mA'], ['Bus', 'CAN 500 kbps'], ['Contactors', 'Pre-charge + main']],
  },
  mcu: {
    role: 'Motor controller · FOC', desc: 'Turns battery DC into 3-phase AC for the motor using field-oriented control, and runs it backwards as a generator during regen braking.',
    ring: (S) => [Math.abs(S.power) / 8, 'Load', `${Math.round(Math.abs(S.power) / 8 * 100)}%`], spark: 'power', sparkLabel: 'Power kW',
    m: (S) => [['Phase current', Math.abs(S.power * 1000 / 48 / 0.92).toFixed(0), 'A'], ['Efficiency', S.power === 0 ? '—' : '95.8', '%'], ['MOSFET temp', r1(S.motorTemp - 4), '°C'], ['Mode', S.power < -0.1 ? 'REGEN' : S.power > 0.1 ? 'DRIVE' : 'IDLE', '']],
    specs: [['Rating', '48–60 V · 200 A'], ['Control', 'Sensored FOC'], ['Switching', '16 kHz'], ['Cooling', 'Finned aluminium']],
  },
  motor: {
    role: 'Traction motor', desc: 'Permanent-magnet BLDC motor driving the rear axle through a single-speed reduction gear. 8 kW peak for climbing ghat roads.',
    ring: (S) => [S.motorTemp / 120, 'Winding temp', `${r1(S.motorTemp)}°C`], spark: 'temp', sparkLabel: 'Winding °C',
    m: (S) => [['Power', r1(S.power), 'kW'], ['Speed', S.rpm.toFixed(0), 'rpm'], ['Torque', S.torque.toFixed(0), 'Nm'], ['Vehicle', S.speed.toFixed(0), 'km/h']],
    specs: [['Type', 'PMSM / BLDC'], ['Power', '5 kW cont. · 8 kW peak'], ['Gear', '1-speed, 6.2 : 1'], ['Insulation', 'Class H (180 °C)']],
  },
  solar: {
    role: 'Roof solar', desc: 'Thin-film panels on the roof trickle-charge the pack through an MPPT controller, enough to run the medical equipment while parked.',
    ring: (S) => [S.solarW / 300, 'Output', `${S.solarW.toFixed(0)} W`], spark: 'solar', sparkLabel: 'Output W',
    m: (S) => [['Irradiance', (S.solarW * 3.1).toFixed(0), 'W/m²'], ['MPPT eff.', '97.2', '%'], ['Today', S.solarWh.toFixed(0), 'Wh'], ['Panel temp', r1(34 + S.solarW / 40), '°C']],
    specs: [['Panels', '2 × 150 W flexible'], ['Controller', 'MPPT, 15 A'], ['Area', '1.6 m²'], ['Mount', 'Bonded, no drilling']],
  },
  charger: {
    role: 'Charging port', desc: 'Type-2 AC inlet with an on-board 3.3 kW charger. Charges at constant current to 80 %, then tapers in constant-voltage mode.',
    ring: (S) => [S.chargeKw / 3.3, S.chargeKw > 0 ? 'Charging' : 'Unplugged', `${r1(S.chargeKw)} kW`], spark: 'soc', sparkLabel: 'SoC %',
    m: (S) => [['State', S.chargeKw > 0 ? (S.soc < 80 ? 'CC' : 'CV') : 'Idle', ''], ['To 80 %', S.chargeKw > 0 ? Math.max(0, (80 - S.soc) / 100 * 5.12 / 3.04 * 60).toFixed(0) : '—', 'min'], ['Session', S.sessionKWh.toFixed(2), 'kWh'], ['Grid', S.chargeKw > 0 ? '230' : '—', 'V']],
    specs: [['Inlet', 'Type-2 (IEC 62196)'], ['On-board', '3.3 kW AC'], ['Profile', 'CC → CV at 80 %'], ['0–100 %', '≈ 2 h']],
  },
  dcdc: {
    role: 'DC-DC converter', desc: 'Steps 51 V pack power down to a stable 13.8 V rail for the medical bus, climate system, siren and electronics.',
    ring: (S) => [S.auxW / 1200, 'Load', `${S.auxW.toFixed(0)} W`], spark: 'aux', sparkLabel: 'Load W',
    m: (S) => [['Rail', '13.8', 'V'], ['Output', (S.auxW / 13.8).toFixed(1), 'A'], ['Efficiency', '94.1', '%'], ['Temp', r1(31 + S.auxW / 80), '°C']],
    specs: [['Input', '40–60 V'], ['Output', '13.8 V · 1.2 kW'], ['Isolation', 'Galvanic'], ['Backup', '12 V 40 Ah AGM']],
  },
  medical: {
    role: 'Medical power bus', desc: 'Dedicated, filtered 12 V / 230 V supply for medical equipment with battery backup, so devices never lose power mid-transfer.',
    ring: (S) => [S.medW / 450, 'Load', `${S.medW.toFixed(0)} W`], spark: 'med', sparkLabel: 'Load W',
    m: (S) => [['Outlets used', S.emergency ? '5 / 6' : '3 / 6', ''], ['Inverter', '230 V', 'AC'], ['Backup', S.emergency ? '38' : '45', 'min'], ['O2 cylinder', '182', 'bar']],
    specs: [['Outlets', '4 × 12 V · 2 × 230 V'], ['Inverter', '600 W pure sine'], ['Protection', 'Medical-grade isolation'], ['Devices', 'Monitor, suction, AED, O2']],
  },
  monitor: {
    role: 'Patient monitoring', desc: 'Multi-parameter monitor (ECG, SpO2, NIBP, temperature). Readings stream through the gateway so the hospital sees the patient before arrival.',
    ring: (S) => [S.spo2 / 100, 'SpO2', `${S.spo2}%`], spark: 'hr', sparkLabel: 'Heart rate',
    m: (S) => [['Heart rate', S.hr, 'bpm'], ['NIBP', `${S.bp[0]}/${S.bp[1]}`, 'mmHg'], ['Temp', r1(S.ptemp), '°C'], ['Stream', 'LIVE', '']],
    specs: [['Channels', 'ECG · SpO2 · NIBP · Temp'], ['Alarms', 'Local + hospital'], ['Display', '10" touch'], ['Power', '12 V medical bus']],
  },
  hvac: {
    role: 'Climate + disinfection', desc: 'HEPA-filtered air conditioning keeps the cabin at 22–24 °C. UV-C lamps sanitise the cabin between calls while it is empty.',
    ring: (S) => [0.82, 'Filter life', '82%'], spark: 'cabin', sparkLabel: 'Cabin °C',
    m: (S) => [['Cabin', r1(S.cabinT), '°C'], ['Humidity', '48', '%'], ['Air changes', '20', '/h'], ['UV-C', S.charge ? 'CYCLE' : 'READY', '']],
    specs: [['Filter', 'HEPA H13'], ['Cooling', '1.2 kW electric'], ['UV-C', '254 nm, 6 min cycle'], ['Interlock', 'Door + motion sensor']],
  },
  gateway: {
    role: 'Telematics gateway', desc: 'Collects data from every system over CAN and sends it to the hospital over 5G (falls back to 4G). Also links the telemedicine video call.',
    ring: (S) => [S.signal / 100, 'Signal', `${S.signal}%`], spark: 'lat', sparkLabel: 'Latency ms',
    m: (S) => [['Latency', S.latency, 'ms'], ['Uplink', r1(S.uplink), 'Mbps'], ['Network', S.signal > 60 ? '5G' : '4G', ''], ['Packets', S.packets, '/s']],
    specs: [['Radios', '5G NR · LTE · GNSS'], ['Bus', '2 × CAN, Ethernet'], ['Security', 'TLS 1.3, VPN'], ['Video', '720p telemedicine']],
  },
  ai: {
    role: 'AI hospital routing', desc: 'Ranks nearby hospitals by drive time, ER wait, free beds and the care the patient needs, then guides the driver along the fastest route.',
    ring: () => [0.94, 'Confidence', '94%'], spark: 'eta', sparkLabel: 'ETA min',
    m: (S) => [['Target', 'Apex ER', ''], ['ETA', r1(S.eta), 'min'], ['Re-routes', S.reroutes, ''], ['Traffic', S.traffic, 'veh']],
    specs: [['Inputs', 'Traffic, beds, ER wait'], ['Update', 'Every 10 s'], ['Model', 'Weighted shortest path'], ['Output', 'Driver display + voice']],
  },
  siren: {
    role: 'Warning system', desc: 'Siren and LED lightbar. The gateway can also pre-empt smart traffic signals ahead of the ambulance.',
    ring: (S) => [S.siren ? 1 : 0, 'Status', S.siren ? 'ON' : 'OFF'], spark: 'speed', sparkLabel: 'Speed km/h',
    m: (S) => [['Siren', S.siren ? (S.emergency ? 'YELP' : 'WAIL') : 'OFF', ''], ['Lightbar', S.siren ? 'CODE 3' : 'OFF', ''], ['Power', S.siren ? '120' : '0', 'W'], ['Yielding', S.siren ? Math.min(S.traffic, 9) : 0, 'veh']],
    specs: [['Siren', '100 W, 3 tones'], ['Lightbar', 'Red / blue LED'], ['Range', '≈ 300 m'], ['Signal priority', 'V2I ready']],
  },
  cloud: {
    role: 'Hospital link', desc: 'The receiving hospital gets live vitals, the patient record and the ETA, so the ER team and bed are ready when the ambulance arrives.',
    ring: () => [1, 'Synced', '100%'], spark: 'lat', sparkLabel: 'Latency ms',
    m: (S) => [['Hospital', 'Apex ER', ''], ['Bed', 'RESERVED', ''], ['Records', S.records, ''], ['Doctor', 'ONLINE', '']],
    specs: [['Data', 'Vitals, ECG, e-PCR'], ['Video', 'Telemedicine call'], ['Standard', 'HL7 FHIR'], ['Privacy', 'Encrypted end-to-end']],
  },
};

// ------------------------------------------------------------ page
export default function SystemsPage({ active }) {
  const live = useLive();
  const [scen, setScen] = useState('live');
  const [pmode, setPmode] = useState('stable');
  const [sel, setSel] = useState('battery');
  const [view, setView] = useState('arch');
  const [cmethod, setCmethod] = useState('ac');
  const [layers, setLayers] = useState({ hv: true, lv: true, data: true, up: true });
  const [tick, setTick] = useState(0);
  const acc = useRef({ chargeSoc: null, solarWh: 412, sessionKWh: 0, records: 128, reroutes: 1, eta: 6.4 });
  const hist = useRef({});
  const [log, setLog] = useState(() => [mkLog('System check passed · 14 / 14 subsystems online', 'ok')]);
  const prev = useRef({});

  useEffect(() => { store.set({ sysOpen: active }); }, [active]);
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setTick((k) => k + 1), 500);
    return () => clearInterval(i);
  }, [active]);
  useEffect(() => { if (scen === 'emergency') setPmode('critical'); else if (pmode === 'critical') setPmode('stable'); }, [scen]); // eslint-disable-line

  // ---------- derived system state
  const S = useMemo(() => {
    const t = tick * 0.5, A = acc.current;
    const charge = scen === 'charge', regen = scen === 'regen', emergency = scen === 'emergency';
    let soc = live.soc;
    if (charge) { if (A.chargeSoc == null) A.chargeSoc = live.soc; A.chargeSoc = Math.min(100, A.chargeSoc + 0.012); soc = A.chargeSoc; A.sessionKWh += 3.04 / 7200; }
    else A.chargeSoc = null;
    const power = charge ? 0 : regen ? -(2.4 + Math.sin(t * 0.9) * 0.6) : emergency ? Math.max(live.power, 5.2 + Math.sin(t * 1.3) * 0.8) : live.power;
    const speed = charge ? 0 : regen ? 34 + Math.sin(t * 0.4) * 4 : live.speed;
    const motorTemp = charge ? Math.max(30, live.motorTemp - 6) : emergency ? Math.max(live.motorTemp, 58) : live.motorTemp;
    const solarW = clamp(205 + Math.sin(t / 9) * 45 + Math.sin(t * 1.7) * 6, 0, 300);
    A.solarWh += solarW / 7200;
    const P = PATIENT[pmode];
    const hr = P.hr + Math.round(Math.sin(t * 1.7) * 2);
    const spo2 = P.spo2 - (tick % 7 === 0 ? 1 : 0);
    const medW = emergency ? 410 + Math.sin(t * 2) * 15 : 165 + Math.sin(t) * 6;
    const hvacW = charge ? 140 : 360 + Math.sin(t / 5) * 30;
    const siren = !charge;
    const auxW = medW + hvacW + (siren ? 120 : 0) + 45;
    const packV = 48 + (soc / 100) * 6 - clamp(power * 0.12, -1, 1.2);
    const current = (power * 1000 + auxW - solarW - (charge ? 3040 : 0)) / packV;
    const rpm = (speed / 3.6) / (2 * Math.PI * 0.28) * 60 * 6.2;
    const torque = rpm > 50 ? (power * 1000) / (rpm * 2 * Math.PI / 60) : power > 0.1 ? 40 : 0;
    const cells = Array.from({ length: 16 }, (_, i) => {
      const edge = Math.abs(i - 7.5) / 7.5;
      return {
        v: 3.2 + soc * 0.0016 + Math.sin(i * 2.3) * 0.004 - (power > 0 ? power * 0.002 : 0),
        t: 27 + Math.abs(power) * 1.1 + (1 - edge) * 3.2 + Math.sin(i * 1.7) * 0.6 + (charge ? 2 : 0),
      };
    });
    const vs = cells.map((c) => c.v), ts = cells.map((c) => c.t);
    const cellDelta = (Math.max(...vs) - Math.min(...vs)) * 1000;
    const balIdx = vs.indexOf(Math.max(...vs));
    const latency = Math.round(18 + Math.abs(Math.sin(t * 0.7)) * 9 + (tick % 11 === 0 ? 14 : 0));
    const signal = Math.round(clamp(84 - (live.zoneKey === 'ghat' || live.zoneKey === 'hairpin' ? 26 : 0) + Math.sin(t * 0.3) * 6, 20, 100));
    if (tick % 20 === 0) A.eta = Math.max(1.2, A.eta - 0.1);
    if (tick % 4 === 0) A.records += 1;
    return {
      t, scen, charge, regen, emergency, soc, power, speed, motorTemp, solarW, solarWh: A.solarWh, hr, spo2, bp: P.bp, ptemp: P.temp, pcolor: P.color,
      medW, hvacW, auxW, siren, packV, current, rpm, torque, cells, cellDelta, cellMaxT: Math.max(...ts), balancing: cellDelta > 8 ? `Cell ${balIdx + 1}` : 'Idle',
      soh: 98, chargeKw: charge ? (soc < 80 ? 3.3 : 3.3 * clamp((100 - soc) / 20, 0.15, 1)) : 0, sessionKWh: A.sessionKWh,
      range: (soc / 100) * 5120 / Math.max(60, live.whkm || 95), latency, signal, uplink: 12 + Math.sin(t) * 3 + (emergency ? 6 : 0), packets: 40 + (tick % 9),
      cabinT: 23.2 + Math.sin(t / 7) * 0.4, eta: A.eta, reroutes: A.reroutes, traffic: live.traffic || 0, records: A.records,
    };
  }, [tick, live, scen, pmode]); // eslint-disable-line

  // ---------- history for sparklines
  useEffect(() => {
    const H = hist.current;
    const push = (k, v) => { (H[k] = H[k] || []).push(v); if (H[k].length > 90) H[k].shift(); };
    push('soc', S.soc); push('power', S.power); push('temp', S.motorTemp); push('cellT', S.cellMaxT); push('solar', S.solarW);
    push('aux', S.auxW); push('med', S.medW); push('hr', S.hr); push('cabin', S.cabinT); push('lat', S.latency); push('eta', S.eta); push('speed', S.speed);
  }, [S]);

  // ---------- diagnostics feed
  useEffect(() => {
    const p = prev.current, out = [];
    const st = S.power < -0.1 ? 'REGEN' : S.power > 6 ? 'PEAK' : S.power > 0.1 ? 'DRIVE' : 'IDLE';
    if (p.st && p.st !== st) {
      if (st === 'REGEN') out.push(['Regen braking · motor charging pack', 'ok']);
      if (st === 'PEAK') out.push(['Motor at peak power · climbing', 'warn']);
    }
    if (p.zone && live.zone && p.zone !== live.zone && scen === 'live') out.push([`Route entered ${live.zone} · traction map updated`, 'info']);
    if (p.ov === false && live.overtaking && scen === 'live') out.push(['Overtaking · oncoming lane clear', 'info']);
    if (p.scen && p.scen !== scen) out.push([{ live: 'Live telemetry resumed', regen: 'Regen mode · energy recovery active', charge: 'Charger connected · 3.3 kW AC · UV-C cycle started', emergency: 'EMERGENCY · critical patient · hospital alerted' }[scen], scen === 'emergency' ? 'crit' : 'ok']);
    const newTick = p.tick !== tick;
    if (newTick && tick > 0 && tick % 12 === 0) out.push([`Vitals synced to Apex ER · HR ${S.hr} · SpO2 ${S.spo2}%`, S.spo2 < 90 ? 'crit' : 'info']);
    if (newTick && tick > 0 && tick % 33 === 0) out.push([`BMS balancing ${S.balancing === 'Idle' ? 'idle · cells within 8 mV' : S.balancing}`, 'ok']);
    if (newTick && tick > 0 && tick % 47 === 0) out.push([`AI routing re-checked 9 hospitals · Apex ER still best`, 'info']);
    if (S.spo2 < 90 && !p.lowO2) out.push(['ALARM · SpO2 below 90 % · O2 flow raised', 'crit']);
    Object.assign(p, { tick, st, zone: live.zone, ov: live.overtaking, scen, lowO2: S.spo2 < 90 });
    if (out.length) setLog((l) => [...out.map(([m, k]) => mkLog(m, k)), ...l].slice(0, 40));
  }, [S]); // eslint-disable-line

  const health = HEALTH.map(([name, ids, focus]) => {
    let v = 100, note = 'Nominal';
    if (name === 'Powertrain') { v = 100 - clamp((S.motorTemp - 60) * 0.8, 0, 30); note = S.power < -0.1 ? 'Regenerating' : `${r1(Math.abs(S.power))} kW`; }
    if (name === 'Battery') { v = 98 - (S.cellDelta > 10 ? 3 : 0); note = `${r1(S.soc)}% · ${S.charge ? 'charging' : 'BMS OK'}`; }
    if (name === 'Medical') { v = S.spo2 < 90 ? 74 : pmode === 'tachy' ? 88 : 100; note = S.spo2 < 90 ? 'Patient alarm' : 'Monitoring'; }
    if (name === 'Connectivity') { v = clamp(S.signal + 12, 0, 100); note = `${S.signal > 60 ? '5G' : '4G'} · ${S.latency} ms`; }
    if (name === 'Safety') { v = 100; note = S.siren ? 'Siren active' : 'Standby'; }
    if (name === 'Climate') { v = 96; note = `${r1(S.cabinT)} °C`; }
    return { name, ids, focus, v: Math.round(v), note };
  });
  const overall = Math.round(health.reduce((a, h) => a + h.v, 0) / health.length);
  const selG = health.find((h) => h.ids.includes(sel));
  const I = INFO[sel];
  const [ringV, ringCap, ringTxt] = I.ring(S);
  const links = EDGES.filter((e) => e.a === sel || e.b === sel);

  const title = (
    <div className="sx-title">
      <div className="label">{view === 'arch' ? 'Vehicle systems · live architecture' : 'Vehicle systems · energy in'}</div>
      <h2>{view === 'arch' ? '14 subsystems, one smart ambulance' : 'How MEDIX-4 charges'}</h2>
      <div className="sx-views">
        <button className={view === 'arch' ? 'on' : ''} onClick={() => setView('arch')}>Architecture</button>
        <button className={view === 'charge' ? 'on' : ''} onClick={() => setView('charge')}>⚡ How charging works</button>
      </div>
    </div>
  );
  if (view === 'charge') {
    return (
      <div className="sx sx-cv">
        <div className="sx-head">{title}</div>
        <ChargingView active={active} method={cmethod} setMethod={setCmethod} />
      </div>
    );
  }

  return (
    <div className="sx">
      <div className="sx-head">
        {title}
        <div className="sx-score">
          <Ring v={overall / 100} size={46} color={overall > 90 ? '#39ff88' : overall > 80 ? '#ffb547' : '#ff3b4a'} />
          <div><b>{overall}<small>%</small></b><span className="label">System health</span></div>
        </div>
        <div className="sx-health">
          {health.map((h) => (
            <button key={h.name} className={'sx-tile' + (selG && selG.name === h.name ? ' on' : '')} onClick={() => setSel(h.focus)}>
              <i style={{ '--hc': h.v > 90 ? '#39ff88' : h.v > 80 ? '#ffb547' : '#ff3b4a', '--hv': h.v + '%' }} />
              <span><b>{h.name}</b><small>{h.v}% · {h.note}</small></span>
            </button>
          ))}
        </div>
      </div>

      <div className="card sx-arch">
        <h3>
          <span>System architecture · top view</span>
          <span className="sx-scen">
            {Object.entries(SCEN).map(([k, v]) => <button key={k} className={scen === k ? 'on' : ''} onClick={() => setScen(k)} title={v.hint}>{v.label}</button>)}
          </span>
        </h3>
        <Arch S={S} sel={sel} setSel={setSel} layers={layers} active={active} />
        <div className="sx-legend">
          {LAYERS.map(([k, l, c]) => (
            <button key={k} className={layers[k] ? 'on' : ''} style={{ '--lc': c }} onClick={() => setLayers((x) => ({ ...x, [k]: !x[k] }))}><i />{l}</button>
          ))}
          <span className="sx-hint">{SCEN[scen].hint} · tap any block<em className="sx-swipe"> · swipe the diagram</em></span>
        </div>
      </div>

      <div className="sx-side">
      <div className="card sx-detail">
        <div className="sx-dhead">
          <span className="sx-dicon" style={{ color: groupColor(NODES[sel].g) }}><svg viewBox="-12 -12 24 24"><Icon k={NODES[sel].icon} /></svg></span>
          <div><div className="label">{I.role}</div><h4>{NODES[sel].label}</h4></div>
          <span className={'pill ' + (ringTxt === 'OFF' ? 'warn' : 'ok')}>{sel === 'monitor' && S.spo2 < 90 ? 'ALARM' : 'ONLINE'}</span>
        </div>
        <div className="sx-drow">
          <div className="sx-ring">
            <Ring v={ringV} size={92} stroke={7} color={groupColor(NODES[sel].g)} />
            <div><b>{ringTxt}</b><span>{ringCap}</span></div>
          </div>
          <div className="sx-metrics">
            {I.m(S).map(([l, v, u]) => <div key={l}><span className="label">{l}</span><b>{v}<small>{u}</small></b></div>)}
          </div>
        </div>
        <div className="sx-spark">
          <span className="label">{I.sparkLabel} · last 45 s</span>
          <Spark data={hist.current[I.spark] || []} color={groupColor(NODES[sel].g)} />
        </div>
        <p className="sx-desc">{I.desc}</p>
        <div className="list">
          {I.specs.map(([a, b]) => <div className="list-row" key={a}><span>{a}</span><span>{b}</span></div>)}
        </div>
        {CHG_LINK[sel] && (
          <button className="sx-howto" onClick={() => { setCmethod(CHG_LINK[sel]); setView('charge'); }}>
            <span>⚡</span><b>See how {({ ac: 'plug-in charging', solar: 'solar charging', regen: 'regen braking', aux: '12 V charging' })[CHG_LINK[sel]]} works</b><i>→</i>
          </button>
        )}
        <div className="sx-links">
          <span className="label">Connected to</span>
          <div>
            {links.map((e, i) => {
              const o = e.a === sel ? e.b : e.a;
              return <button key={i} onClick={() => setSel(o)} style={{ '--lc': COLOR[e.t] }}><i />{NODES[o].label}</button>;
            })}
          </div>
        </div>
      </div>

      <div className="card sx-log">
        <h3><span>Diagnostics feed</span><span className="pill ok">● LIVE</span></h3>
        <ul>
          {log.map((e) => <li key={e.id} className={e.k}><time>{e.time}</time><span>{e.msg}</span></li>)}
        </ul>
      </div>
      </div>

      <div className="card sx-vitals">
        <h3>
          <span>Patient monitor · Lead II</span>
          <span className="sx-scen small">
            {Object.entries(PATIENT).map(([k, v]) => <button key={k} className={pmode === k ? 'on' : ''} onClick={() => setPmode(k)}>{v.label}</button>)}
          </span>
        </h3>
        <div className="sx-vbody">
          <ECG hr={S.hr} color={S.pcolor} active={active} critical={pmode === 'critical'} />
          <div className="sx-vnums">
            <div><span className="label">HR</span><b style={{ color: S.pcolor }}>{S.hr}<small>bpm</small></b></div>
            <div><span className="label">SpO2</span><b style={{ color: S.spo2 < 90 ? '#ff3b4a' : '#4dc3ff' }}>{S.spo2}<small>%</small></b></div>
            <div><span className="label">NIBP</span><b>{S.bp[0]}/{S.bp[1]}</b></div>
            <div><span className="label">Temp</span><b>{r1(S.ptemp)}<small>°C</small></b></div>
          </div>
        </div>
      </div>

      <div className="card sx-cells">
        <h3><span>Pack cells · 16S</span><span className="pill ok">Δ {S.cellDelta.toFixed(0)} mV</span></h3>
        <div className="sx-cgrid">
          {S.cells.map((c, i) => (
            <button key={i} className="sx-cell" style={{ '--ct': tempColor(c.t), '--cf': `${clamp(S.soc, 4, 100)}%` }} onClick={() => setSel('bms')} title={`Cell ${i + 1}: ${c.v.toFixed(3)} V · ${r1(c.t)} °C`}>
              <i />
              <b>{c.v.toFixed(2)}</b>
              <small>{c.t.toFixed(0)}°</small>
            </button>
          ))}
        </div>
        <div className="sx-cscale"><span>25 °C</span><i /><span>45 °C</span></div>
      </div>

    </div>
  );
}

let logId = 0;
function mkLog(msg, k) {
  const d = new Date();
  return { id: ++logId, msg, k, time: d.toLocaleTimeString([], { hour12: false }) };
}
function groupColor(g) {
  return { power: '#39ff88', drive: '#39ff88', medical: '#ff5d6c', connect: '#4dc3ff', safety: '#ffb547', climate: '#b18cff' }[g] || '#39ff88';
}
function tempColor(t) {
  const k = clamp((t - 25) / 20, 0, 1);
  const a = [57, 255, 136], b = [255, 181, 71], c = [255, 59, 74];
  const [p, q, f] = k < 0.5 ? [a, b, k * 2] : [b, c, (k - 0.5) * 2];
  return `rgb(${p.map((v, i) => Math.round(v + (q[i] - v) * f)).join(',')})`;
}

// ------------------------------------------------------------ architecture diagram
function Arch({ S, sel, setSel, layers, active }) {
  const [hover, setHover] = useState(null);
  const focus = hover || sel;
  return (
    <div className="sx-svgwrap">
      <svg className="sx-svg" viewBox="84 26 886 462" preserveAspectRatio="xMidYMid meet" style={{ animationPlayState: active ? 'running' : 'paused' }}>
        <defs>
          <linearGradient id="sxBody" x1="0" x2="1">
            <stop offset="0" stopColor="#0c1411" /><stop offset="1" stopColor="#0d1013" />
          </linearGradient>
          <pattern id="sxGrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="rgba(57,255,136,0.05)" /></pattern>
          <filter id="sxGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
        </defs>
        {/* vehicle body: rear on the left, cab on the right */}
        <rect x="60" y="20" width="920" height="470" fill="url(#sxGrid)" />
        {[[150, 88], [150, 462], [835, 88], [835, 462]].map(([x, y], i) => <rect key={i} x={x} y={y} width="80" height="20" rx="6" fill="#16191c" stroke="rgba(255,255,255,0.08)" />)}
        <path d="M110 100 H800 C850 100 900 110 930 140 C952 162 958 200 958 280 C958 360 952 398 930 420 C900 450 850 460 800 460 H110 Q96 460 96 446 V114 Q96 100 110 100 Z" fill="url(#sxBody)" stroke="rgba(57,255,136,0.35)" strokeWidth="1.5" />
        <path d="M800 100 V460" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 6" />
        <path d="M930 140 C952 162 958 200 958 280 C958 360 952 398 930 420" stroke="rgba(120,200,255,0.4)" strokeWidth="5" fill="none" />
        <text x="110" y="478" className="sx-zone">REAR · PATIENT CABIN</text>
        <text x="812" y="478" className="sx-zone">DRIVER CAB · RHD</text>
        <text x="110" y="92" className="sx-zone">ROOF · SOLAR + LIGHTBAR</text>
        {/* edges */}
        {EDGES.map((e, i) => {
          if (!layers[e.t]) return null;
          const lit = e.a === focus || e.b === focus;
          const c = COLOR[e.t];
          const f = e.f ? e.f(S) : 0.6;
          const mag = clamp(Math.abs(f), 0, 1);
          const on = e.t === 'data' || e.t === 'up' || mag > 0.02;
          const dur = (2.6 - mag * 1.9).toFixed(2);
          return (
            <g key={i} className={'sx-edge ' + e.t + (lit ? ' lit' : '')}>
              <path d={e.d} stroke={c} strokeOpacity={lit ? 0.35 : 0.14} strokeWidth={e.t === 'hv' ? 6 : 3} fill="none" strokeLinejoin="round" />
              {on && (e.t === 'hv' || e.t === 'lv') && (
                <path d={e.d} stroke={c} strokeWidth={e.t === 'hv' ? 2.6 : 1.8} fill="none" strokeDasharray="6 10" strokeLinecap="round" strokeLinejoin="round"
                  className={f < 0 ? 'rev' : ''} style={{ animationDuration: dur + 's', opacity: lit ? 1 : 0.75 }} />
              )}
              {(e.t === 'data' || e.t === 'up') && [0, 1, 2].map((k) => (
                <circle key={k} r={e.t === 'up' ? 3.2 : 2.6} fill={c} opacity={lit ? 1 : 0.8}>
                  <animateMotion dur={e.t === 'up' ? '1.8s' : '2.4s'} begin={`${k * (e.t === 'up' ? 0.6 : 0.8)}s`} repeatCount="indefinite" path={e.d} />
                </circle>
              ))}
            </g>
          );
        })}
        {/* nodes */}
        {Object.entries(NODES).map(([id, n]) => (
          <Node key={id} id={id} n={n} S={S} on={sel === id} hot={focus === id} setSel={setSel} setHover={setHover} />
        ))}
      </svg>
    </div>
  );
}

function nodeValue(id, S) {
  switch (id) {
    case 'monitor': return `${S.hr} bpm`;
    case 'medical': return `${S.medW.toFixed(0)} W`;
    case 'solar': return `+${S.solarW.toFixed(0)} W`;
    case 'hvac': return `${r1(S.cabinT)} °C`;
    case 'motor': return `${r1(S.power)} kW`;
    case 'mcu': return S.power < -0.1 ? 'REGEN' : S.power > 0.1 ? 'FOC' : 'IDLE';
    case 'gateway': return `${S.latency} ms`;
    case 'charger': return S.chargeKw > 0 ? `${r1(S.chargeKw)} kW` : 'Idle';
    case 'bms': return `Δ ${S.cellDelta.toFixed(0)} mV`;
    case 'dcdc': return `${S.auxW.toFixed(0)} W`;
    case 'ai': return `ETA ${r1(S.eta)}m`;
    case 'siren': return S.siren ? 'ON' : 'OFF';
    case 'cloud': return 'Apex ER';
    default: return '';
  }
}

function Node({ id, n, S, on, hot, setSel, setHover }) {
  const c = groupColor(n.g);
  const ev = { onClick: () => setSel(id), onMouseEnter: () => setHover(id), onMouseLeave: () => setHover(null), style: { cursor: 'pointer' }, role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') setSel(id); } };
  const alarm = (id === 'monitor' && S.spo2 < 90) || (id === 'motor' && S.motorTemp > 85);
  const col = alarm ? '#ff3b4a' : c;
  if (n.big) {
    const w = 150, h = 70, x = n.x - w / 2, y = n.y - h / 2;
    const fillW = (w - 16) * (S.soc / 100);
    return (
      <g {...ev} className={'sx-node' + (on ? ' on' : '')} aria-label={n.label}>
        {(on || hot) && <rect x={x - 4} y={y - 4} width={w + 8} height={h + 8} rx="14" fill="none" stroke={col} strokeOpacity="0.5" filter="url(#sxGlow)" />}
        <rect x={x} y={y} width={w} height={h} rx="11" fill="#0a0f0c" stroke={col} strokeWidth={on ? 2 : 1.2} />
        <text x={x + 12} y={y + 20} className="sx-ntitle">Battery pack</text>
        <text x={x + w - 12} y={y + 20} className="sx-nval big" textAnchor="end" fill={col}>{r1(S.soc)}%</text>
        <rect x={x + 8} y={y + 32} width={w - 16} height="16" rx="4" fill="rgba(255,255,255,0.05)" />
        <rect x={x + 8} y={y + 32} width={fillW} height="16" rx="4" fill={col} opacity="0.75" className={S.chargeKw > 0 || S.power < -0.1 ? 'sx-charging' : ''} />
        {Array.from({ length: 15 }, (_, i) => <line key={i} x1={x + 8 + (w - 16) * (i + 1) / 16} x2={x + 8 + (w - 16) * (i + 1) / 16} y1={y + 32} y2={y + 48} stroke="#0a0f0c" strokeWidth="1.2" />)}
        <text x={x + 12} y={y + 62} className="sx-nsub">51.2 V · 16S LFP</text>
        <text x={x + w - 12} y={y + 62} className="sx-nsub" textAnchor="end">{S.current > 0 ? '▼' : '▲'} {Math.abs(S.current).toFixed(0)} A</text>
      </g>
    );
  }
  const lx = n.lab === 'left' ? n.x - 32 : n.x, ly = n.lab === 'left' ? n.y - 3 : n.lab === 'above' ? n.y - 44 : n.y + 38, anchor = n.lab === 'left' ? 'end' : 'middle';
  return (
    <g {...ev} className={'sx-node' + (on ? ' on' : '')} aria-label={n.label}>
      {(on || hot) && <circle cx={n.x} cy={n.y} r="29" fill={col} opacity="0.25" filter="url(#sxGlow)" />}
      {alarm && <circle cx={n.x} cy={n.y} r="22" fill="none" stroke={col} className="sx-ping" />}
      <circle cx={n.x} cy={n.y} r="22" fill="#0b0e11" stroke={col} strokeWidth={on ? 2.2 : 1.3} />
      <g transform={`translate(${n.x},${n.y})`} color={col}><Icon k={n.icon} /></g>
      <text x={lx} y={ly} textAnchor={anchor} className="sx-ntitle">{n.label}</text>
      <text x={lx} y={ly + 14} textAnchor={anchor} className="sx-nval" fill={col}>{nodeValue(id, S)}</text>
    </g>
  );
}

function Icon({ k }) {
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (k) {
    case 'heart': return <path {...p} d="M0 7 C-9 1 -8 -7 -3 -6.5 C-1.4 -6.2 0 -4.6 0 -4 C0 -4.6 1.4 -6.2 3 -6.5 C8 -7 9 1 0 7 Z M-6 0 H-3 L-1.5 -3 L1 3 L2.5 0 H6" />;
    case 'cross': return <path {...p} d="M-2.5 -8 H2.5 V-2.5 H8 V2.5 H2.5 V8 H-2.5 V2.5 H-8 V-2.5 H-2.5 Z" />;
    case 'sun': return <g {...p}><circle r="3.6" />{Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return <line key={i} x1={Math.cos(a) * 6} y1={Math.sin(a) * 6} x2={Math.cos(a) * 8.5} y2={Math.sin(a) * 8.5} />; })}</g>;
    case 'fan': return <g {...p}><circle r="8.5" /><circle r="1.6" /><path d="M0 -1.6 C-1 -6 3 -7.5 3.5 -4 M1.4 0.8 C5.5 2 5 6.5 1.8 5.2 M-1.4 0.8 C-5 4 -8 1 -5.2 -1.2" /></g>;
    case 'motor': return <g {...p}><circle r="7.5" /><circle r="2.5" />{Array.from({ length: 6 }, (_, i) => { const a = i * Math.PI / 3; return <line key={i} x1={Math.cos(a) * 2.5} y1={Math.sin(a) * 2.5} x2={Math.cos(a) * 7.5} y2={Math.sin(a) * 7.5} />; })}</g>;
    case 'chip': return <g {...p}><rect x="-5.5" y="-5.5" width="11" height="11" rx="1.5" /><path d="M-2.5 -8 V-5.5 M2.5 -8 V-5.5 M-2.5 8 V5.5 M2.5 8 V5.5 M-8 -2.5 H-5.5 M-8 2.5 H-5.5 M8 -2.5 H5.5 M8 2.5 H5.5 M-2 1 L0 -2 L2 1" /></g>;
    case 'antenna': return <g {...p}><path d="M0 8 V0 M-3.5 -3.5 A5 5 0 0 1 3.5 -3.5 M-6.5 -6.5 A9.2 9.2 0 0 1 6.5 -6.5" /><circle r="1.4" cy="0" /></g>;
    case 'plug': return <path {...p} d="M-3 -8 V-4 M3 -8 V-4 M-6 -4 H6 V-1 A6 6 0 0 1 -6 -1 Z M0 5 V8.5" />;
    case 'shield': return <path {...p} d="M0 -8 L7 -5 V0 C7 4.5 3.5 7.2 0 8.5 C-3.5 7.2 -7 4.5 -7 0 V-5 Z M-3 0 L-0.8 2.2 L3.2 -2" />;
    case 'bolt': return <path {...p} d="M1.5 -8.5 L-5 1 H0 L-1.5 8.5 L5 -1 H0 Z" />;
    case 'nav': return <path {...p} d="M0 -8 L6.5 7 L0 3.4 L-6.5 7 Z" />;
    case 'siren': return <path {...p} d="M-6 5 V0 A6 6 0 0 1 6 0 V5 Z M-8 7.5 H8 M0 -9.5 V-7.5 M-7.5 -6.5 L-6 -5 M7.5 -6.5 L6 -5" />;
    case 'cloud': return <path {...p} d="M-6 5.5 H5.5 A4 4 0 0 0 5.5 -2.5 A5.5 5.5 0 0 0 -5 -3.2 A4.3 4.3 0 0 0 -6 5.5 Z" />;
    case 'battery': return <g {...p}><rect x="-8" y="-5" width="14.5" height="10" rx="2" /><path d="M8.5 -2 V2 M-5 -2 V2 M-2 -2 V2 M1 -2 V2" /></g>;
    default: return null;
  }
}

function Ring({ v, size = 60, stroke = 5, color = '#39ff88' }) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="sx-ringsvg">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${C * clamp(v, 0, 1)} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 0.5s, stroke 0.3s', filter: `drop-shadow(0 0 4px ${color}66)` }} />
    </svg>
  );
}

function Spark({ data, color }) {
  const W = 300, H = 54;
  if (data.length < 2) return <svg className="sx-sparksvg" viewBox={`0 0 ${W} ${H}`} />;
  let lo = Math.min(...data), hi = Math.max(...data);
  if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const pts = data.map((v, i) => [(i / 89) * W, H - ((v - lo) / (hi - lo)) * H]);
  const off = W - pts[pts.length - 1][0];
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${(p[0] + off).toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg className="sx-sparksvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <defs><linearGradient id="sxSpark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity="0.28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${d} L${W} ${H} L${(pts[0][0] + off).toFixed(1)} ${H} Z`} fill="url(#sxSpark)" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
      <circle cx={W - 2} cy={last[1]} r="3" fill={color} />
    </svg>
  );
}

// ------------------------------------------------------------ ECG strip
function ECG({ hr, color, active, critical }) {
  const ref = useRef(null);
  const st = useRef({ hr, color, critical });
  st.current = { hr, color, critical };
  useEffect(() => {
    const c = ref.current;
    const x = c.getContext('2d');
    let raf, px = 0, prev = null, t = 0, last = performance.now();
    const fit = () => {
      const r = c.getBoundingClientRect();
      const d = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.max(10, r.width * d); c.height = Math.max(10, r.height * d);
      x.fillStyle = '#080a0c'; x.fillRect(0, 0, c.width, c.height);
      px = 0; prev = null;
    };
    const wave = (p, crit) => {
      if (crit) p = (p + Math.sin(t * 7) * 0.02) % 1;
      if (p < 0.1) return Math.sin(p / 0.1 * Math.PI) * 0.12;
      if (p > 0.16 && p < 0.18) return -0.15;
      if (p >= 0.18 && p < 0.205) return 1;
      if (p >= 0.205 && p < 0.235) return -0.32;
      if (p > 0.36 && p < 0.52) return Math.sin((p - 0.36) / 0.16 * Math.PI) * (crit ? 0.05 : 0.24);
      return 0;
    };
    const ro = new ResizeObserver(fit); ro.observe(c); fit();
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      t += dt;
      const { hr: h, color: col, critical: crit } = st.current;
      const speed = c.width / 5;
      const n = Math.max(1, Math.round(speed * dt));
      for (let i = 0; i < n; i++) {
        const tt = t - dt + (i / n) * dt;
        const y = c.height * 0.55 - wave(((tt * h) / 60) % 1, crit) * c.height * 0.4 + (Math.random() - 0.5) * 1.2;
        x.fillStyle = '#080a0c'; x.fillRect(px, 0, 18, c.height);
        x.strokeStyle = 'rgba(57,255,136,0.07)'; x.lineWidth = 1;
        if (px % Math.round(c.height / 6) === 0) { x.beginPath(); x.moveTo(px + 0.5, 0); x.lineTo(px + 0.5, c.height); x.stroke(); }
        x.strokeStyle = col; x.lineWidth = Math.max(1.5, c.height / 110); x.shadowColor = col; x.shadowBlur = 8;
        if (prev !== null && px > 0) { x.beginPath(); x.moveTo(px - 1, prev); x.lineTo(px, y); x.stroke(); }
        x.shadowBlur = 0;
        prev = y; px += 1;
        if (px >= c.width) { px = 0; prev = null; }
      }
    };
    if (active) raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [active]);
  return <canvas className="sx-ecg" ref={ref} />;
}
