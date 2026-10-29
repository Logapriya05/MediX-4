import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createViewer } from '../components/viewer.js';
import { PinLayer } from '../components/pins.js';
import { loadAmbulanceModel, AMB } from '../sim/ambulance.js';
import { buildBattery } from '../models/battery.js';
import { buildMotor } from '../models/motor.js';
import { buildController } from '../models/controller.js';
import { mats, rbox, mesh, canvasTex, highlighter } from '../models/kit.js';
import { useLive } from '../useLive.js';

const MODEL = (typeof window !== 'undefined' && window.__MEDIX_MODEL__) || `${import.meta.env.BASE_URL}ambulance.glb`;

const LEGEND = [
  ['motor', 'Traction Motor Unit', 'BLDC / PMSM motor, front', 'motor'],
  ['battery', 'Underfloor Battery Pack', '51.2 V, 100 Ah LiFePO4 (16S)', 'battery'],
  ['aux', '12 V Auxiliary Battery', 'Powers lights, sensors and medical loads'],
  ['diff', 'Rear Drive Unit / Differential', 'Transfers power to the rear wheels'],
  ['solar', 'Roof Solar Array', 'Auxiliary power for the 12 V system'],
  ['controller', 'Motor Controller / Inverter', 'Controls motor and power flow', 'controller'],
  ['dash', 'Dashboard Unit', 'Displays vehicle and battery data'],
];

const FLOWS = {
  drive: {
    label: 'Drive', color: '#39ff88',
    steps: [['battery', 'Battery supplies 51.2 V DC'], ['controller', 'Controller converts DC to 3-phase AC'], ['motor', 'Motor turns current into torque'], ['prop', 'Gearbox and propeller shaft carry torque rearward'], ['diff', 'Differential drives the rear wheels']],
    lines: { hv: 1, ac: 1, solar: 1, lv: 1 }, wheels: 1,
  },
  regen: {
    label: 'Regen', color: '#4d8dff',
    steps: [['diff', 'Rear wheels back-drive the drivetrain when braking'], ['motor', 'Motor works as a generator'], ['controller', 'Controller rectifies AC back to DC'], ['battery', 'Recovered energy charges the pack']],
    lines: { hv: -1, ac: -1, solar: 1, lv: 1 }, wheels: 1,
  },
  charge: {
    label: 'Charging', color: '#ffb547',
    steps: [['port', 'Plug in at the side charge port'], ['obc', 'On-board charger converts 230 V AC to DC'], ['battery', 'BMS charges the pack, CC then CV'], ['dash', 'Dashboard shows charge status']],
    lines: { charge: 1, lv: 1, solar: 1 }, wheels: 0,
  },
  solar: {
    label: 'Solar standby', color: '#f2e14b',
    steps: [['solar', 'Roof PV array generates about 240 W'], ['aux', '12 V auxiliary battery stores it'], ['dash', 'Lights, monitors and dashboard run from 12 V']],
    lines: { solar: 1, lv: 1 }, wheels: 0,
  },
};
const LINE_COL = { hv: '#39ff88', ac: '#b46bff', solar: '#f2e14b', lv: '#4dc3ff', charge: '#ffb547' };

export default function LayoutPage({ active }) {
  const host = useRef(null);
  const S = useRef({ flow: 'drive', sel: null });
  const [flow, setFlow] = useState('drive');
  const [step, setStep] = useState(0);
  const [sel, setSel] = useState(null);
  const live = useLive();

  useEffect(() => {
    const v = createViewer(host.current, { target: [0, 0.95, 0], pos: [1.2, 2.4, 6.4] });
    v.controls.autoRotateSpeed = 0.45;
    if (v.camera.aspect < 1) v.camera.position.set(2.4, 3.6, 11.5);
    v.controls.minDistance = 1.2;
    const st = S.current; st.v = v;
    const pins = new PinLayer(host.current, v.camera, { onSelect: (id) => st.select(id) });
    st.pins = pins;
    let alive = true;
    const world = new THREE.Group(); v.scene.add(world);
    const K = mats();

    // ---- components at their real positions (X forward, Y up, Z width)
    const battery = buildBattery(); battery.setMode('closed');
    battery.group.position.set(-0.08, 0.13, 0); world.add(battery.group);
    const motor = buildMotor(); motor.setMode('closed');
    motor.group.rotation.y = Math.PI; motor.group.position.set(1.18, 0.12, 0); world.add(motor.group);
    const ctrl = buildController(); ctrl.setMode('closed');
    ctrl.group.rotation.y = Math.PI / 2; ctrl.group.position.set(1.72, 0.5, -0.12); world.add(ctrl.group);

    // propeller shaft (spins) from motor output to differential
    world.updateMatrixWorld(true);
    const pA = motor.group.localToWorld(new THREE.Vector3(0.36, 0.086, 0));
    const pB = new THREE.Vector3(-1.16, 0.29, 0);
    const propG = new THREE.Group(); world.add(propG);
    const propLen = pA.distanceTo(pB);
    propG.position.copy(pA).add(pB).multiplyScalar(0.5);
    propG.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), pB.clone().sub(pA).normalize());
    const propSpin = new THREE.Group(); propG.add(propSpin);
    mesh(new THREE.CylinderGeometry(0.028, 0.028, propLen - 0.12, 20), K.steel, propSpin, [0, 0, 0], [0, 0, Math.PI / 2]);
    for (const sx of [-1, 1]) {
      mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.05, 6), K.darkSteel, propSpin, [sx * (propLen / 2 - 0.05), 0, 0], [0, 0, Math.PI / 2]);
    }
    mesh(rbox(0.04, 0.008, 0.06, 0.002), K.darkSteel, propSpin, [0, 0.03, 0]);

    // rear differential + axle tubes
    const diffG = new THREE.Group(); diffG.position.set(-1.34, 0.287, 0); world.add(diffG);
    const diffMat = new THREE.MeshPhysicalMaterial({ color: 0xa3261f, metalness: 0.5, roughness: 0.45, clearcoat: 0.4 });
    mesh(new THREE.SphereGeometry(0.15, 32, 24), diffMat, diffG, [0, 0, 0]).scale.set(1, 0.95, 0.85);
    mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.16, 24), diffMat, diffG, [0.17, 0, 0], [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 32), K.darkSteel, diffG, [0, 0, -0.12], [Math.PI / 2, 0, 0]);
    const axles = new THREE.Group(); diffG.add(axles);
    mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2, 20), K.darkSteel, axles, [0, 0, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.02, 6), K.steel, diffG, [Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.135], [Math.PI / 2, 0, 0]); }

    // 12 V auxiliary battery in the rear compartment
    const auxG = new THREE.Group(); auxG.position.set(-1.72, 0.62, 0.42); world.add(auxG);
    const auxCase = new THREE.MeshPhysicalMaterial({ color: 0xe9c31c, roughness: 0.4, clearcoat: 0.5 });
    mesh(rbox(0.3, 0.2, 0.18, 0.01), auxCase, auxG, [0, 0.1, 0]);
    mesh(rbox(0.31, 0.04, 0.19, 0.008), new THREE.MeshStandardMaterial({ color: 0x1d6b2f, roughness: 0.5 }), auxG, [0, 0.215, 0]);
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 16), K.red, auxG, [0.1, 0.245, 0.05]);
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.03, 16), K.plasticBlack, auxG, [-0.1, 0.245, 0.05]);
    const auxLabel = canvasTex(256, 128, (x) => { x.fillStyle = '#e9c31c'; x.fillRect(0, 0, 256, 128); x.fillStyle = '#111'; x.font = '700 44px Arial'; x.fillText('12V AUX', 26, 62); x.font = '500 22px Arial'; x.fillText('LiFePO4 · 40 Ah', 26, 100); });
    mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshStandardMaterial({ map: auxLabel, roughness: 0.5 }), auxG, [0, 0.1, 0.0905]);

    // on-board charger + charge port (for the charging flow)
    const obc = new THREE.Group(); obc.position.set(-0.95, 0.5, -0.5); world.add(obc);
    mesh(rbox(0.26, 0.08, 0.18, 0.01), K.alu, obc, [0, 0.04, 0]);
    for (let i = 0; i < 9; i++) mesh(rbox(0.004, 0.02, 0.17, 0.001), K.aluDark, obc, [-0.11 + i * 0.0275, 0.09, 0]);
    const port = new THREE.Group(); port.position.set(-1.62, 1.0, -(AMB.W / 2 + 0.02)); world.add(port);
    mesh(rbox(0.22, 0.22, 0.03, 0.03), K.plasticBlack, port, [0, 0, 0]);
    mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 32), K.plasticGrey, port, [0, 0, -0.01], [Math.PI / 2, 0, 0]);

    // dashboard unit (right-hand drive)
    const dashG = new THREE.Group(); dashG.position.set(1.42, 1.22, 0.36); dashG.rotation.y = Math.PI / 2; world.add(dashG);
    mesh(rbox(0.34, 0.2, 0.04, 0.02), K.plasticBlack, dashG, [0, 0, 0]);
    const dashCanvas = document.createElement('canvas'); dashCanvas.width = 512; dashCanvas.height = 300;
    const dashTex = new THREE.CanvasTexture(dashCanvas); dashTex.colorSpace = THREE.SRGBColorSpace;
    mesh(new THREE.PlaneGeometry(0.31, 0.17), new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }), dashG, [0, 0, 0.0205]);
    const drawDash = (soc, kw, mode) => {
      const x = dashCanvas.getContext('2d');
      x.fillStyle = '#05080a'; x.fillRect(0, 0, 512, 300);
      x.strokeStyle = '#39ff88'; x.lineWidth = 14; x.beginPath(); x.arc(130, 170, 90, Math.PI * 0.8, Math.PI * (0.8 + 1.4 * soc / 100)); x.stroke();
      x.fillStyle = '#eef1f3'; x.font = '700 56px Arial'; x.textAlign = 'center'; x.fillText(Math.round(soc) + '%', 130, 185);
      x.font = '500 20px Arial'; x.fillStyle = '#8a939c'; x.fillText('BATTERY', 130, 220);
      x.textAlign = 'left'; x.fillStyle = '#eef1f3'; x.font = '700 44px Arial'; x.fillText(kw.toFixed(1) + ' kW', 270, 130);
      x.fillStyle = '#8a939c'; x.font = '500 20px Arial'; x.fillText('MOTOR', 272, 160);
      x.fillStyle = '#39ff88'; x.font = '700 26px Arial'; x.fillText(mode.toUpperCase(), 272, 220);
      dashTex.needsUpdate = true;
    };

    // solar roof
    const solar = makeSolar(); solar.position.set(-0.9, 2.345, 0); world.add(solar);

    // ---- energy-flow tubes with moving dashes
    const dash = canvasTex(128, 16, (x) => { x.clearRect(0, 0, 128, 16); const g = x.createLinearGradient(0, 0, 128, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 16); }, { srgb: false, repeat: true });
    const lines = {};
    const addLine = (key, pts, r = 0.018) => {
      const curve = new THREE.CatmullRomCurve3(pts.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))), false, 'catmullrom', 0.2);
      const len = curve.getLength();
      const base = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 10), new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.6, metalness: 0.2 }));
      const t = dash.clone(); t.needsUpdate = true; t.repeat.set(len / 0.22, 1);
      const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r * 1.25, 10), new THREE.MeshBasicMaterial({ map: t, color: LINE_COL[key], transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.userData.noOcclude = true; base.userData.noOcclude = true;
      world.add(base, glow);
      (lines[key] = lines[key] || []).push({ glow, tex: t });
    };
    world.updateMatrixWorld(true);
    const W = (obj, p) => obj.localToWorld(new THREE.Vector3(...p));
    const batOut = W(battery.group, [0.505, 0.13, -0.08]);
    const ctlIn = W(ctrl.group, [0.19, 0.05, -0.055]);
    const ctlOut = W(ctrl.group, [0.19, 0.05, 0.045]);
    const motTerm = W(motor.group, [-0.1, 0.1, 0.17]);
    addLine('hv', [batOut, [0.62, 0.2, -0.1], [1.2, 0.48, -0.25], [ctlIn.x, ctlIn.y + 0.05, ctlIn.z - 0.05], ctlIn]);
    addLine('ac', [ctlOut, [ctlOut.x + 0.05, ctlOut.y - 0.12, ctlOut.z + 0.08], [1.4, 0.32, 0.2], motTerm]);
    addLine('solar', [[-1.6, 2.3, 0.45], [-1.95, 2.0, 0.6], [-1.95, 1.2, 0.6], [-1.72, 0.9, 0.48]], 0.014);
    addLine('lv', [[-1.62, 0.86, 0.38], [-1.2, 0.95, 0.72], [0.6, 0.95, 0.72], [1.3, 1.1, 0.5], [1.42, 1.2, 0.36]], 0.012);
    const batAc = W(battery.group, [0.48, 0.12, 0.1]);
    addLine('charge', [[-1.62, 1.0, -0.82], [-1.3, 0.85, -0.72], obc.position.clone().add(new THREE.Vector3(0, 0.05, 0)), [-0.3, 0.4, -0.4], [0.3, 0.35, 0.25], batAc]);

    // ---- vehicle body as an x-ray shell
    loadAmbulanceModel(MODEL, v.scene.environment).then((m) => {
      if (!alive) return;
      st.amb = m;
      const bodyMesh = m.body.children[0];
      const xr = bodyMesh.material.clone();
      xr.transparent = true; xr.opacity = 0.2; xr.depthWrite = false;
      bodyMesh.material = xr; bodyMesh.castShadow = false; bodyMesh.userData.noOcclude = true;
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(bodyMesh.geometry, 28), new THREE.LineBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.22 }));
      m.body.add(edges);
      world.add(m.root);
    });

    // ---- highlights + pins
    const groups = {
      motor: [motor.group], battery: [battery.group], controller: [ctrl.group], aux: [auxG], diff: [diffG], solar: [solar], dash: [dashG],
      prop: [propG], port: [port], obc: [obc],
    };
    const hl = highlighter(groups);
    const anchorOf = {
      motor: () => W(motor.group, [0.0, 0.33, 0.0]), battery: () => W(battery.group, [0.2, 0.26, 0.2]), aux: () => W(auxG, [0, 0.24, 0]),
      diff: () => W(diffG, [0, 0.12, 0.08]), solar: () => W(solar, [0.3, 0.03, 0.2]), controller: () => W(ctrl.group, [0, 0.09, 0]),
      dash: () => W(dashG, [0, 0.11, 0]),
    };
    pins.set(LEGEND.map(([id, label], i) => ({ id, num: i + 1, label, anchor: anchorOf[id], reach: 54 })), [world]);

    st.focusOn = (id) => {
      const a = (anchorOf[id] || (() => groups[id][0].getWorldPosition(new THREE.Vector3())))();
      const dir = v.camera.position.clone().sub(v.controls.target).normalize();
      v.controls.autoRotate = false;
      v.focus([a.x, a.y, a.z], [a.x + dir.x * 2.2, a.y + Math.max(0.4, dir.y * 2.2), a.z + dir.z * 2.2], 1);
    };
    st.select = (id) => { st.sel = id; setSel(id); pins.select(id); if (id) st.focusOn(id); };

    let stepT = 0, stepI = 0, dashT = 0, wheelAng = 0;
    v.setFrame((dt, t) => {
      const F = FLOWS[st.flow];
      // flowing dashes
      for (const [key, arr] of Object.entries(lines)) {
        const dir = F.lines[key] || 0;
        arr.forEach(({ glow, tex }) => {
          glow.material.opacity += ((dir ? 0.95 : 0) - glow.material.opacity) * Math.min(1, dt * 4);
          glow.visible = glow.material.opacity > 0.02;
          tex.offset.x -= dir * dt * 1.6;
          if (key === 'hv' || key === 'ac') glow.material.color.set(st.flow === 'regen' ? '#4d8dff' : LINE_COL[key]);
        });
      }
      const wheelSpeed = F.wheels * (st.flow === 'regen' ? 5 : 8);
      wheelAng -= wheelSpeed * dt;
      if (st.amb) {
        st.amb.wheels.forEach((w) => { w.spin.rotation.z = wheelAng; });
        const ph = (t * 2.6) % 1;
        st.amb.lights.forEach((L, i) => {
          const on = i % 2 === 0 ? ph < 0.25 || (ph > 0.5 && ph < 0.6) : (ph > 0.25 && ph < 0.5) || (ph > 0.75 && ph < 0.85);
          if (L.mesh) L.mesh.material.color.copy(L.base).multiplyScalar(on ? 1.6 : 0.18);
          L.spr.material.opacity = on ? 0.35 : 0; L.spr.scale.setScalar(0.5);
        });
      }
      propSpin.rotation.x = wheelAng * 3.1;
      axles.rotation.z = wheelAng;
      battery.update(t, dt, false); ctrl.update(t, dt, false);
      motor.update(t, F.wheels ? dt : 0.0001, false);
      // step sequence
      stepT += dt;
      if (stepT > 1.7) { stepT = 0; stepI = (stepI + 1) % F.steps.length; setStep(stepI); }
      if (st.flowChanged) { st.flowChanged = false; stepI = 0; stepT = 0; setStep(0); }
      const hot = st.sel || F.steps[stepI][0];
      hl(hot, t, dt);
      dashT -= dt;
      if (dashT <= 0) { dashT = 0.5; const L = st.live || { soc: 86, power: 0 }; drawDash(L.soc, st.flow === 'drive' ? Math.max(0, L.power) : st.flow === 'regen' ? -2.4 : 0, F.label); }
      pins.update();
    });
    return () => { alive = false; pins.dispose(); v.dispose(); };
  }, []);

  useEffect(() => { S.current.live = live; }, [live]);
  useEffect(() => { S.current.v && S.current.v.setActive(active); }, [active]);
  const chooseFlow = (k) => { S.current.flow = k; S.current.flowChanged = true; setFlow(k); };
  const open360 = (k) => window.dispatchEvent(new CustomEvent('medix:open', { detail: { tab: 'components', comp: k } }));
  const F = FLOWS[flow];

  return (
    <div className="split">
      <div className="viewer" ref={host}>
        <div className="viewer-title">
          <div className="label">Component layout and powertrain</div>
          <h2>MEDIX<span>·</span>4</h2>
        </div>
        <div className="flowbar" style={{ '--fc': F.color }}>
          {F.steps.map(([id, txt], i) => (
            <React.Fragment key={i}>
              {i > 0 && <i className="flow-arrow" />}
              <span className={'flow-step' + (i === step ? ' on' : '')}><em>{i + 1}</em>{txt}</span>
            </React.Fragment>
          ))}
        </div>
        <div className="viewer-hint">DRAG TO ORBIT · SCROLL TO ZOOM · TAP A NUMBER</div>
      </div>
      <aside className="side">
        <div className="card">
          <h3>Power flow</h3>
          <div className="seg">
            {Object.entries(FLOWS).map(([k, f]) => <button key={k} className={flow === k ? 'on' : ''} onClick={() => chooseFlow(k)}>{f.label}</button>)}
          </div>
          <div className="keys">
            {Object.entries({ hv: 'DC 51.2 V', ac: '3-phase AC', lv: '12 V', solar: 'Solar', charge: 'Charging' }).map(([k, l]) => (
              <span key={k} className={'key' + (F.lines[k] ? ' on' : '')}><i style={{ background: k === 'hv' && flow === 'regen' ? '#4d8dff' : LINE_COL[k] }} />{l}</span>
            ))}
          </div>
        </div>
        <div className="card">
          <h3>Component legend</h3>
          <ol className="legend">
            {LEGEND.map(([id, label, sub, comp], i) => (
              <li key={id}>
                <button className={sel === id ? 'on' : ''} onClick={() => S.current.select(sel === id ? null : id)}>
                  <span className="lg-num">{i + 1}</span>
                  <span className="lg-txt"><b>{label}</b><small>{sub}</small></span>
                </button>
                {comp && sel === id && <button className="open360" onClick={() => open360(comp)}>Open 360° view →</button>}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function makeSolar() {
  const g = new THREE.Group();
  const w = 1.7, d = 1.1;
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.04, d + 0.06), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.8, roughness: 0.3 }));
  g.add(frame);
  const tex = canvasTex(512, 330, (x) => {
    x.fillStyle = '#0b1a33'; x.fillRect(0, 0, 512, 330);
    for (let i = 0; i < 10; i++) for (let j = 0; j < 6; j++) {
      const gx = 6 + i * 50.5, gy = 6 + j * 53.5;
      const gr = x.createLinearGradient(gx, gy, gx + 46, gy + 48); gr.addColorStop(0, '#1f4485'); gr.addColorStop(1, '#0d2147');
      x.fillStyle = gr; x.fillRect(gx, gy, 46, 49);
      x.strokeStyle = 'rgba(160,190,230,0.35)'; x.beginPath(); x.moveTo(gx + 15, gy); x.lineTo(gx + 15, gy + 49); x.moveTo(gx + 31, gy); x.lineTo(gx + 31, gy + 49); x.stroke();
    }
  });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.15, metalness: 0.4 }));
  panel.rotation.x = -Math.PI / 2; panel.position.y = 0.025;
  g.add(panel);
  return g;
}
