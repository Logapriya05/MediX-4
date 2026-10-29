import * as THREE from 'three';
import { mats, rbox, mesh, bolt, gear, canvasTex, highlighter } from './kit.js';

// Annular sector (tube wall) along X. Angle measured from +Z toward +Y.
// Built by hand so full rings and cut-away sectors both shade correctly.
function ringSector(rO, rI, a0, a1, len, seg = 48) {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  const n = Math.max(4, Math.round(seg * (a1 - a0) / (Math.PI * 2)));
  const P = [], N = [], I = [];
  let v = 0;
  const x0 = -len / 2, x1 = len / 2;
  const pt = (x, r, a) => [x, Math.sin(a) * r, Math.cos(a) * r];
  // curved surfaces (outer faces out, inner faces in)
  for (const [r, sgn] of [[rO, 1], [rI, -1]]) {
    const base = v;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      for (const x of [x0, x1]) { P.push(...pt(x, r, a)); N.push(0, Math.sin(a) * sgn, Math.cos(a) * sgn); v++; }
    }
    for (let i = 0; i < n; i++) {
      const p = base + i * 2;
      if (sgn > 0) I.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      else I.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  // end annuli
  for (const [x, sx] of [[x0, -1], [x1, 1]]) {
    const base = v;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      P.push(...pt(x, rO, a)); N.push(sx, 0, 0);
      P.push(...pt(x, rI, a)); N.push(sx, 0, 0);
      v += 2;
    }
    for (let i = 0; i < n; i++) {
      const p = base + i * 2;
      if (sx > 0) I.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
      else I.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  // cut faces
  if (!full) {
    for (const [a, s2] of [[a0, -1], [a1, 1]]) {
      const nrm = [0, Math.sin(a + s2 * Math.PI / 2), Math.cos(a + s2 * Math.PI / 2)];
      const base = v;
      for (const [x, r] of [[x0, rI], [x1, rI], [x1, rO], [x0, rO]]) { P.push(...pt(x, r, a)); N.push(...nrm); v++; }
      if (s2 > 0) I.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else I.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setIndex(I);
  return g;
}

export function buildMotor() {
  const K = mats();
  const g = new THREE.Group();
  const CY = 0.2;                 // shaft height
  const R = 0.118, HL = 0.27;     // housing radius, housing length
  const HX0 = -0.17, HX1 = HX0 + HL, HXc = (HX0 + HX1) / 2;
  const parts = { housing: [], stator: [], rotor: [], hall: [], terminals: [], bms: [], aux: [], gearset: [], gearbox: [], output: [], fins: [] };
  const CUT0 = 0, CUT1 = Math.PI / 2;   // cut-away quadrant: front-top (+Z..+Y)

  // --- housing: full and cut-away variants (swap on mode)
  const housingFull = mesh(ringSector(R, R - 0.012, 0, Math.PI * 2, HL, 72), K.blueCast, g, [HXc, CY, 0]);
  const housingCut = mesh(ringSector(R, R - 0.012, CUT1, Math.PI * 2, HL, 72), K.blueCast, g, [HXc, CY, 0]);
  parts.housing.push(housingFull, housingCut);
  // fins
  const finsAll = [];
  const NF = 30;
  for (let i = 0; i < NF; i++) {
    const a = (i / NF) * Math.PI * 2;
    if (a > Math.PI * 1.32 && a < Math.PI * 1.68) continue; // underside, where the feet are
    const f = mesh(rbox(HL - 0.03, 0.022, 0.006, 0.002), K.blueCast, g, [HXc, CY + Math.sin(a) * (R + 0.009), Math.cos(a) * (R + 0.009)]);
    f.rotation.x = Math.PI / 2 - a;
    f.userData.cutHide = a > CUT0 - 0.05 && a < CUT1 + 0.05;
    finsAll.push(f);
  }
  parts.fins.push(...finsAll);
  // feet and base
  for (const x of [HX0 + 0.05, HX1 - 0.05]) {
    mesh(rbox(0.05, CY - 0.06, 0.2, 0.006), K.blueCast, g, [x, (CY - 0.06) / 2 + 0.012, 0]);
    mesh(rbox(0.08, 0.012, 0.26, 0.004), K.blueCast, g, [x, 0.006, 0]);
    for (const z of [-0.11, 0.11]) bolt(g, [x, 0.016, z], 0.008);
  }
  // left end bell (closed and cut variants)
  const bellG = new THREE.Group(); g.add(bellG);
  const bellFull = mesh(ringSector(R + 0.004, 0.022, 0, Math.PI * 2, 0.026, 72), K.blueCast, bellG, [HX0 - 0.013, CY, 0]);
  const bellCut = mesh(ringSector(R + 0.004, 0.022, CUT1, Math.PI * 2, 0.026, 72), K.blueCast, bellG, [HX0 - 0.013, CY, 0]);
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 32), K.blueCast, bellG, [HX0 - 0.035, CY, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; bolt(bellG, [HX0 - 0.028, CY + Math.sin(a) * (R - 0.012), Math.cos(a) * (R - 0.012)], 0.007, [0, 0, Math.PI / 2]); }
  parts.housing.push(bellFull, bellCut);

  // --- stator: laminated core (cut sector) + copper slot windings + end turns
  const SL = 0.17, SO = R - 0.012, SI = 0.066;
  const statorFull = mesh(ringSector(SO, SI, 0, Math.PI * 2, SL, 72), K.lamination, g, [HXc + 0.005, CY, 0]);
  const statorCut = mesh(ringSector(SO, SI, CUT1, Math.PI * 2, SL, 72), K.lamination, g, [HXc + 0.005, CY, 0]);
  // lamination lines on the cut faces (thin rings)
  for (let i = 0; i < 18; i++) {
    const r = mesh(ringSector(SO + 0.0004, SI - 0.0004, CUT1, Math.PI * 2, 0.0015, 48), K.darkSteel, g, [HXc + 0.005 - SL / 2 + 0.005 + i * (SL - 0.01) / 17, CY, 0]);
    r.userData.cutOnly = true;
    parts.stator.push(r);
  }
  const coils = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const c = mesh(rbox(SL + 0.004, 0.02, 0.012, 0.003), K.copperWire, g, [HXc + 0.005, CY + Math.sin(a) * (SI + 0.016), Math.cos(a) * (SI + 0.016)]);
    c.rotation.x = Math.PI / 2 - a;
    coils.push(c);
  }
  const endTurns = [];
  for (const sx of [-1, 1]) endTurns.push(mesh(new THREE.TorusGeometry(SI + 0.018, 0.016, 12, 48), K.copperWire, g, [HXc + 0.005 + sx * (SL / 2 + 0.012), CY, 0], [0, Math.PI / 2, 0]));
  parts.stator.push(statorFull, statorCut, ...coils, ...endTurns);

  // --- rotor with surface magnets + shaft (spins)
  const rotorG = new THREE.Group(); rotorG.position.set(0, CY, 0); g.add(rotorG);
  const spin = new THREE.Group(); rotorG.add(spin);
  mesh(new THREE.CylinderGeometry(0.058, 0.058, SL - 0.01, 48), K.lamination, spin, [HXc + 0.005, 0, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const mg = mesh(rbox(SL - 0.02, 0.006, 0.04, 0.002), i % 2 ? K.magnet : new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 1, roughness: 0.18 }), spin, [HXc + 0.005, Math.sin(a) * 0.061, Math.cos(a) * 0.061]);
    mg.rotation.x = Math.PI / 2 - a;
  }
  const shaft = mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.52, 24), K.steel, spin, [HX0 + 0.12, 0, 0], [0, 0, Math.PI / 2]);
  // keyway on left stub
  mesh(rbox(0.05, 0.006, 0.008, 0.001), K.darkSteel, spin, [HX0 - 0.09, 0.016, 0]);
  // bearings
  for (const x of [HX0 - 0.01, HX1 - 0.005]) mesh(new THREE.TorusGeometry(0.024, 0.008, 10, 28), K.steel, rotorG, [x, 0, 0], [0, Math.PI / 2, 0]);
  parts.rotor.push(spin);

  // --- Hall-effect sensor board near the right end (visible in the cut)
  const hallG = new THREE.Group(); g.add(hallG);
  const hallPcb = mesh(ringSector(0.05, 0.03, 0.05, 1.5, 0.003, 24), new THREE.MeshStandardMaterial({ color: 0x16692f, roughness: 0.5 }), hallG, [HX1 - 0.03, CY, 0]);
  for (const a of [0.35, 0.8, 1.25]) mesh(rbox(0.008, 0.012, 0.006, 0.001), K.plasticBlack, hallG, [HX1 - 0.036, CY + Math.sin(a) * 0.04, Math.cos(a) * 0.04]);
  parts.hall.push(hallG);
  void hallPcb;

  // --- terminal box (front-lower) with 3-phase terminals, BMS comm port, accessory outlet
  const tbG = new THREE.Group(); g.add(tbG);
  const ta = -0.55; // angle below the front
  const tr = R + 0.03;
  tbG.position.set(HX0 + 0.075, CY + Math.sin(ta) * tr, Math.cos(ta) * tr);
  tbG.rotation.x = -ta;
  mesh(rbox(0.12, 0.08, 0.06, 0.006), K.blueCast, tbG, [0, 0, 0]);
  mesh(rbox(0.11, 0.07, 0.006, 0.003), K.blueCast, tbG, [0, 0, 0.032]);
  const term = [];
  for (const dx of [-0.035, 0.0]) {
    term.push(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.026, 24), K.darkSteel, tbG, [dx, 0.012, 0.045], [Math.PI / 2, 0, 0]));
    term.push(mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.028, 16), K.plasticBlack, tbG, [dx, 0.012, 0.047], [Math.PI / 2, 0, 0]));
  }
  parts.terminals.push(...term);
  const bmsPort = mesh(rbox(0.04, 0.022, 0.016, 0.003), K.plasticGrey, tbG, [0.033, 0.016, 0.041]);
  for (let i = 0; i < 3; i++) mesh(rbox(0.006, 0.008, 0.004, 0.001), K.brass, tbG, [0.022 + i * 0.011, 0.016, 0.05]);
  parts.bms.push(bmsPort);
  const aux = mesh(rbox(0.04, 0.02, 0.016, 0.003), K.plasticBlack, tbG, [0.033, -0.016, 0.041]);
  for (let i = 0; i < 2; i++) mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 10), K.brass, tbG, [0.026 + i * 0.014, -0.016, 0.05], [Math.PI / 2, 0, 0]);
  parts.aux.push(aux);
  const nameTex = canvasTex(256, 96, (x, w, h) => { x.fillStyle = '#c9ced3'; x.fillRect(0, 0, w, h); x.fillStyle = '#111'; x.font = '700 26px Arial'; x.fillText('MEDIX-4 PMSM', 14, 36); x.font = '500 18px Arial'; x.fillText('5 kW cont · 8 kW pk · 51.2 V', 14, 66); x.fillText('IP55 · Air cooled', 14, 88); });
  mesh(new THREE.PlaneGeometry(0.075, 0.028), new THREE.MeshStandardMaterial({ map: nameTex, metalness: 0.6, roughness: 0.4 }), tbG, [-0.02, -0.022, 0.0356]);

  // right end bell (between motor and gearbox)
  const bellR = mesh(ringSector(R + 0.004, 0.022, 0, Math.PI * 2, 0.02, 72), K.blueCast, g, [HX1 + 0.01, CY, 0]);
  const bellRCut = mesh(ringSector(R + 0.004, 0.022, CUT1, Math.PI * 2, 0.02, 72), K.blueCast, g, [HX1 + 0.01, CY, 0]);
  parts.housing.push(bellR, bellRCut);

  // --- integrated gearbox (single-stage reduction) + output shaft
  // Gears turn about X, so the removable cover is the outer (+X) end face.
  const gbG = new THREE.Group(); g.add(gbG);
  const GX = HX1 + 0.068;
  const gbMat = K.blueCast.clone(); gbMat.transparent = true;
  const gbBack = mesh(rbox(0.085, 0.34, 0.22, 0.025), gbMat, gbG, [GX - 0.004, 0.172, 0]);
  const coverMat = K.blueCast.clone(); coverMat.transparent = true;
  const cover = mesh(rbox(0.014, 0.33, 0.21, 0.02), coverMat, gbG, [GX + 0.045, 0.172, 0]);
  const coverBolts = [];
  for (const dy of [-0.14, 0, 0.14]) for (const dz of [-0.085, 0.085]) coverBolts.push(bolt(gbG, [GX + 0.054, 0.172 + dy, dz], 0.006, [0, 0, Math.PI / 2]));
  coverBolts.forEach((bb) => { bb.material = bb.material.clone(); bb.material.transparent = true; });
  // walls that stay in the cut-away view (motor side, back and floor) so the gears sit in an open box
  const gbShell = [
    mesh(rbox(0.012, 0.12, 0.22, 0.004), K.blueCast, gbG, [GX - 0.04, 0.066, 0]),
    mesh(rbox(0.085, 0.34, 0.012, 0.004), K.blueCast, gbG, [GX - 0.004, 0.172, -0.104]),
    mesh(rbox(0.085, 0.012, 0.22, 0.004), K.blueCast, gbG, [GX - 0.004, 0.008, 0]),
  ];
  parts.gearbox.push(gbBack, cover, ...gbShell);
  // gears (spin about X), inside the box
  const pinion = gear(0.038, 14, 0.03, K.steel, 0.018); pinion.rotation.y = Math.PI / 2;
  const pinG = new THREE.Group(); pinG.position.set(GX + 0.02, CY, 0); pinG.add(pinion); gbG.add(pinG);
  const bigR = 0.082;
  const big = gear(bigR, 30, 0.028, new THREE.MeshStandardMaterial({ color: 0xb98a4a, metalness: 1, roughness: 0.3 }), 0.02); big.rotation.y = Math.PI / 2;
  const OY = CY - (0.038 + bigR) + 0.006;
  const bigG = new THREE.Group(); bigG.position.set(GX + 0.02, OY, 0); bigG.add(big); gbG.add(bigG);
  [pinion, big].forEach((m) => { m.castShadow = true; });
  parts.gearset.push(pinG, bigG);
  // output shaft through the cover
  const outG = new THREE.Group(); outG.position.set(0, OY, 0); gbG.add(outG);
  const outSpin = new THREE.Group(); outG.add(outSpin);
  mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.18, 24), K.steel, outSpin, [GX + 0.1, 0, 0], [0, 0, Math.PI / 2]);
  mesh(rbox(0.06, 0.007, 0.009, 0.001), K.darkSteel, outSpin, [GX + 0.16, 0.02, 0]);
  mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 32), K.blueCast, outG, [GX + 0.06, 0, 0], [0, 0, Math.PI / 2]);
  parts.output.push(outSpin);

  const anchors = {
    housing: () => [HX0 + 0.06, CY + R + 0.02, -0.06], stator: () => [HXc + 0.04, CY + SI + 0.03, 0.02], rotor: () => [HXc - 0.02, CY + 0.045, 0.03],
    hall: () => [HX1 - 0.034, CY + 0.03, 0.025], terminals: () => [tbG.position.x - 0.017, tbG.position.y + 0.02, tbG.position.z + 0.05],
    bms: () => [tbG.position.x + 0.033, tbG.position.y + 0.02, tbG.position.z + 0.045], aux: () => [tbG.position.x + 0.033, tbG.position.y - 0.02, tbG.position.z + 0.05],
    gearset: () => [GX + 0.03 + gbG.position.x, CY + 0.03, 0.03], gearbox: () => [GX + gbG.position.x, 0.34, -0.06], output: () => [GX + 0.17 + gbG.position.x, OY, 0],
    fins: () => [HXc, CY - 0.02, -(R + 0.02)],
  };

  const hl = highlighter(parts);
  let mode = 'cutaway';
  const k = { cut: 1, ex: 0 };
  let ang = 0;
  return {
    group: g, parts, size: 0.75,
    anchor(id) { return g.localToWorld(new THREE.Vector3(...anchors[id]())); },
    setMode(m) { mode = m; },
    update(t, dt, sel) {
      const cutT = mode === 'closed' ? 0 : 1, exT = mode === 'exploded' ? 1 : 0;
      k.cut += (cutT - k.cut) * Math.min(1, dt * 6);
      k.ex += (exT - k.ex) * Math.min(1, dt * 4);
      const cutOn = k.cut > 0.5;
      housingFull.visible = !cutOn; housingCut.visible = cutOn;
      bellFull.visible = !cutOn; bellCut.visible = cutOn;
      bellR.visible = !cutOn; bellRCut.visible = cutOn;
      statorFull.visible = !cutOn; statorCut.visible = cutOn;
      finsAll.forEach((f) => { f.visible = !(cutOn && f.userData.cutHide); });
      parts.stator.forEach((s) => { if (s.userData.cutOnly) s.visible = cutOn; });
      // cut-away removes the gearbox cover and casing completely (no see-through veil)
      const op = 1 - k.cut;
      cover.material.opacity = op; cover.material.depthWrite = op > 0.9; cover.visible = op > 0.03;
      gbBack.material.opacity = op; gbBack.material.depthWrite = op > 0.9; gbBack.visible = op > 0.03;
      coverBolts.forEach((b) => { b.material.opacity = op; b.visible = op > 0.03; });
      // exploded offsets
      gbG.position.x = 0.2 * k.ex;
      bellG.position.x = -0.12 * k.ex;
      rotorG.position.x = -0.32 * k.ex;
      tbG.position.z = Math.cos(ta) * tr + 0.08 * k.ex;
      // spin: motor 1, output 14/30
      ang += dt * 9;
      spin.rotation.x = ang;
      pinion.rotation.x = 0; pinG.rotation.x = ang;
      bigG.rotation.x = -ang * (14 / 30) + 0.1;
      outSpin.rotation.x = -ang * (14 / 30);
      if (sel !== false) hl(sel, t, dt);
    },
  };
}

export const MOTOR_INFO = {
  name: 'Traction Motor',
  tag: 'BLDC / PMSM with integrated gearbox',
  overview: 'A permanent-magnet synchronous motor turns the controller\'s 3-phase current into torque from 0 rpm. A single-stage gearset reduces speed and multiplies torque before the output shaft drives the rear wheels.',
  specs: [['Motor type', 'BLDC / PMSM'], ['Nominal voltage', '51.2 V class'], ['Continuous power', '5 kW'], ['Peak power', '8 kW'], ['Cooling', 'Passive air-cooled'], ['Drive type', 'Rear-wheel drive (RWD)'], ['Reduction', 'Single-stage gearset']],
  pins: [
    ['housing', 'Cast aluminium housing', 'Structural motor body'],
    ['stator', 'Stationary stator (coils)', 'Copper windings, laminated core'],
    ['rotor', 'Rotating rotor', 'Permanent magnets'],
    ['hall', 'Hall-effect sensors', 'Rotor position feedback'],
    ['terminals', '3-phase power terminals', 'U · V · W from controller'],
    ['bms', 'BMS communication port', 'Temperature and status'],
    ['aux', 'Accessory power outlet', 'Low-voltage supply'],
    ['gearset', 'Single-stage reduction gearset', '14 : 30 tooth pair'],
    ['gearbox', 'Integrated gearbox', 'Sealed, oil-bath'],
    ['output', 'Output shaft to rear wheels', 'Via propeller shaft'],
    ['fins', 'Passive air-cooling fins', 'No pump or coolant'],
  ],
};
