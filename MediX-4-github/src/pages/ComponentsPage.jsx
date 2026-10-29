import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createViewer } from '../components/viewer.js';
import { PinLayer } from '../components/pins.js';
import { buildBattery, BATTERY_INFO } from '../models/battery.js';
import { buildMotor, MOTOR_INFO } from '../models/motor.js';
import { buildController, CONTROLLER_INFO } from '../models/controller.js';

const COMPONENTS = {
  battery: { info: BATTERY_INFO, build: buildBattery, offset: [0, 0, 0], view: [0.95, 0.75, 1.15], chain: 0 },
  controller: { info: CONTROLLER_INFO, build: buildController, offset: [0, 0, 0], view: [0.42, 0.36, 0.5], chain: 2 },
  motor: { info: MOTOR_INFO, build: buildMotor, offset: [-0.06, 0, 0], view: [0.62, 0.5, 0.82], chain: 3 },
};
const ORDER = [['battery', 'Battery'], ['controller', 'Controller'], ['motor', 'Motor']];
const CHAIN = ['Battery', 'BMS', 'Motor controller', 'Motor', 'Wheels'];
const MODES = [['cutaway', 'Cutaway'], ['closed', 'Closed'], ['exploded', 'Exploded']];

export default function ComponentsPage({ active }) {
  const host = useRef(null);
  const S = useRef({});
  const [comp, setComp] = useState(() => window.__medixComp || 'battery');
  const [mode, setMode] = useState('cutaway');
  const [sel, setSel] = useState(null);
  const [labels, setLabels] = useState(true);
  const [spin, setSpin] = useState(true);

  useEffect(() => {
    const v = createViewer(host.current, { target: [0, 0.12, 0], pos: [0.95, 0.75, 1.15], scale: 0.12 });
    v.controls.minDistance = 0.12; v.controls.maxDistance = 3;
    v.controls.zoomToCursor = true; // scroll zooms toward the part under the cursor
    v.controls.autoRotateSpeed = 1.1;
    const pins = new PinLayer(host.current, v.camera, { onSelect: (id) => S.current.select(id) });
    S.current.v = v; S.current.pins = pins;
    v.setFrame((dt, t) => {
      const m = S.current.model;
      if (m) m.update(t, dt, S.current.sel);
      pins.update();
    });
    return () => { pins.dispose(); v.dispose(); };
  }, []);

  // (re)build the selected component
  useEffect(() => {
    const st = S.current, v = st.v;
    if (!v) return;
    if (st.model) { v.scene.remove(st.model.group); st.model.group.traverse((o) => o.geometry && o.geometry.dispose()); }
    const C = COMPONENTS[comp];
    const m = C.build();
    m.group.position.set(...C.offset);
    v.scene.add(m.group);
    m.setMode(mode);
    st.model = m;
    st.sel = null; setSel(null);
    const box = new THREE.Box3().setFromObject(m.group);
    const c = box.getCenter(new THREE.Vector3());
    v.controls.autoRotate = spin;
    const kk = v.camera.aspect < 1 ? 1.7 : 1;
    v.focus([c.x, c.y, c.z], [c.x + C.view[0] * kk, c.y + C.view[1] * kk, c.z + C.view[2] * kk], 0.9);
    st.pins.set(C.info.pins.map(([id, label, sub], i) => ({ id, num: i + 1, label, sub, anchor: () => m.anchor(id) })), [m.group]);
    st.select = (id) => {
      st.sel = id; setSel(id); st.pins.select(id);
      if (!id) return;
      const a = m.anchor(id);
      const dir = v.camera.position.clone().sub(v.controls.target).normalize();
      const dist = Math.max(0.22, C.view[0] * 0.75);
      v.controls.autoRotate = false; setSpin(false);
      v.focus([a.x, a.y, a.z], [a.x + dir.x * dist, a.y + Math.max(0.05, dir.y * dist), a.z + dir.z * dist], 0.9);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp]);

  useEffect(() => {
    const h = (e) => { if (e.detail && e.detail.comp) setComp(e.detail.comp); };
    window.addEventListener('medix:open', h);
    return () => window.removeEventListener('medix:open', h);
  }, []);
  useEffect(() => { S.current.model && S.current.model.setMode(mode); }, [mode]);
  useEffect(() => { S.current.pins && S.current.pins.setVisible(labels); }, [labels]);
  useEffect(() => { if (S.current.v) S.current.v.controls.autoRotate = spin; }, [spin]);
  useEffect(() => { S.current.v && S.current.v.setActive(active); }, [active]);

  const C = COMPONENTS[comp];
  const I = C.info;
  const reset = () => {
    const st = S.current; st.select(null);
    const box = new THREE.Box3().setFromObject(st.model.group); const c = box.getCenter(new THREE.Vector3());
    const kk = st.v.camera.aspect < 1 ? 1.7 : 1;
    st.v.focus([c.x, c.y, c.z], [c.x + C.view[0] * kk, c.y + C.view[1] * kk, c.z + C.view[2] * kk], 0.9);
    setSpin(true);
  };
  return (
    <div className="split">
      <div className="viewer" ref={host}>
        <div className="viewer-title">
          <div className="label">Component · {I.tag}</div>
          <h2>{I.name}</h2>
        </div>
        <div className="vtools">
          <div className="seg mini">
            {MODES.map(([k, l]) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => setMode(k)}>{l}</button>)}
          </div>
          <div className="seg mini">
            <button className={labels ? 'on' : ''} onClick={() => setLabels(!labels)}>Labels</button>
            <button className={spin ? 'on' : ''} onClick={() => setSpin(!spin)}>360°</button>
            <button onClick={reset}>Reset</button>
          </div>
        </div>
        <div className="chain">
          {CHAIN.map((c, i) => (
            <React.Fragment key={c}>
              {i > 0 && <i className="chain-arrow" style={{ animationDelay: `${i * 0.25}s` }} />}
              <span className={'chain-node' + (i === C.chain ? ' on' : '')}>{c}</span>
            </React.Fragment>
          ))}
        </div>
      </div>
      <aside className="side">
        <div className="card">
          <div className="seg">
            {ORDER.map(([k, l]) => <button key={k} className={comp === k ? 'on' : ''} onClick={() => setComp(k)}>{l}</button>)}
          </div>
          <p className="overview">{I.overview}</p>
        </div>
        <div className="card">
          <h3>Specifications</h3>
          <div className="list">
            {I.specs.map(([a, b]) => <div className="list-row" key={a}><span>{a}</span><span>{b}</span></div>)}
          </div>
        </div>
        <div className="card">
          <h3>Parts<span className="pill ok">{I.pins.length}</span></h3>
          <ol className="legend">
            {I.pins.map(([id, label, sub], i) => (
              <li key={id}>
                <button className={sel === id ? 'on' : ''} onClick={() => S.current.select(sel === id ? null : id)}>
                  <span className="lg-num">{i + 1}</span>
                  <span className="lg-txt"><b>{label}</b><small>{sub}</small></span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
