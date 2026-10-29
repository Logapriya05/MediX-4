import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createViewer } from '../components/viewer.js';
import { PinLayer } from '../components/pins.js';
import { highlighter } from '../models/kit.js';

// Smart mini-ambulance cabin: 1 driver, 1 paramedic, 1 patient on a smart stretcher.
// X = forward (cab at +X), Y = up, Z = width (right-hand drive: driver at +Z).

const FEATURES = {
  stretcher: { n: 1, label: 'Smart stretcher', sub: 'Auto floor-lock · weight sensor', group: 'patient' },
  monitor: { n: 2, label: 'Multi-parameter monitor', sub: 'ECG · SpO2 · NIBP, streamed live', group: 'patient' },
  o2: { n: 3, label: 'IoT oxygen cylinder', sub: 'Digital pressure sensor', group: 'patient' },
  iv: { n: 4, label: 'IV rail', sub: 'Ceiling-mounted drip hook', group: 'patient' },
  seat: { n: 5, label: 'Paramedic seat', sub: 'Swivel, 3-point belt', group: 'paramedic' },
  tablet: { n: 6, label: 'Paramedic tablet', sub: 'e-Patient record · AI hospital routing', group: 'paramedic' },
  aed: { n: 7, label: 'AED defibrillator', sub: 'Automatic rhythm analysis', group: 'paramedic' },
  rfid: { n: 8, label: 'Smart medicine cabinet', sub: 'RFID stock tracking', group: 'smart' },
  tele: { n: 9, label: 'Telemedicine screen', sub: 'Live video with ER doctor', group: 'smart' },
  camera: { n: 10, label: '360° cabin camera', sub: 'Streams patient view to hospital', group: 'smart' },
  uvc: { n: 11, label: 'UV-C disinfection', sub: 'Sanitises cabin between calls', group: 'smart' },
  hvac: { n: 12, label: 'HEPA climate control', sub: 'Filtered air, 22–24 °C', group: 'smart' },
  driver: { n: 13, label: 'Driver seat (RHD)', sub: 'Single driver, no passenger seat', group: 'driver' },
  dash: { n: 14, label: 'Smart driver display', sub: 'Navigation + patient status', group: 'driver' },
  intercom: { n: 15, label: 'Partition window + intercom', sub: 'Driver ↔ paramedic', group: 'driver' },
};

const FOCUS = {
  all: {
    title: 'Smart Mini Ambulance', tag: '1 driver · 1 paramedic · 1 patient',
    cam: [[-0.3, 1.0, 0], [-3.1, 3.9, 3.9]],
    pins: ['stretcher', 'seat', 'driver', 'monitor', 'tele', 'uvc'],
    specs: [['Driver', '1', ''], ['Paramedic', '1', ''], ['Patient', '1', 'stretcher'], ['Cabin', '2.2', 'm long']],
    rows: [['Layout', 'Stretcher left, paramedic right'], ['Cab', 'Right-hand drive, single seat'], ['Power', '12 V aux + solar roof']],
  },
  patient: {
    title: 'Patient Area', tag: 'Smart stretcher and monitoring',
    cam: [[-0.8, 1.0, -0.3], [-2.5, 3.4, 2.6]],
    pins: ['stretcher', 'monitor', 'o2', 'iv'],
    specs: [['Stretcher', '1950', 'mm'], ['Load sensor', '±0.5', 'kg'], ['Oxygen', '10', 'L'], ['Monitor', '4', 'params']],
    rows: [['Floor lock', 'Electromagnetic, auto-engage'], ['Backrest', 'Motorised, 0–75°'], ['Vitals', 'Streamed to hospital']],
  },
  paramedic: {
    title: 'Paramedic Station', tag: 'One attendant, full patient reach',
    cam: [[-0.35, 1.1, 0.2], [0.5, 3.5, 2.9]],
    pins: ['seat', 'tablet', 'aed', 'rfid'],
    specs: [['Seat', '1', 'swivel'], ['Belt', '3', '-point'], ['Reach', 'Head to knee', ''], ['Tablet', '10', 'in']],
    rows: [['Position', 'Side-facing, beside patient'], ['AED', 'Within arm reach'], ['Records', 'Auto-sync to hospital']],
  },
  smart: {
    title: 'Smart Systems', tag: 'Connected care on the move',
    cam: [[-0.6, 1.4, 0], [-2.9, 3.4, 3.3]],
    pins: ['tele', 'camera', 'uvc', 'hvac', 'rfid', 'o2'],
    specs: [['Uplink', '4G/5G', ''], ['Camera', '360', '°'], ['UV-C', '254', 'nm'], ['Filter', 'HEPA', 'H13']],
    rows: [['Telemedicine', 'Doctor sees patient live'], ['Inventory', 'RFID alerts low stock'], ['Hygiene', 'UV-C cycle after each call']],
  },
  driver: {
    title: 'Driver Cab', tag: 'Right-hand drive, single seat',
    cam: [[1.1, 1.25, 0.1], [-0.2, 3.5, 2.6]],
    pins: ['driver', 'dash', 'intercom'],
    specs: [['Seats', '1', 'driver'], ['Display', '10', 'in'], ['Siren', 'Code 3', ''], ['Intercom', 'Yes', '']],
    rows: [['Display', 'Route + patient vitals'], ['Partition', 'Window with intercom'], ['Left side', 'Equipment console']],
  },
};

export default function InteriorPage({ active }) {
  const host = useRef(null);
  const V = useRef({});
  const [focus, setFocus] = useState('all');
  const [sel, setSel] = useState(null);
  const [people, setPeople] = useState(true);
  const [uv, setUv] = useState(false);

  useEffect(() => {
    const v = createViewer(host.current, { target: FOCUS.all.cam[0], pos: FOCUS.all.cam[1], scale: 0.55 });
    v.controls.autoRotate = false;
    v.controls.minDistance = 0.6; v.controls.maxDistance = 9;
    v.controls.zoomToCursor = true;
    const st = V.current; st.v = v;
    const cabin = buildCabin();
    v.scene.add(cabin.group);
    st.cabin = cabin;
    const pins = new PinLayer(host.current, v.camera, { onSelect: (id) => st.select(id) });
    st.pins = pins;
    st.setPins = (ids) => pins.set(ids.map((id) => ({ id, num: FEATURES[id].n, label: FEATURES[id].label, sub: FEATURES[id].sub, anchor: () => cabin.anchor(id) })), [cabin.group]);
    st.setPins(FOCUS.all.pins);
    st.select = (id) => {
      st.sel = id; setSel(id); pins.select(id);
      if (!id) return;
      const a = cabin.anchor(id);
      const dir = v.camera.position.clone().sub(v.controls.target).normalize();
      v.focus([a.x, a.y, a.z], [a.x + dir.x * 1.6, a.y + Math.max(0.25, dir.y * 1.6), a.z + dir.z * 1.6], 1);
    };
    v.setFrame((dt, t) => { cabin.update(t, dt, st.sel || st.focusGroup); pins.update(); });
    return () => { pins.dispose(); v.dispose(); };
  }, []);
  useEffect(() => { V.current.v && V.current.v.setActive(active); }, [active]);
  useEffect(() => { V.current.cabin && V.current.cabin.setPeople(people); }, [people]);
  useEffect(() => { V.current.cabin && V.current.cabin.setUV(uv); }, [uv]);

  const choose = (k) => {
    setFocus(k); setSel(null);
    const st = V.current;
    st.focusGroup = k === 'all' ? null : 'grp:' + k;
    st.sel = null; st.pins.select(null);
    st.setPins(FOCUS[k].pins);
    st.v.focus(...FOCUS[k].cam);
  };
  const F = FOCUS[focus];
  return (
    <div className="split">
      <div className="viewer" ref={host}>
        <div className="viewer-title">
          <div className="label">Interior · {F.tag}</div>
          <h2>{F.title}</h2>
        </div>
        <div className="vtools">
          <div className="seg mini">
            <button className={people ? 'on' : ''} onClick={() => setPeople(!people)} aria-pressed={people}>Occupants</button>
            <button className={uv ? 'on' : ''} onClick={() => setUv(!uv)} aria-pressed={uv}>UV-C cycle</button>
            <button onClick={() => choose(focus)}>Reset</button>
          </div>
        </div>
        <div className="viewer-hint">DRAG TO ORBIT · SCROLL TO ZOOM · TAP A NUMBER</div>
      </div>
      <aside className="side">
        <div className="card">
          <h3>Focus</h3>
          <div className="chips">
            {Object.keys(FOCUS).map((k) => (
              <button key={k} className={'chip' + (focus === k ? ' on' : '')} onClick={() => choose(k)}>
                {{ all: 'Overview', patient: 'Patient', paramedic: 'Paramedic', smart: 'Smart systems', driver: 'Driver' }[k]}
              </button>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>{F.title}<span className="pill ok">READY</span></h3>
          <div className="specs">
            {F.specs.map(([l, v, u]) => <div className="spec" key={l}><div className="label">{l}</div><b>{v}<small>{u}</small></b></div>)}
          </div>
          <div className="list" style={{ marginTop: 10 }}>
            {F.rows.map(([a, b]) => <div className="list-row" key={a}><span>{a}</span><span>{b}</span></div>)}
          </div>
        </div>
        <div className="card">
          <h3>{focus === 'all' ? 'Key features' : 'Features'}<span className="pill ok">{F.pins.length}</span></h3>
          <ol className="legend">
            {F.pins.map((id) => (
              <li key={id}>
                <button className={sel === id ? 'on' : ''} onClick={() => V.current.select(sel === id ? null : id)}>
                  <span className="lg-num">{FEATURES[id].n}</span>
                  <span className="lg-txt"><b>{FEATURES[id].label}</b><small>{FEATURES[id].sub}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

// ------------------------------------------------------------------ cabin
function buildCabin() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o });
  const box = (w, h, d, mat, x, y, z, r = 0.02, parent = g) => {
    const m = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2.01, h / 2.01, d / 2.01)) : new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const cyl = (r, h, mat, x, y, z, rot = null, seg = 24, parent = g, r2 = r) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat);
    m.position.set(x, y, z); if (rot) m.rotation.set(...rot);
    m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const P = {}; // feature id -> meshes
  const add = (id, ...ms) => { (P[id] = P[id] || []).push(...ms); };
  const anchors = {};

  const wall = M(0xeef1f3, { roughness: 0.35 });
  const floorM = M(0x2b3238, { roughness: 0.85 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced3, metalness: 0.85, roughness: 0.28 });
  const dark = M(0x1d2226, { roughness: 0.6 });
  const neon = new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x39ff88, emissiveIntensity: 0.9 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.05, transparent: true, opacity: 0.28, metalness: 0, depthWrite: false });

  // compact mini-ambulance cabin
  const X0 = -1.85, X1 = 0.4, Wd = 0.72, F = 0.5, TOP = 2.02, CABX = 1.62;
  box(4.0, 0.42, 1.66, dark, -0.12, 0.27, 0, 0.06);
  box(X1 - X0, 0.06, Wd * 2, floorM, (X0 + X1) / 2, F, 0, 0.01);
  box(X1 - X0, TOP - F, 0.05, wall, (X0 + X1) / 2, (TOP + F) / 2, -Wd, 0.02);              // far wall (full)
  box(X1 - X0, 0.4, 0.05, wall, (X0 + X1) / 2, F + 0.2, Wd, 0.02);                          // near wall (cut away)
  box(0.05, 0.5, Wd * 2, wall, X0, F + 0.25, 0, 0.02);                                       // rear doors (cut away)
  // partition with window
  box(0.05, 0.62, Wd * 2, wall, X1, F + 0.31, 0, 0.01);
  box(0.05, TOP - F - 1.0, Wd * 2, wall, X1, (TOP + F + 1.0) / 2 + 0.06, 0, 0.01);
  box(0.05, 0.42, 0.42, wall, X1, F + 0.83, -0.51, 0.01);
  box(0.05, 0.42, 0.42, wall, X1, F + 0.83, 0.51, 0.01);
  const win = box(0.03, 0.42, 0.6, glass, X1, F + 0.83, 0, 0.005);
  win.castShadow = false; win.userData.noOcclude = true;
  add('intercom', win);
  const intercom = box(0.04, 0.1, 0.08, dark, X1 - 0.04, F + 0.72, 0.4, 0.01);
  add('intercom', intercom); anchors.intercom = [X1 - 0.03, F + 0.95, 0.05];
  // roof rim + ambient LED strips
  box(X1 - X0, 0.04, 0.22, wall, (X0 + X1) / 2, TOP, -Wd + 0.11, 0.01);
  box(X1 - X0 - 0.2, 0.012, 0.025, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 1.4 }), (X0 + X1) / 2, TOP - 0.025, -Wd + 0.2, 0);
  box(X1 - X0, 0.01, 0.018, neon, (X0 + X1) / 2, F + 0.035, -Wd + 0.04, 0);
  box(X1 - X0, 0.01, 0.018, neon, (X0 + X1) / 2, F + 0.035, Wd - 0.04, 0);
  // ghost outline of the body
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.0, 1.62, 1.66)), new THREE.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.25 }));
  outline.position.set(-0.12, 1.3, 0); g.add(outline);

  // ---------------- smart stretcher (left side, patient head toward the cab)
  const SX = -0.78, SZ = -0.3;
  const sG = new THREE.Group(); g.add(sG);
  const frame = [];
  frame.push(box(1.95, 0.04, 0.56, alu, SX, 0.86, SZ, 0.015, sG));
  for (const dx of [-0.8, 0.8]) for (const dz of [-0.22, 0.22]) {
    frame.push(cyl(0.018, 0.3, alu, SX + dx, 0.69, SZ + dz, null, 12, sG));
    frame.push(cyl(0.04, 0.03, dark, SX + dx, 0.56, SZ + dz, [Math.PI / 2, 0, 0], 16, sG));
  }
  const mattressM = M(0x1f6f8b, { roughness: 0.6 });
  const mat1 = box(1.28, 0.09, 0.53, mattressM, SX - 0.32, 0.925, SZ, 0.04, sG);
  const back = box(0.62, 0.09, 0.53, mattressM, SX + 0.6, 1.03, SZ, 0.04, sG); back.rotation.z = 0.36;
  // weight-sensor display at the foot end
  const wScreen = canvasPanel(256, 128, (x) => {
    x.fillStyle = '#04100a'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#39ff88'; x.font = '700 44px Arial'; x.fillText('72.4 kg', 18, 64);
    x.font = '500 20px Arial'; x.fillStyle = '#8a939c'; x.fillText('LOCKED · 0.0°', 18, 104);
  });
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), wScreen); ws.position.set(SX - 0.99, 0.9, SZ); ws.rotation.y = -Math.PI / 2; sG.add(ws);
  box(0.03, 0.1, 0.2, dark, SX - 0.985, 0.9, SZ, 0.01, sG);
  // electromagnetic floor-lock rail (glows when locked)
  const lockRail = box(1.9, 0.02, 0.07, neon, SX, F + 0.04, SZ, 0.005, sG);
  add('stretcher', mat1, back, ...frame);
  anchors.stretcher = [SX - 0.5, 1.0, SZ + 0.28];

  // ---------------- patient (lying, under a blanket)
  const people = new THREE.Group(); g.add(people);
  const skin = M(0x8a5a3c, { roughness: 0.6 });
  const blanket = M(0xd8e4ea, { roughness: 0.9 });
  const pillow = box(0.28, 0.08, 0.4, M(0xffffff), SX + 0.72, 1.14, SZ, 0.04, people); pillow.rotation.z = 0.36;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), skin); head.position.set(SX + 0.74, 1.24, SZ); head.castShadow = true; people.add(head);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.5, 6, 12), blanket); torso.rotation.z = Math.PI / 2 + 0.36; torso.position.set(SX + 0.33, 1.1, SZ); torso.scale.set(1, 1, 0.75); torso.castShadow = true; people.add(torso);
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.8, 6, 12), blanket); legs.rotation.z = Math.PI / 2; legs.position.set(SX - 0.45, 1.03, SZ); legs.scale.set(1, 0.7, 0.85); legs.castShadow = true; people.add(legs);
  // ECG leads from patient to monitor
  const leadM = new THREE.MeshStandardMaterial({ color: 0x39ff88, emissive: 0x1a6b3a, roughness: 0.5 });
  const lead = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(SX + 0.4, 1.2, SZ - 0.05), new THREE.Vector3(SX + 0.5, 1.3, -0.55), new THREE.Vector3(-0.05, 1.35, -Wd + 0.08)]), 20, 0.006, 6), leadM);
  people.add(lead);

  // ---------------- paramedic seat (right side, facing the patient)
  const seatM = M(0x1f3a5c, { roughness: 0.7 });
  const seatG = new THREE.Group(); seatG.position.set(-0.45, 0, 0.42); g.add(seatG);
  const seatParts = [
    box(0.46, 0.1, 0.44, seatM, 0, 0.98, 0, 0.04, seatG),
    box(0.46, 0.62, 0.1, seatM, 0, 1.33, 0.2, 0.04, seatG),
    box(0.3, 0.14, 0.09, seatM, 0, 1.72, 0.2, 0.03, seatG),
  ];
  cyl(0.035, 0.42, alu, 0, 0.72, 0, null, 12, seatG);
  cyl(0.18, 0.02, alu, 0, 0.52, 0, null, 24, seatG);
  const belt = box(0.04, 0.55, 0.02, M(0x111111), 0.12, 1.3, 0.14, 0, seatG); belt.rotation.x = -0.35; belt.rotation.z = 0.5;
  add('seat', ...seatParts); anchors.seat = [-0.45, 1.5, 0.62];
  // paramedic figure (seated, facing -Z toward the patient)
  const uni = M(0x1d3557, { roughness: 0.7 }), refl = M(0xd8ff3a, { emissive: 0x6b8a10, emissiveIntensity: 0.4 });
  const pm = new THREE.Group(); pm.position.set(-0.45, 0, 0.42); people.add(pm);
  const pTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12), uni); pTorso.position.set(0, 1.3, 0.04); pTorso.rotation.x = -0.12; pTorso.castShadow = true; pm.add(pTorso);
  box(0.3, 0.035, 0.3, refl, 0, 1.24, 0.04, 0.01, pm);
  const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), skin); pHead.position.set(0, 1.66, -0.02); pHead.castShadow = true; pm.add(pHead);
  for (const s of [-1, 1]) {
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), uni); th.rotation.x = Math.PI / 2; th.position.set(s * 0.1, 1.06, -0.15); th.castShadow = true; pm.add(th);
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 10), uni); sh.position.set(s * 0.1, 0.78, -0.33); sh.castShadow = true; pm.add(sh);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.32, 4, 10), uni); arm.rotation.x = Math.PI / 2.6; arm.position.set(s * 0.21, 1.27, -0.12); arm.castShadow = true; pm.add(arm);
  }
  // tablet on a swing arm
  const tabG = new THREE.Group(); tabG.position.set(-0.12, 0, 0.55); g.add(tabG);
  cyl(0.015, 0.5, alu, 0, 1.05, 0, null, 10, tabG);
  const tabScreen = canvasPanel(320, 220, (x) => {
    x.fillStyle = '#0a1114'; x.fillRect(0, 0, 320, 220);
    x.fillStyle = '#39ff88'; x.font = '700 22px Arial'; x.fillText('AI ROUTE · APEX', 14, 32);
    x.strokeStyle = '#39ff88'; x.lineWidth = 4; x.beginPath(); x.moveTo(30, 190); x.lineTo(90, 140); x.lineTo(150, 150); x.lineTo(210, 90); x.lineTo(290, 60); x.stroke();
    x.fillStyle = '#ff3b4a'; x.beginPath(); x.arc(30, 190, 7, 0, 7); x.fill();
    x.fillStyle = '#eef1f3'; x.font = '600 18px Arial'; x.fillText('ETA 6 min · 1.5 km', 14, 64);
    x.fillStyle = '#8a939c'; x.font = '500 15px Arial'; x.fillText('e-PCR synced ✓', 14, 88);
  });
  const tab = box(0.26, 0.18, 0.02, dark, 0, 1.36, -0.02, 0.01, tabG); tab.rotation.y = 0.25;
  const ts = new THREE.Mesh(new THREE.PlaneGeometry(0.235, 0.16), tabScreen); ts.position.set(-0.005, 1.36, -0.032); ts.rotation.y = Math.PI + 0.25; tabG.add(ts);
  add('tablet', tab); anchors.tablet = [-0.12, 1.46, 0.53];

  // ---------------- multi-parameter monitor (far wall, on an arm)
  const monG = new THREE.Group(); monG.position.set(-0.05, 0, -Wd); g.add(monG);
  box(0.06, 0.06, 0.18, alu, 0, 1.45, 0.09, 0.01, monG);
  const mon = box(0.48, 0.34, 0.05, M(0x1d2226), 0, 1.45, 0.2, 0.02, monG);
  const screen = makeMonitor();
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.43, 0.29), new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }));
  scr.position.set(0, 1.45, 0.226); monG.add(scr);
  add('monitor', mon); anchors.monitor = [-0.05, 1.64, -Wd + 0.22];

  // ---------------- oxygen: IoT cylinder with digital gauge (rear corner) + wall outlet
  const o2b = M(0x151515, { roughness: 0.35, metalness: 0.4 }), o2w = M(0xf4f4f4, { roughness: 0.35 });
  const o2G = new THREE.Group(); o2G.position.set(-1.66, F, 0.55); g.add(o2G);
  const c1 = cyl(0.085, 0.6, o2b, 0, 0.32, 0, null, 24, o2G);
  const c2 = cyl(0.085, 0.12, o2w, 0, 0.68, 0, null, 24, o2G);
  cyl(0.03, 0.08, alu, 0, 0.78, 0, null, 12, o2G);
  const gauge = canvasPanel(160, 120, (x) => {
    x.fillStyle = '#04100a'; x.fillRect(0, 0, 160, 120);
    x.fillStyle = '#4dc3ff'; x.font = '700 40px Arial'; x.fillText('182', 14, 56);
    x.font = '500 18px Arial'; x.fillStyle = '#8a939c'; x.fillText('bar · O2', 14, 84);
    x.fillStyle = '#39ff88'; x.fillRect(14, 96, 110, 8);
  });
  const gb = box(0.1, 0.08, 0.03, dark, -0.1, 0.82, 0, 0.01, o2G); gb.rotation.y = -Math.PI / 2;
  const gs = new THREE.Mesh(new THREE.PlaneGeometry(0.085, 0.065), gauge); gs.position.set(-0.117, 0.82, 0); gs.rotation.y = -Math.PI / 2; o2G.add(gs);
  box(0.06, 0.04, 0.3, alu, 0, 0.5, 0, 0.01, o2G);
  add('o2', c1, c2, gb); anchors.o2 = [-1.66, F + 0.88, 0.55];
  box(0.18, 0.12, 0.04, M(0xdfe3e6), -0.55, 1.2, -Wd + 0.04, 0.015);        // O2 / suction wall outlet
  cyl(0.012, 0.03, M(0x2a64b0), -0.6, 1.2, -Wd + 0.07, [Math.PI / 2, 0, 0], 10);
  cyl(0.012, 0.03, M(0x39c46a), -0.5, 1.2, -Wd + 0.07, [Math.PI / 2, 0, 0], 10);

  // ---------------- IV rail with drip bag
  const ivRail = box(1.2, 0.02, 0.02, alu, SX, TOP - 0.06, SZ, 0);
  const bag = box(0.09, 0.16, 0.035, new THREE.MeshPhysicalMaterial({ color: 0xdff6ff, transparent: true, opacity: 0.7, roughness: 0.1 }), SX + 0.25, TOP - 0.2, SZ, 0.02);
  add('iv', ivRail, bag); anchors.iv = [SX + 0.25, TOP - 0.1, SZ];

  // ---------------- AED (partition, lower right, next to the paramedic)
  const aed = box(0.05, 0.28, 0.24, M(0x1d8a5a), X1 - 0.05, F + 0.42, 0.5, 0.03);
  box(0.02, 0.07, 0.12, M(0xf2c200), X1 - 0.08, F + 0.48, 0.5, 0.005);
  add('aed', aed); anchors.aed = [X1 - 0.08, F + 0.6, 0.5];

  // ---------------- smart RFID medicine cabinet (far wall, high, foot end)
  const cabM = M(0xf4f6f7, { roughness: 0.3 });
  const cabs = [];
  const ledCols = [0x39ff88, 0x39ff88, 0xffb547, 0x39ff88, 0xff3b4a, 0x39ff88];
  for (let i = 0; i < 2; i++) {
    const cx = -1.55 + i * 0.66;
    cabs.push(box(0.62, 0.4, 0.3, cabM, cx, 1.78, -Wd + 0.17, 0.02));
    box(0.56, 0.32, 0.01, glass, cx, 1.78, -Wd + 0.325, 0);
    for (let k = 0; k < 3; k++) {
      box(0.14, 0.1, 0.12, M([0xc0262d, 0x2a64b0, 0xf2c200][(i + k) % 3]), cx - 0.18 + k * 0.18, 1.66, -Wd + 0.17, 0.02);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: ledCols[i * 3 + k] }));
      led.position.set(cx - 0.18 + k * 0.18, 1.95, -Wd + 0.335); g.add(led);
    }
  }
  add('rfid', ...cabs); anchors.rfid = [-1.22, 2.0, -Wd + 0.3];

  // ---------------- telemedicine screen (partition, facing the patient)
  const tele = makeTele();
  const teleFrame = box(0.04, 0.32, 0.5, M(0x1d2226), X1 - 0.045, 1.66, -0.2, 0.02);
  const tscr = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.28), new THREE.MeshBasicMaterial({ map: tele.tex, toneMapped: false }));
  tscr.position.set(X1 - 0.068, 1.66, -0.2); tscr.rotation.y = -Math.PI / 2; g.add(tscr);
  add('tele', teleFrame); anchors.tele = [X1 - 0.07, 1.86, -0.2];

  // ---------------- 360° camera dome (ceiling)
  const camBase = cyl(0.07, 0.03, M(0xeeeeee), -0.4, TOP - 0.03, -0.25, null, 24);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.05, metalness: 0.2, clearcoat: 1 }));
  dome.position.set(-0.4, TOP - 0.045, -0.25); g.add(dome);
  const recLed = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b4a })); recLed.position.set(-0.33, TOP - 0.05, -0.25); g.add(recLed);
  add('camera', camBase); anchors.camera = [-0.4, TOP - 0.1, -0.25];

  // ---------------- UV-C strip (violet when the cycle runs)
  const uvMat = new THREE.MeshStandardMaterial({ color: 0x8a5cff, emissive: 0x8a5cff, emissiveIntensity: 0.05 });
  const uvStrip = box(1.6, 0.02, 0.05, uvMat, -0.75, TOP - 0.03, 0.15, 0.005);
  const uvLight = new THREE.PointLight(0x9a6bff, 0, 3.5, 1.5); uvLight.position.set(-0.75, TOP - 0.2, 0.1); g.add(uvLight);
  add('uvc', uvStrip); anchors.uvc = [-1.2, TOP - 0.05, 0.15];

  // ---------------- HEPA climate unit (ceiling, rear)
  const hvac = box(0.4, 0.08, 0.5, M(0xe3e7ea), -1.45, TOP - 0.04, 0.0, 0.02);
  for (let i = 0; i < 6; i++) box(0.36, 0.008, 0.01, dark, -1.45, TOP - 0.085, -0.2 + i * 0.08, 0);
  add('hvac', hvac); anchors.hvac = [-1.45, TOP - 0.1, 0.2];

  // ---------------- driver cab (right-hand drive, single driver seat)
  box(CABX - X1, 0.06, Wd * 2, floorM, (X1 + CABX) / 2, F - 0.02, 0, 0.01);
  const dSeatM = M(0x2a3036, { roughness: 0.7 });
  const dseat = [box(0.48, 0.12, 0.46, dSeatM, 0.95, 0.98, 0.38, 0.05), box(0.12, 0.66, 0.46, dSeatM, 0.73, 1.36, 0.38, 0.05)];
  dseat[1].rotation.z = -0.15;
  add('driver', ...dseat); anchors.driver = [0.8, 1.75, 0.38];
  // driver figure
  const dr = new THREE.Group(); people.add(dr);
  const dTorso = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.36, 6, 12), M(0x2b2f36)); dTorso.position.set(0.82, 1.32, 0.38); dTorso.rotation.z = -0.15; dTorso.castShadow = true; dr.add(dTorso);
  const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 16), skin); dHead.position.set(0.86, 1.68, 0.38); dHead.castShadow = true; dr.add(dHead);
  for (const s of [-1, 1]) {
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), M(0x2b2f36)); th.rotation.z = Math.PI / 2; th.position.set(1.06, 1.06, 0.38 + s * 0.1); dr.add(th);
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.3, 4, 10), M(0x2b2f36)); sh.position.set(1.26, 0.8, 0.38 + s * 0.1); dr.add(sh);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.34, 4, 10), M(0x2b2f36)); arm.rotation.z = Math.PI / 2.4; arm.position.set(1.02, 1.36, 0.38 + s * 0.2); dr.add(arm);
  }
  // steering on the right, dashboard + smart display, left-side console (no passenger seat)
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 32), M(0x111111));
  wheel.position.set(1.3, 1.36, 0.38); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.45; wheel.castShadow = true; g.add(wheel);
  box(0.32, 0.3, Wd * 2 - 0.05, M(0x22272c), 1.5, 1.24, 0, 0.05);
  const dashScreen = makeDash();
  const dframe = box(0.04, 0.24, 0.42, dark, 1.36, 1.5, -0.12, 0.01); dframe.rotation.z = 0.3;
  const ds = new THREE.Mesh(new THREE.PlaneGeometry(0.39, 0.21), new THREE.MeshBasicMaterial({ map: dashScreen.tex, toneMapped: false }));
  ds.position.set(1.334, 1.506, -0.12); ds.rotation.y = -Math.PI / 2; ds.rotation.x = 0; ds.rotateX(-0.3); g.add(ds);
  add('dash', dframe); anchors.dash = [1.28, 1.7, -0.12];
  box(0.5, 0.42, 0.4, M(0x30363c), 0.95, 0.78, -0.4, 0.04);       // equipment console (left)
  box(0.2, 0.06, 0.16, M(0x111111), 1.0, 1.02, -0.4, 0.01);        // radio
  const ws2 = box(0.04, 0.55, Wd * 2 - 0.1, glass, 1.85, 1.62, 0, 0.01); ws2.rotation.z = 0.35; ws2.userData.noOcclude = true; ws2.castShadow = false;
  const cabOutline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.3, 1.38, 1.66)), new THREE.LineBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.16 }));
  cabOutline.position.set(1.27, 1.2, 0); g.add(cabOutline);

  // interior light
  const pl = new THREE.PointLight(0xeaf4ff, 2.6, 4.5, 1.6); pl.position.set(-0.7, 1.9, 0); g.add(pl);

  const hl = highlighter(P);
  let uvOn = false, uvK = 0;
  return {
    group: g,
    anchor(id) { return g.localToWorld(new THREE.Vector3(...anchors[id])); },
    setPeople(v) { people.visible = v; },
    setUV(v) { uvOn = v; },
    update(t, dt, sel) {
      screen.update(t); tele.update(t); dashScreen.update(t);
      recLed.visible = Math.floor(t * 2) % 2 === 0;
      uvK += ((uvOn ? 1 : 0) - uvK) * Math.min(1, dt * 3);
      uvMat.emissiveIntensity = 0.05 + uvK * (2.2 + Math.sin(t * 6) * 0.3);
      uvLight.intensity = uvK * 14;
      hl(sel && !sel.startsWith('grp:') ? sel : null, t, dt);
    },
  };
}

function canvasPanel(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
}

const ecg = (p) => {
  if (p < 0.1) return Math.sin((p / 0.1) * Math.PI) * 0.12;
  if (p > 0.16 && p < 0.18) return -0.15;
  if (p >= 0.18 && p < 0.21) return 1;
  if (p >= 0.21 && p < 0.24) return -0.3;
  if (p > 0.38 && p < 0.52) return Math.sin(((p - 0.38) / 0.14) * Math.PI) * 0.22;
  return 0;
};

function makeMonitor() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 340;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  let last = -1, px = 0, prev = 170;
  x.fillStyle = '#04100a'; x.fillRect(0, 0, 512, 340);
  return {
    tex,
    update(t) {
      const k = Math.floor(t * 30); if (k === last) return; last = k;
      x.fillStyle = '#04100a'; x.fillRect(12 + px, 30, 14, 200);
      const y = 150 - ecg((t * 1.25) % 1) * 100;
      x.strokeStyle = '#39ff88'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(12 + px - 4, prev); x.lineTo(12 + px, y); x.stroke();
      prev = y; px = (px + 4) % 330;
      x.fillStyle = '#04100a'; x.fillRect(355, 0, 157, 340); x.fillRect(0, 250, 355, 90);
      x.fillStyle = '#39ff88'; x.font = '600 20px Arial'; x.fillText('HR', 368, 40);
      x.font = '700 58px Arial'; x.fillText(String(75 + Math.round(Math.sin(t * 0.3) * 2)), 368, 98);
      x.fillStyle = '#4dc3ff'; x.font = '600 20px Arial'; x.fillText('SpO2', 368, 140); x.font = '700 48px Arial'; x.fillText('97', 368, 188);
      x.fillStyle = '#ffb547'; x.font = '600 18px Arial'; x.fillText('NIBP', 368, 226); x.font = '700 28px Arial'; x.fillText('122/80', 368, 260);
      x.fillStyle = '#39ff88'; x.font = '600 16px Arial'; x.fillText('● LIVE TO HOSPITAL', 14, 300);
      x.strokeStyle = '#4dc3ff'; x.lineWidth = 2; x.beginPath();
      for (let i = 0; i < 330; i += 3) { const yy = 286 - Math.max(0, Math.sin((i / 330) * 8 * Math.PI - t * 6)) * 22; i ? x.lineTo(12 + i, yy) : x.moveTo(12, yy); }
      x.stroke();
      tex.needsUpdate = true;
    },
  };
}

function makeTele() {
  const c = document.createElement('canvas'); c.width = 480; c.height = 290;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  let last = -1;
  return {
    tex,
    update(t) {
      const k = Math.floor(t * 4); if (k === last) return; last = k;
      const g = x.createLinearGradient(0, 0, 0, 290); g.addColorStop(0, '#1d2f3a'); g.addColorStop(1, '#0d161c');
      x.fillStyle = g; x.fillRect(0, 0, 480, 290);
      // doctor silhouette in scrubs
      x.fillStyle = '#2f8f8a'; x.beginPath(); x.ellipse(200, 300, 120, 100, 0, Math.PI, 0); x.fill();
      x.fillStyle = '#a8734f'; x.beginPath(); x.arc(200, 140, 52, 0, 7); x.fill();
      x.fillStyle = '#2b2b2b'; x.beginPath(); x.arc(200, 122, 54, Math.PI, 0); x.fill();
      x.fillStyle = '#eef1f3'; x.fillRect(150, 215, 100, 6);
      // overlay
      x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, 480, 34);
      x.fillStyle = '#ff3b4a'; x.beginPath(); x.arc(18, 17, 6, 0, 7); x.fill();
      x.fillStyle = '#eef1f3'; x.font = '600 17px Arial';
      const s = Math.floor(t) % 3600;
      x.fillText(`Dr. A. Rao · Apex ER · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`, 32, 23);
      // patient self-view
      x.fillStyle = '#0b0f12'; x.fillRect(350, 190, 118, 88); x.strokeStyle = '#39ff88'; x.lineWidth = 2; x.strokeRect(350, 190, 118, 88);
      x.fillStyle = '#d8e4ea'; x.fillRect(362, 238, 94, 22); x.fillStyle = '#a8734f'; x.beginPath(); x.arc(380, 232, 12, 0, 7); x.fill();
      tex.needsUpdate = true;
    },
  };
}

function makeDash() {
  const c = document.createElement('canvas'); c.width = 480; c.height = 260;
  const x = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  let last = -1;
  return {
    tex,
    update(t) {
      const k = Math.floor(t * 4); if (k === last) return; last = k;
      x.fillStyle = '#05080a'; x.fillRect(0, 0, 480, 260);
      // map half
      x.strokeStyle = '#2a3036'; x.lineWidth = 16; x.beginPath(); x.moveTo(40, 240); x.lineTo(120, 150); x.lineTo(110, 90); x.lineTo(200, 20); x.stroke();
      x.strokeStyle = '#39ff88'; x.lineWidth = 5; x.stroke();
      x.fillStyle = '#ff3b4a'; x.beginPath(); x.arc(40 + (t * 6) % 60, 240 - ((t * 6) % 60) * 1.1, 8, 0, 7); x.fill();
      x.fillStyle = '#eef1f3'; x.font = '700 22px Arial'; x.fillText('↱ 300 m', 20, 34);
      // patient status half
      x.fillStyle = '#0c1216'; x.fillRect(250, 0, 230, 260);
      x.fillStyle = '#8a939c'; x.font = '600 16px Arial'; x.fillText('PATIENT', 268, 32);
      x.fillStyle = '#39ff88'; x.font = '700 44px Arial'; x.fillText(String(75 + Math.round(Math.sin(t * 0.3) * 2)), 268, 88); x.font = '500 16px Arial'; x.fillText('bpm', 340, 88);
      x.fillStyle = '#4dc3ff'; x.font = '700 36px Arial'; x.fillText('97%', 268, 140);
      x.fillStyle = '#39ff88'; x.font = '600 18px Arial'; x.fillText('STABLE', 268, 186);
      x.fillStyle = '#eef1f3'; x.font = '600 18px Arial'; x.fillText('ETA 6 min', 268, 226);
      tex.needsUpdate = true;
    },
  };
}
