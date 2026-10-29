import * as THREE from 'three';
import { mats, rbox, mesh, bolt, cable, canvasTex, highlighter } from './kit.js';

// 51.2 V 100 Ah LFP pack (16S). Units: metres. X = length, Y = up, Z = depth.
export function buildBattery() {
  const K = mats();
  const g = new THREE.Group();
  const L = 0.92, D = 0.52, H = 0.25, T = 0.014;
  const parts = { cells: [], cell: [], bms: [], balance: [], hv: [], output: [], ac: [], panel: [], mount: [], enclosure: [] };
  const anim = [];

  // --- base flange & mounting points
  const flange = mesh(rbox(L + 0.1, 0.012, D + 0.1, 0.004), K.alu, g, [0, 0.006, 0]);
  parts.mount.push(flange);
  const holes = [];
  for (const sx of [-1, 1]) for (let i = 0; i < 6; i++) {
    const x = -L / 2 + 0.03 + i * ((L - 0.06) / 5);
    holes.push([x, 0.013, sx * (D / 2 + 0.032)]);
  }
  for (const sz of [-1, 1]) for (const z of [-0.12, 0.12]) holes.push([sz * (L / 2 + 0.032), 0.013, z]);
  holes.forEach((p) => {
    const ring = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.004, 16), K.darkSteel, g, p);
    const b = bolt(g, [p[0], p[1] + 0.004, p[2]], 0.0075);
    parts.mount.push(ring, b);
  });

  // --- enclosure walls
  const wallMat = K.alu;
  const back = mesh(rbox(L, H - 0.012, T, 0.003), wallMat, g, [0, 0.012 + (H - 0.012) / 2, -D / 2 + T / 2]);
  const front = mesh(rbox(L, H - 0.012, T, 0.003), wallMat.clone(), g, [0, 0.012 + (H - 0.012) / 2, D / 2 - T / 2]);
  const left = mesh(rbox(T, H - 0.012, D, 0.003), wallMat, g, [-L / 2 + T / 2, 0.012 + (H - 0.012) / 2, 0]);
  const right = mesh(rbox(T, H - 0.012, D, 0.003), wallMat, g, [L / 2 - T / 2, 0.012 + (H - 0.012) / 2, 0]);
  const floor = mesh(rbox(L - 0.01, 0.008, D - 0.01, 0.002), K.aluDark, g, [0, 0.016, 0]);
  parts.enclosure.push(back, left, right, front);
  void floor;
  // ribs on the outside of the long walls (cast look)
  for (let i = 0; i < 9; i++) {
    const x = -L / 2 + 0.07 + i * ((L - 0.14) / 8);
    mesh(rbox(0.012, H - 0.04, 0.006, 0.002), K.alu, g, [x, 0.02 + (H - 0.04) / 2, -D / 2 - 0.003]);
    const fr = mesh(rbox(0.012, H - 0.04, 0.006, 0.002), front.material, g, [x, 0.02 + (H - 0.04) / 2, D / 2 + 0.003]);
    fr.userData.frontRib = true;
    anim.push({ obj: fr, fade: true });
  }
  front.material.transparent = true;
  anim.push({ obj: front, fade: true });

  // --- lid with bolt ring
  const lidG = new THREE.Group();
  g.add(lidG);
  const lidMat = K.alu.clone(); lidMat.transparent = true;
  const lid = mesh(rbox(L + 0.012, 0.012, D + 0.012, 0.004), lidMat, lidG, [0, H + 0.006, 0]);
  // embossed label plate
  const plateTex = canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = '#1b1e22'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#39ff88'; x.lineWidth = 3; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = '#eef1f3'; x.font = '700 46px Arial'; x.fillText('MEDIX-4  TRACTION PACK', 26, 64);
    x.fillStyle = '#9aa3ab'; x.font = '500 28px Arial'; x.fillText('51.2 V  ·  100 Ah  ·  5.12 kWh  ·  LiFePO4 16S', 26, 112);
    x.fillStyle = '#ffb547'; x.font = '700 22px Arial'; x.fillText('⚠ HIGH VOLTAGE DC', 26, 145);
  });
  const plateMat = new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.5, metalness: 0.3, transparent: true });
  const plate = mesh(new THREE.PlaneGeometry(0.32, 0.1), plateMat, lidG, [-0.18, H + 0.0125, 0.05], [-Math.PI / 2, 0, 0]);
  const lidBolts = [];
  for (let i = 0; i < 10; i++) for (const sz of [-1, 1]) lidBolts.push(bolt(lidG, [-L / 2 + 0.02 + i * ((L - 0.04) / 9), H + 0.014, sz * (D / 2 - 0.007)], 0.0055));
  for (const sx of [-1, 1]) for (const z of [-0.15, 0, 0.15]) lidBolts.push(bolt(lidG, [sx * (L / 2 - 0.007), H + 0.014, z], 0.0055));
  lidBolts.forEach((b) => { b.material = b.material.clone(); b.material.transparent = true; });
  parts.enclosure.push(lid);
  anim.push({ obj: lidG, lift: 0.26, fade: true, fadeChildren: [lid, plate, ...lidBolts] });

  // --- cells
  const cellsG = new THREE.Group(); g.add(cellsG);
  const N = 16, pitch = 0.047, ct = 0.044, ch = 0.17, cd = 0.40, x0 = 0.04 - (N * pitch) / 2 + pitch / 2, y0 = 0.02;
  const labelTex = (green) => canvasTex(256, 256, (x, w, h) => {
    const base = green ? '#3a9b4a' : '#2f6fc4';
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.15)');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.font = '700 64px Arial'; x.textAlign = 'center';
    x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 2); x.fillText('3.2V', 0, 22); x.restore();
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.font = '500 18px Arial';
    x.save(); x.translate(w / 2 + 52, h / 2); x.rotate(-Math.PI / 2); x.fillText('LiFePO4 100Ah', 0, 0); x.restore();
  });
  const texBlue = labelTex(false), texGreen = labelTex(true);
  const plainBlue = new THREE.MeshPhysicalMaterial({ color: 0x2f6fc4, roughness: 0.35, metalness: 0.05, clearcoat: 0.6 });
  const plainGreen = new THREE.MeshPhysicalMaterial({ color: 0x3a9b4a, roughness: 0.35, metalness: 0.05, clearcoat: 0.6 });
  const topMat = new THREE.MeshStandardMaterial({ color: 0x2b2f35, roughness: 0.6 });
  const greens = new Set([4, 9, 10, 13]);
  for (let i = 0; i < N; i++) {
    const green = greens.has(i);
    const sideTex = new THREE.MeshPhysicalMaterial({ map: green ? texGreen : texBlue, roughness: 0.35, clearcoat: 0.6 });
    const plain = green ? plainGreen : plainBlue;
    const c = new THREE.Mesh(rbox(ct, ch, cd, 0.004), [plain, plain, topMat, plain, sideTex, sideTex]);
    c.position.set(x0 + i * pitch, y0 + ch / 2, 0);
    c.castShadow = c.receiveShadow = true;
    cellsG.add(c);
    parts.cells.push(c);
    if (i === 3) parts.cell.push(c);
    // terminals (+ red ring, - black ring), alternate orientation for series
    for (const [k, z] of [[0, -0.12], [1, 0.12]]) {
      const pos = (i % 2 === 0) === (k === 0);
      mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.01, 16), K.aluDark, cellsG, [x0 + i * pitch, y0 + ch + 0.005, z]);
      mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 16), pos ? K.red : K.plasticBlack, cellsG, [x0 + i * pitch, y0 + ch + 0.0015, z]);
    }
    // vent
    mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.002, 12), K.plasticGrey, cellsG, [x0 + i * pitch, y0 + ch + 0.001, 0]);
  }
  // end compression plates and straps
  for (const sx of [-1, 1]) mesh(rbox(0.012, ch + 0.01, cd + 0.02, 0.003), K.darkSteel, cellsG, [0.04 + sx * ((N * pitch) / 2 + 0.008), y0 + ch / 2, 0]);
  for (const z of [-cd / 2 - 0.006, cd / 2 + 0.006]) for (const y of [y0 + 0.04, y0 + ch - 0.04]) mesh(rbox(N * pitch + 0.03, 0.018, 0.003, 0.001), K.darkSteel, cellsG, [0.04, y, z]);
  // busbars (series links)
  const busY = y0 + ch + 0.012;
  for (let i = 0; i < N - 1; i++) {
    const z = i % 2 === 0 ? 0.12 : -0.12;
    const b = mesh(rbox(pitch + 0.03, 0.004, 0.034, 0.0015), K.copper, cellsG, [x0 + (i + 0.5) * pitch, busY, z]);
    bolt(cellsG, [x0 + i * pitch, busY + 0.003, z], 0.006);
    bolt(cellsG, [x0 + (i + 1) * pitch, busY + 0.003, z], 0.006);
    parts.cells.push(b);
  }

  // --- BMS board on standoffs above the right end of the stack
  const bmsG = new THREE.Group(); g.add(bmsG);
  const pcbTex = canvasTex(512, 384, (x, w, h) => {
    x.fillStyle = '#16692f'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(220,200,120,0.55)'; x.lineWidth = 2;
    for (let i = 0; i < 70; i++) { x.beginPath(); let px = Math.random() * w, py = Math.random() * h; x.moveTo(px, py); for (let k = 0; k < 3; k++) { if (Math.random() < 0.5) px += (Math.random() - 0.5) * 160; else py += (Math.random() - 0.5) * 160; x.lineTo(px, py); } x.stroke(); }
    x.fillStyle = '#d7d7cf'; x.font = '700 26px Arial'; x.fillText('BMS 16S · ACTIVE BALANCE', 20, 40);
  });
  const pcbMat = new THREE.MeshStandardMaterial({ map: pcbTex, roughness: 0.5, metalness: 0.1 });
  const bmsY = H - 0.03;
  const pcb = mesh(rbox(0.19, 0.003, 0.14, 0.001), [K.plasticBlack], bmsG, [0.31, bmsY, -0.02]);
  pcb.material = [pcbMat, pcbMat, pcbMat, pcbMat, pcbMat, pcbMat];
  for (const [dx, dz] of [[-0.085, -0.06], [0.085, -0.06], [-0.085, 0.06], [0.085, 0.06]]) mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 8), K.brass, bmsG, [0.31 + dx, bmsY - 0.01, -0.02 + dz]);
  const chip = (x, z, w, d, m = K.plasticBlack) => mesh(rbox(w, 0.004, d, 0.001), m, bmsG, [x, bmsY + 0.0035, z]);
  chip(0.29, -0.03, 0.04, 0.04); chip(0.35, -0.04, 0.022, 0.022); chip(0.25, 0.02, 0.02, 0.03);
  for (let i = 0; i < 6; i++) chip(0.37, 0.0 + i * 0.012 - 0.03, 0.012, 0.008);
  const hdr = mesh(rbox(0.12, 0.012, 0.016, 0.001), K.plasticWhite, bmsG, [0.3, bmsY + 0.007, 0.035]);
  parts.bms.push(pcb, hdr);
  anim.push({ obj: bmsG, lift: 0.14 });

  // --- balancing (sense) wires from each busbar to the BMS header
  const balG = new THREE.Group(); bmsG.add(balG);
  const wireCols = [0xff3b4a, 0xffb547, 0xf2e14b, 0x39ff88, 0x4dc3ff, 0x8a6bff, 0xff7ad9, 0xffffff];
  for (let i = 0; i < N + 1; i++) {
    const x = x0 + Math.min(i, N - 1) * pitch - (i === N ? -0.01 : 0);
    const z = i % 2 === 0 ? -0.12 : 0.12;
    const tx = 0.25 + (i / N) * 0.1;
    const m = new THREE.MeshStandardMaterial({ color: wireCols[i % wireCols.length], roughness: 0.6 });
    const c = cable(balG, [[x, busY + 0.004, z], [x, busY + 0.02, z * 0.6], [Math.min(tx, x + 0.08) * 0.5 + tx * 0.5, bmsY - 0.006, 0.05], [tx, bmsY + 0.012, 0.035]], 0.0014, m, 24);
    parts.balance.push(c);
  }

  // --- high-current main leads to the output port + internal wiring at the left end
  const portX = L / 2 + 0.012;
  const lastX = x0 + (N - 1) * pitch, firstX = x0;
  const hvRed = cable(g, [[lastX, busY + 0.006, 0.12], [lastX + 0.03, busY + 0.035, 0.15], [L / 2 - 0.05, 0.16, 0.0], [portX - 0.02, 0.13, -0.08]], 0.009, K.red);
  const hvBlack = cable(g, [[firstX, busY + 0.006, -0.12], [firstX + 0.02, busY + 0.04, -0.2], [0.1, busY + 0.045, -0.215], [L / 2 - 0.06, 0.17, -0.18], [portX - 0.02, 0.13, -0.08]], 0.009, K.plasticBlack);
  const hvOrange = cable(g, [[firstX, busY + 0.006, 0.12], [firstX - 0.04, busY + 0.02, 0.16], [-L / 2 + 0.05, 0.12, 0.1], [-L / 2 + 0.02, 0.09, 0.08]], 0.008, K.orange);
  parts.hv.push(hvRed, hvBlack, hvOrange);
  // main fuse block in the left compartment
  const fuse = mesh(rbox(0.05, 0.03, 0.08, 0.004), K.plasticBlack, g, [-L / 2 + 0.05, 0.05, -0.05]);
  mesh(rbox(0.012, 0.012, 0.06, 0.002), K.brass, g, [-L / 2 + 0.05, 0.07, -0.05]);
  parts.hv.push(fuse);

  // --- output port (round HV connector) and AC charge port on the right end
  const outG = new THREE.Group(); g.add(outG);
  mesh(rbox(0.012, 0.09, 0.09, 0.006), K.plasticBlack, outG, [portX, 0.13, -0.08]);
  mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.04, 32), K.darkSteel, outG, [portX + 0.02, 0.13, -0.08], [0, 0, Math.PI / 2]);
  mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.042, 32), K.plasticBlack, outG, [portX + 0.022, 0.13, -0.08], [0, 0, Math.PI / 2]);
  for (const [dy, dz, m] of [[0.01, -0.01, K.red], [-0.01, 0.01, K.brass], [0.0, 0.012, K.brass]]) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.012, 12), m, outG, [portX + 0.044, 0.13 + dy, -0.08 + dz], [0, 0, Math.PI / 2]);
  parts.output.push(outG);
  const acG = new THREE.Group(); g.add(acG);
  mesh(rbox(0.016, 0.075, 0.075, 0.008), K.plasticGrey, acG, [portX + 0.002, 0.12, 0.1]);
  mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.02, 32), K.plasticBlack, acG, [portX + 0.012, 0.12, 0.1], [0, 0, Math.PI / 2]);
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 8), K.brass, acG, [portX + 0.023, 0.12 + Math.sin(a) * 0.012, 0.1 + Math.cos(a) * 0.012], [0, 0, Math.PI / 2]); }
  parts.ac.push(acG);
  const acCable = cable(g, [[portX - 0.01, 0.12, 0.1], [L / 2 - 0.08, 0.17, 0.14], [0.3, busY + 0.04, 0.2]], 0.006, K.orange);
  parts.ac.push(acCable);

  // --- serviceable access panel + high-current connectors on the left end
  const panelG = new THREE.Group(); g.add(panelG);
  mesh(rbox(0.006, 0.14, 0.26, 0.004), K.aluDark, panelG, [-L / 2 - 0.004, 0.125, -0.06]);
  for (const [dy, dz] of [[-0.06, -0.12], [0.06, -0.12], [-0.06, 0.0], [0.06, 0.0], [-0.06, 0.12], [0.06, 0.12]]) bolt(panelG, [-L / 2 - 0.009, 0.125 + dy, -0.06 + dz], 0.005, [0, 0, Math.PI / 2]);
  parts.panel.push(panelG);
  const conR = mesh(rbox(0.03, 0.04, 0.03, 0.004), K.red, g, [-L / 2 - 0.016, 0.1, 0.15]);
  const conG = mesh(rbox(0.03, 0.04, 0.03, 0.004), K.plasticGrey, g, [-L / 2 - 0.016, 0.1, 0.19]);
  parts.hv.push(conR, conG);

  // centre the model on its footprint
  g.position.y = 0;

  const anchors = {
    cells: [0.04, busY + 0.01, -0.03], cell: [x0 + 3 * pitch, y0 + 0.1, cd / 2 + 0.001], bms: [0.31, bmsY + 0.01, -0.02],
    balance: [0.1, busY + 0.02, -0.12], hv: [L / 2 - 0.06, 0.17, 0.02], output: [portX + 0.045, 0.13, -0.08], ac: [portX + 0.02, 0.12, 0.1],
    panel: [-L / 2 - 0.01, 0.17, -0.12], mount: [L / 2 + 0.032, 0.02, D / 2 + 0.032], enclosure: [-0.3, H - 0.004, -D / 2 + 0.002],
  };
  // anchors that move with animated groups
  const anchorParent = { bms: bmsG, balance: null };

  const hl = highlighter(parts);
  let mode = 'cutaway', k = { lift: 0, fade: 1 };
  const target = () => ({ closed: { lift: 0, fade: 1 }, cutaway: { lift: 0, fade: 0 }, exploded: { lift: 1, fade: 1 } })[mode];
  return {
    group: g,
    parts,
    size: 1.0,
    anchor(id) {
      const p = new THREE.Vector3(...anchors[id]);
      const par = anchorParent[id];
      if (par) p.y += par.position.y;
      return g.localToWorld(p);
    },
    setMode(m) { mode = m; },
    update(t, dt, sel) {
      const tg = target();
      k.lift += (tg.lift - k.lift) * Math.min(1, dt * 4);
      k.fade += (tg.fade - k.fade) * Math.min(1, dt * 5);
      for (const a of anim) {
        if (a.lift !== undefined) a.obj.position.y = a.lift * k.lift;
        if (a.fade) {
          const list = a.fadeChildren || [a.obj];
          // lid stays opaque when exploded
          const op = a.obj === lidG && mode === 'exploded' ? 1 : k.fade;
          list.forEach((o) => { o.material.opacity = op; o.material.depthWrite = op > 0.9; o.visible = op > 0.03; });
        }
      }
      if (sel !== false) hl(sel, t, dt);
    },
  };
}

export const BATTERY_INFO = {
  name: 'Underfloor Battery Pack',
  tag: '51.2 V · 100 Ah · LiFePO4 16S',
  overview: 'Sixteen 3.2 V lithium-iron-phosphate cells in series give the 51.2 V traction bus. The pack sits under the floor, which keeps the centre of gravity low on hill roads, and its BMS balances every cell.',
  specs: [['Chemistry', 'LiFePO4 (LFP)'], ['Nominal voltage', '51.2 V'], ['Capacity', '100 Ah'], ['Nominal energy', '5.12 kWh'], ['Architecture', '16S LFP'], ['Integrated BMS', 'Yes'], ['Mounting', 'Fixed / serviceable'], ['Position', 'Underfloor / low-chassis']],
  pins: [
    ['cells', '16S LFP cell arrangement', '16 × 3.2 V in series'],
    ['cell', '3.2 V prismatic cell', 'LiFePO4 · 100 Ah'],
    ['bms', 'Battery management system', 'Active cell balancing'],
    ['balance', 'Cell balancing wiring', 'Voltage sense per cell'],
    ['hv', 'High-current internal wiring', 'Main + / − leads, fuse'],
    ['output', 'Power output port', '51.2 V DC → controller, 150–200 A peak'],
    ['ac', 'AC charging port', 'From on-board charger'],
    ['panel', 'Serviceable access panel', 'Fuse and contactor access'],
    ['mount', 'Underfloor mounting points', 'Fixed to low chassis'],
    ['enclosure', 'Aluminium enclosure', 'Sealed, bolted lid'],
  ],
};
