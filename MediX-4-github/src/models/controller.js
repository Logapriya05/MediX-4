import * as THREE from 'three';
import { mats, rbox, mesh, bolt, cable, canvasTex, highlighter } from './kit.js';

// FOC motor controller / inverter. X = length, Y = up, Z = depth. Metres.
export function buildController() {
  const K = mats();
  const g = new THREE.Group();
  const L = 0.32, D = 0.22, H = 0.075, T = 0.008;
  const parts = { mcu: [], speed: [], torque: [], sensor: [], harness: [], can: [], mosfet: [], protect: [], dcin: [], ac: [], caps: [], heatsink: [] };

  // --- enclosure tray with mounting ears and external fins
  mesh(rbox(L, 0.01, D, 0.008), K.blueCast, g, [0, 0.005, 0]);
  const walls = [];
  walls.push(mesh(rbox(L, H, T, 0.003), K.blueCast, g, [0, H / 2 + 0.005, -D / 2 + T / 2]));
  walls.push(mesh(rbox(L, H, T, 0.003), K.blueCast, g, [0, H / 2 + 0.005, D / 2 - T / 2]));
  walls.push(mesh(rbox(T, H, D, 0.003), K.blueCast, g, [-L / 2 + T / 2, H / 2 + 0.005, 0]));
  walls.push(mesh(rbox(T, H, D, 0.003), K.blueCast, g, [L / 2 - T / 2, H / 2 + 0.005, 0]));
  parts.heatsink.push(...walls);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const ear = mesh(rbox(0.04, 0.008, 0.03, 0.004), K.blueCast, g, [sx * (L / 2 + 0.012), 0.004, sz * (D / 2 - 0.03)]);
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.01, 16), K.darkSteel, g, [sx * (L / 2 + 0.018), 0.005, sz * (D / 2 - 0.03)]);
    void ear;
  }
  // fins on the back wall
  for (let i = 0; i < 22; i++) {
    const f = mesh(rbox(0.004, H - 0.01, 0.024, 0.001), K.blueCast, g, [-L / 2 + 0.012 + i * ((L - 0.024) / 21), H / 2 + 0.005, -D / 2 - 0.012]);
    parts.heatsink.push(f);
  }

  // --- lid (finned), lifts / fades
  const lidG = new THREE.Group(); g.add(lidG);
  const lidMat = K.blueCast.clone(); lidMat.transparent = true;
  const lidParts = [mesh(rbox(L + 0.006, 0.008, D + 0.006, 0.006), lidMat, lidG, [0, H + 0.009, 0])];
  for (let i = 0; i < 16; i++) lidParts.push(mesh(rbox(L - 0.03, 0.02, 0.004, 0.001), lidMat, lidG, [0, H + 0.023, -D / 2 + 0.02 + i * ((D - 0.04) / 15)]));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) lidParts.push(bolt(lidG, [sx * (L / 2 - 0.012), H + 0.014, sz * (D / 2 - 0.012)], 0.006));
  lidParts.forEach((p) => { if (p.material !== lidMat) { p.material = p.material.clone(); p.material.transparent = true; } });
  parts.heatsink.push(lidParts[0]);

  // --- PCB
  const PY = 0.028;
  const pcbTex = canvasTex(1024, 704, (x, w, h) => {
    x.fillStyle = '#17702f'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(222,196,110,0.6)';
    for (let i = 0; i < 160; i++) {
      x.lineWidth = Math.random() < 0.2 ? 5 : 2;
      x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py);
      for (let k = 0; k < 4; k++) { if (k % 2) px += (Math.random() - 0.5) * 260; else py += (Math.random() - 0.5) * 200; x.lineTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 300; i++) { x.fillStyle = 'rgba(230,210,140,0.8)'; x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 3, 0, 7); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '700 30px Arial'; x.fillText('MEDIX-4  FOC INVERTER  REV C', 30, h - 26);
  });
  const pcbM = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.45, metalness: 0.1 });
  mesh(rbox(L - 0.03, 0.003, D - 0.03, 0.002), pcbM, g, [0, PY, 0]);
  const top = PY + 0.0015;

  // MCU with marking
  const mcuTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#1c1d20'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#d9dade'; x.font = '700 54px Arial'; x.fillText('ARM', 34, 90);
    x.font = '500 40px Arial'; x.fillText('Cortex', 34, 140); x.fillText('Madix-4', 34, 190);
    x.beginPath(); x.arc(220, 222, 10, 0, 7); x.strokeStyle = '#888'; x.lineWidth = 3; x.stroke();
  });
  const mcuTop = new THREE.MeshStandardMaterial({ map: mcuTex, roughness: 0.4 });
  const mcu = new THREE.Mesh(rbox(0.042, 0.005, 0.042, 0.0015), [K.plasticBlack, K.plasticBlack, mcuTop, K.plasticBlack, K.plasticBlack, K.plasticBlack]);
  mcu.position.set(-0.045, top + 0.0025, -0.005); mcu.castShadow = true; g.add(mcu);
  mcu.material[2].map.rotation = 0;
  // pins around the MCU
  for (let i = 0; i < 10; i++) for (const s of [-1, 1]) {
    mesh(rbox(0.0015, 0.001, 0.004, 0.0002), K.steel, g, [-0.045 - 0.017 + i * 0.0038, top + 0.0005, -0.005 + s * 0.023]);
    mesh(rbox(0.004, 0.001, 0.0015, 0.0002), K.steel, g, [-0.045 + s * 0.023, top + 0.0005, -0.005 - 0.017 + i * 0.0038]);
  }
  parts.mcu.push(mcu);
  // crystal + small logic chips
  mesh(rbox(0.012, 0.004, 0.005, 0.002), K.steel, g, [-0.075, top + 0.002, -0.03]);
  const speed = mesh(rbox(0.018, 0.003, 0.014, 0.001), K.plasticBlack, g, [-0.085, top + 0.0015, 0.03]);
  parts.speed.push(speed);
  const torque = mesh(rbox(0.02, 0.006, 0.016, 0.002), K.plasticBlack, g, [0.01, top + 0.003, -0.07]);
  mesh(rbox(0.012, 0.004, 0.012, 0.001), K.plasticGrey, g, [0.01, top + 0.0075, -0.07]);
  parts.torque.push(torque);
  for (let i = 0; i < 14; i++) mesh(rbox(0.004, 0.002, 0.002, 0.0005), i % 3 ? K.plasticGrey : K.brass, g, [-0.11 + (i % 7) * 0.008, top + 0.001, -0.06 + Math.floor(i / 7) * 0.01]);
  // sensor feedback header (white) + harness header
  const sensor = mesh(rbox(0.045, 0.012, 0.012, 0.001), K.plasticWhite, g, [-0.095, top + 0.006, -0.045]);
  for (let i = 0; i < 8; i++) mesh(rbox(0.002, 0.008, 0.002, 0.0003), K.brass, g, [-0.114 + i * 0.0055, top + 0.01, -0.045]);
  parts.sensor.push(sensor);
  const hdr = mesh(rbox(0.05, 0.012, 0.012, 0.001), K.plasticWhite, g, [-0.1, top + 0.006, 0.065]);
  parts.harness.push(hdr);

  // MOSFET column on a copper bar + busbars
  const mosG = new THREE.Group(); g.add(mosG);
  mesh(rbox(0.012, 0.03, D - 0.05, 0.002), K.alu, mosG, [0.028, top + 0.015, 0]);
  for (let i = 0; i < 6; i++) {
    const z = -0.072 + i * 0.029;
    const body = mesh(rbox(0.006, 0.024, 0.018, 0.001), K.plasticBlack, mosG, [0.038, top + 0.016, z]);
    mesh(rbox(0.002, 0.03, 0.018, 0.0005), K.steel, mosG, [0.034, top + 0.019, z]);
    for (const dz of [-0.005, 0, 0.005]) mesh(rbox(0.001, 0.006, 0.0015, 0.0002), K.steel, mosG, [0.039, top + 0.003, z + dz]);
    parts.mosfet.push(body);
  }
  parts.mosfet.push(mosG);
  const bus1 = mesh(rbox(0.012, 0.004, D - 0.05, 0.001), K.copper, g, [0.06, top + 0.02, 0]);
  const bus2 = mesh(rbox(0.012, 0.004, D - 0.05, 0.001), K.copper, g, [0.078, top + 0.026, 0]);
  for (let i = 0; i < 5; i++) { bolt(g, [0.06, top + 0.023, -0.07 + i * 0.035], 0.0045); bolt(g, [0.078, top + 0.029, -0.07 + i * 0.035], 0.0045); }
  mesh(rbox(0.004, 0.02, 0.004, 0.001), K.copper, g, [0.06, top + 0.01, -0.08]);
  mesh(rbox(0.004, 0.026, 0.004, 0.001), K.copper, g, [0.078, top + 0.013, 0.08]);
  parts.dcin.push(bus1, bus2);

  // DC-link capacitors
  const capMat = new THREE.MeshStandardMaterial({ color: 0xd9741c, roughness: 0.4, metalness: 0.2 });
  const capBlue = new THREE.MeshStandardMaterial({ color: 0x2c4fa8, roughness: 0.4, metalness: 0.2 });
  for (let i = 0; i < 6; i++) {
    const z = -0.075 + i * 0.03;
    const blue = i === 4;
    const r = blue ? 0.013 : 0.012;
    const c = mesh(new THREE.CylinderGeometry(r, r, 0.034, 24), blue ? capBlue : capMat, g, [0.105, top + 0.017, z]);
    mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, 0.002, 24), K.steel, g, [0.105, top + 0.035, z]);
    parts.caps.push(c);
  }
  // protection logic chips near the power stage
  const prot1 = mesh(rbox(0.016, 0.004, 0.012, 0.001), K.plasticBlack, g, [0.125, top + 0.002, -0.085]);
  const prot2 = mesh(rbox(0.016, 0.004, 0.012, 0.001), K.plasticBlack, g, [-0.01, top + 0.002, 0.07]);
  const shunt = mesh(rbox(0.02, 0.003, 0.006, 0.001), K.steel, g, [0.0, top + 0.002, 0.045]);
  parts.protect.push(prot1, prot2, shunt);

  // --- DC input studs (+ red, − black) and cables out of the right wall
  const RX = L / 2;
  const plus = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 20), K.red, g, [RX + 0.012, 0.05, -0.07], [0, 0, Math.PI / 2]);
  const minus = mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.03, 20), K.plasticBlack, g, [RX + 0.012, 0.05, -0.04], [0, 0, Math.PI / 2]);
  const cR = cable(g, [[RX + 0.025, 0.05, -0.07], [RX + 0.08, 0.06, -0.085], [RX + 0.16, 0.09, -0.1]], 0.008, K.red);
  const cB = cable(g, [[RX + 0.025, 0.05, -0.04], [RX + 0.08, 0.05, -0.045], [RX + 0.16, 0.07, -0.06]], 0.008, K.plasticBlack);
  parts.dcin.push(plus, minus, cR, cB);
  // --- 3-phase AC output lugs U V W
  const lugTex = (t) => canvasTex(64, 64, (x) => { x.fillStyle = '#c9a43f'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#222'; x.font = '700 40px Arial'; x.textAlign = 'center'; x.fillText(t, 32, 46); });
  ['U', 'V', 'W'].forEach((t, i) => {
    const z = 0.015 + i * 0.03;
    const lug = mesh(rbox(0.04, 0.003, 0.018, 0.002), [K.brass, K.brass, new THREE.MeshStandardMaterial({ map: lugTex(t), metalness: 0.9, roughness: 0.35 }), K.brass, K.brass, K.brass], g, [RX + 0.016, 0.045, z]);
    mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.006, 12), K.steel, g, [RX + 0.03, 0.048, z]);
    parts.ac.push(lug);
  });
  // phase cables
  const phaseCols = [0x2b2b2b, 0x8a5a2b, 0x7a7f86];
  [0, 1, 2].forEach((i) => parts.ac.push(cable(g, [[RX + 0.03, 0.05, 0.015 + i * 0.03], [RX + 0.07, 0.07, 0.02 + i * 0.03], [RX + 0.13, 0.1, 0.05 + i * 0.02]], 0.006, new THREE.MeshStandardMaterial({ color: phaseCols[i], roughness: 0.6 }))));

  // --- harness gland on the left wall: Accelerator, BMS, CAN wires
  const LX = -L / 2;
  const gland = mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.02, 24), K.plasticGrey, g, [LX - 0.01, 0.045, 0.04], [0, 0, Math.PI / 2]);
  const canConn = mesh(rbox(0.018, 0.03, 0.04, 0.004), K.plasticGrey, g, [LX - 0.009, 0.045, -0.04]);
  for (let i = 0; i < 4; i++) mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.006, 10), K.brass, g, [LX - 0.019, 0.04 + (i % 2) * 0.01, -0.05 + Math.floor(i / 2) * 0.02], [0, 0, Math.PI / 2]);
  parts.can.push(canConn);
  const wc = [0xff3b4a, 0x39c46a, 0x3b7bff, 0xf2c200, 0xffffff, 0x9b59ff];
  wc.forEach((c, i) => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55 });
    const dz = (i - 2.5) * 0.004;
    parts.harness.push(cable(g, [[-0.1 - 0.02 + i * 0.008, top + 0.012, 0.065], [-0.13, 0.05, 0.05 + dz], [LX + 0.004, 0.045, 0.04 + dz], [LX - 0.03, 0.045 + dz, 0.04], [LX - 0.08, 0.03 + dz * 2, 0.06 + dz * 3]], 0.0018, m, 30));
  });
  parts.harness.push(gland);

  const anchors = {
    mcu: [-0.045, top + 0.006, -0.005], speed: [-0.085, top + 0.004, 0.03], torque: [0.01, top + 0.01, -0.07], sensor: [-0.095, top + 0.013, -0.045],
    harness: [LX - 0.05, 0.045, 0.05], can: [LX - 0.018, 0.06, -0.04], mosfet: [0.038, top + 0.03, 0.0], protect: [0.125, top + 0.006, -0.085],
    dcin: [RX + 0.03, 0.05, -0.055], ac: [RX + 0.036, 0.05, 0.045], caps: [0.105, top + 0.036, 0.0], heatsink: [0.05, H / 2, -D / 2 - 0.024],
  };
  const hl = highlighter(parts);
  let mode = 'cutaway';
  const k = { lift: 0, fade: 0.12 };
  return {
    group: g, parts, size: 0.42,
    anchor(id) { return g.localToWorld(new THREE.Vector3(...anchors[id])); },
    setMode(m) { mode = m; },
    update(t, dt, sel) {
      const tg = { closed: { lift: 0, fade: 1 }, cutaway: { lift: 0, fade: 0 }, exploded: { lift: 0.16, fade: 1 } }[mode];
      k.lift += (tg.lift - k.lift) * Math.min(1, dt * 4);
      k.fade += (tg.fade - k.fade) * Math.min(1, dt * 5);
      lidG.position.y = k.lift;
      lidParts.forEach((p) => { p.material.opacity = k.fade; p.material.depthWrite = k.fade > 0.9; p.visible = k.fade > 0.03; });
      if (sel !== false) hl(sel, t, dt);
    },
  };
}

export const CONTROLLER_INFO = {
  name: 'Motor Controller',
  tag: 'FOC inverter · ARM Cortex',
  overview: 'The controller reads the accelerator, the Hall sensors and the BMS, then switches six MOSFETs thousands of times a second to turn 51.2 V DC into three-phase AC for the motor. It also runs regenerative braking and cuts power on any fault.',
  specs: [['Input', '51.2 V DC'], ['Peak current', '150–200 A (preliminary)'], ['Output', '3-phase AC (U, V, W)'], ['Control', 'FOC: speed + torque'], ['Processor', 'ARM Cortex MCU'], ['Switching', '6 × MOSFET bridge'], ['Comms', 'CAN bus'], ['Protection', 'OC · OT · OV · UV']],
  pins: [
    ['mcu', 'Integrated microcontroller', 'ARM Cortex, power-stage control'],
    ['speed', 'Speed control logic', 'Closed-loop rpm'],
    ['torque', 'Torque / current control', 'Phase current sensing'],
    ['sensor', 'Sensor feedback interface', 'Hall / position inputs'],
    ['harness', 'Accelerator · BMS · CAN harness', 'Signal wiring'],
    ['can', 'CAN communication interface', 'To BMS and dashboard'],
    ['mosfet', 'High-frequency MOSFETs (6×)', '3-phase bridge'],
    ['protect', 'Protection logic', 'OC · OT · OV · UV cut-out'],
    ['dcin', 'DC input (51.2 V)', '150–200 A peak range'],
    ['ac', '3-phase AC output', 'U · V · W to motor'],
    ['caps', 'DC-link capacitors', 'Smooth the supply ripple'],
    ['heatsink', 'Finned aluminium enclosure', 'Passive heat sink'],
  ],
};
