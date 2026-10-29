import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, hex } from './geom.js';
import { mulberry32, smoothstep } from './util.js';

export const CHUNK = 64;

const BUILDING_COLS = ['#efe8da', '#f3d9b1', '#e7b9a5', '#cfe0e8', '#e9dc9a', '#c9e2c4', '#f1c7c7', '#d9d3e8', '#f6f1e9', '#e3cba0', '#bfd6d9'];
const HILL_WALL = ['#f4efe4', '#e8c56b', '#9fc7d9', '#e6a07a', '#d5e3b5', '#f2d0d0'];
const HILL_ROOF = ['#a8322b', '#2f6b3b', '#2c5aa0', '#7a2f2f', '#4b7a3f', '#8f8f8f'];
const TARP = ['#1f5fbf', '#e2541b', '#f2b705', '#0f8f5a', '#c81d6b', '#3c3c9a'];

// ------------------------------------------------------------- shared assets
export function makeSharedAssets(T) {
  const A = {};
  A.mat = {
    asphalt: new THREE.MeshStandardMaterial({ map: T.asphalt, roughness: 0.92, metalness: 0 }),
    paver: new THREE.MeshStandardMaterial({ map: T.paver, roughness: 0.9 }),
    kerb: new THREE.MeshStandardMaterial({ map: T.kerb, roughness: 0.8 }),
    gravel: new THREE.MeshStandardMaterial({ map: T.gravel, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ map: T.concrete, roughness: 0.9, vertexColors: true }),
    paint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    facade: new THREE.MeshStandardMaterial({ map: T.facade, vertexColors: true, roughness: 0.85 }),
    shops: new THREE.MeshStandardMaterial({ map: T.shops, roughness: 0.7, emissive: new THREE.Color('#2a1d10'), emissiveIntensity: 0.25 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }),
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }),
    foliage: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }),
    sign: new THREE.MeshStandardMaterial({ map: T.signHairpin, roughness: 0.6 }),
    milestone: new THREE.MeshStandardMaterial({ map: T.milestone, roughness: 0.8 }),
    wire: new THREE.LineBasicMaterial({ color: 0x151515 }),
  };

  const colored = (g, col) => {
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    const cc = hex(col);
    for (let i = 0; i < n; i++) { c[i * 3] = cc[0]; c[i * 3 + 1] = cc[1]; c[i * 3 + 2] = cc[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  const prep = (g) => { const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); return ng; };

  // Deodar / pine (unit height ~1)
  {
    const parts = [prep(colored(new THREE.CylinderGeometry(0.012, 0.022, 0.9, 6).translate(0, 0.45, 0), '#4a3526'))];
    const tiers = [[0.16, 0.2, 0.3], [0.29, 0.18, 0.27], [0.42, 0.155, 0.25], [0.54, 0.13, 0.23], [0.66, 0.1, 0.21], [0.77, 0.075, 0.19], [0.87, 0.045, 0.15]];
    tiers.forEach(([y, r, h], k) => parts.push(prep(colored(new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2 - 0.05, 0), ['#1d4428', '#22502f', '#1a3f25'][k % 3]))));
    A.pine = mergeGeometries(parts);
  }
  // Broadleaf (neem-like)
  {
    const parts = [prep(colored(new THREE.CylinderGeometry(0.035, 0.06, 0.5, 6).translate(0, 0.25, 0), '#5a4330'))];
    const blobs = [[0, 0.62, 0, 0.32], [0.2, 0.55, 0.1, 0.24], [-0.18, 0.56, -0.08, 0.25], [0.05, 0.78, -0.05, 0.24], [-0.05, 0.6, 0.2, 0.22]];
    blobs.forEach(([x, y, z, r], k) => parts.push(prep(colored(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), k % 2 ? '#3f6b2a' : '#4c7d31'))));
    A.broad = mergeGeometries(parts);
  }
  // Boulder
  A.rock = prep(colored(new THREE.IcosahedronGeometry(1, 0), '#77726a'));
  // Bush
  A.bush = prep(colored(new THREE.IcosahedronGeometry(1, 0).scale(1, 0.6, 1), '#3d6328'));
  // Parapet block (1 m long unit)
  A.block = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  // People variants
  A.people = ['#c0262d', '#f2f2f2', '#2a64b0', '#e09a1a', '#6b3fa0', '#1d8a5a'].map((cloth) => {
    const b = new Builder();
    const skin = hex('#8a5a3c'), dark = hex('#1d1d1d'), cl = hex(cloth), leg = hex('#2d2f38');
    b.box([0, 0, -0.1], [0.22, 0.85, 0.14], 0, leg);
    b.box([0, 0, 0.1], [0.22, 0.85, 0.14], 0, leg);
    b.box([0, 0.82, 0], [0.26, 0.68, 0.46], 0, cl);
    b.box([0, 1.5, 0], [0.22, 0.24, 0.2], 0, skin);
    b.box([0, 1.68, 0], [0.24, 0.08, 0.22], 0, dark);
    return b.geometry();
  });
  return A;
}

// ---------------------------------------------------------------- the chunk
export function buildChunk(ci, path, field, A, footprints) {
  const p = path;
  const i0 = ci * CHUNK;
  const i1 = Math.min(i0 + CHUNK, p.length - 2);
  if (i1 - i0 < 2 || i0 < p.base) return null;
  const q0 = i0 - p.base, q1 = i1 - p.base;
  const Ox = p.x[q0], Oy = p.y[q0], Oz = p.z[q0];
  const rnd = mulberry32(ci * 7919 + 17);
  const group = new THREE.Group();
  group.position.set(Ox, Oy, Oz);
  const ztype = (q) => p.zones[p.zid[q]].type;

  const P = (q, u, dy) => {
    const h = p.h[q];
    return [p.x[q] - Math.sin(h) * u - Ox, p.y[q] + dy - Oy, p.z[q] - Math.cos(h) * u - Oz];
  };
  // Generic ribbon between rows; normal = tangent x (B - A)
  const ribbon = (B, fa, fb, col, uvA = null, uvB = null, cond = null) => {
    for (let q = q0; q < q1; q++) {
      if (cond && !cond(q)) continue;
      const [ua, da] = fa(q), [ub, db] = fb(q);
      const [ua2, da2] = fa(q + 1), [ub2, db2] = fb(q + 1);
      const a = P(q, ua, da), a2 = P(q + 1, ua2, da2), b = P(q, ub, db), b2 = P(q + 1, ub2, db2);
      const s = q + p.base, s2 = s + 1;
      const c = typeof col === 'function' ? col(q) : col;
      B.quad(a, a2, b2, b, c,
        uvA ? uvA(q, s) : [0, 0], uvA ? uvA(q + 1, s2) : [0, 1],
        uvB ? uvB(q + 1, s2) : [1, 1], uvB ? uvB(q, s) : [1, 0]);
    }
  };
  const W = [1, 1, 1];

  // ---------------- asphalt
  const asp = new Builder();
  ribbon(asp, (q) => [-p.hw[q], 0], (q) => [p.hw[q], 0], W,
    (q, s) => [-p.hw[q] / 8, s / 8], (q, s) => [p.hw[q] / 8, s / 8]);
  // skirts
  ribbon(asp, (q) => [p.hw[q], 0], (q) => [p.hw[q], -1.0], W);
  ribbon(asp, (q) => [-p.hw[q], -1.0], (q) => [-p.hw[q], 0], W);
  addMesh(group, asp, A.mat.asphalt, false, true);

  // ---------------- sidewalks, kerbs, shoulders, median
  const kerb = new Builder(), pav = new Builder(), grav = new Builder(), conc = new Builder();
  const hasSW = (q) => p.sw[q] > 0.05 || p.sw[q + 1] > 0.05;
  for (const side of [1, -1]) {
    const hw = (q) => p.hw[q] * side, sw = (q) => (p.hw[q] + p.sw[q]) * side;
    const curb = (q) => p.curb[q];
    const kuv = (q, s) => [0, s / 2];
    const kuv2 = (q, s) => [1, s / 2];
    if (side > 0) {
      ribbon(kerb, (q) => [hw(q), 0], (q) => [hw(q), curb(q)], W, kuv, kuv2, hasSW);
      ribbon(pav, (q) => [hw(q), curb(q)], (q) => [sw(q), curb(q)], W, (q, s) => [hw(q) / 2.5, s / 2.5], (q, s) => [sw(q) / 2.5, s / 2.5], hasSW);
      ribbon(conc, (q) => [sw(q), curb(q)], (q) => [sw(q), -1], [0.7, 0.68, 0.64], null, null, hasSW);
    } else {
      ribbon(kerb, (q) => [hw(q), curb(q)], (q) => [hw(q), 0], W, kuv2, kuv, hasSW);
      ribbon(pav, (q) => [sw(q), curb(q)], (q) => [hw(q), curb(q)], W, (q, s) => [sw(q) / 2.5, s / 2.5], (q, s) => [hw(q) / 2.5, s / 2.5], hasSW);
      ribbon(conc, (q) => [sw(q), -1], (q) => [sw(q), curb(q)], [0.7, 0.68, 0.64], null, null, hasSW);
    }
    // gravel shoulder outside the sidewalk/asphalt
    const has = (q) => p.sh[q] - p.sw[q] > 0.05 || p.sh[q + 1] - p.sw[q + 1] > 0.05;
    const inner = (q) => (p.hw[q] + p.sw[q]) * side;
    const outer = (q) => (p.hw[q] + Math.max(p.sw[q], p.sh[q])) * side;
    if (side > 0) ribbon(grav, (q) => [inner(q), -0.03], (q) => [outer(q), -0.07], W, (q, s) => [inner(q) / 3, s / 3], (q, s) => [outer(q) / 3, s / 3], has);
    else ribbon(grav, (q) => [outer(q), -0.07], (q) => [inner(q), -0.03], W, (q, s) => [outer(q) / 3, s / 3], (q, s) => [inner(q) / 3, s / 3], has);
  }
  // median
  const hasMed = (q) => p.med[q] > 0.06 || p.med[q + 1] > 0.06;
  const mh = (q) => 0.24 * Math.min(1, p.med[q] / 0.6);
  ribbon(kerb, (q) => [p.med[q] / 2, mh(q)], (q) => [p.med[q] / 2, 0], W, (q, s) => [1, s / 2], (q, s) => [0, s / 2], hasMed);
  ribbon(kerb, (q) => [-p.med[q] / 2, 0], (q) => [-p.med[q] / 2, mh(q)], W, (q, s) => [0, s / 2], (q, s) => [1, s / 2], hasMed);
  ribbon(conc, (q) => [-p.med[q] / 2, mh(q)], (q) => [p.med[q] / 2, mh(q)], [0.42, 0.5, 0.3], null, null, hasMed);
  addMesh(group, kerb, A.mat.kerb, false, true);
  addMesh(group, pav, A.mat.paver, false, true);
  addMesh(group, grav, A.mat.gravel, false, true);
  addMesh(group, conc, A.mat.concrete, true, true);

  // ---------------- markings
  const mk = new Builder();
  const WHITE = [0.85, 0.85, 0.82], YEL = [0.85, 0.6, 0.05];
  const line = (uc, w, dashed, col, cond) => {
    for (let q = q0; q < q1; q++) {
      if (!cond(q)) continue;
      const s = q + p.base;
      if (dashed && (s % 7.5) >= 3) continue;
      const u = uc(q), u2 = uc(q + 1);
      const a = P(q, u - w / 2, 0.012), b = P(q, u + w / 2, 0.012);
      const a2 = P(q + 1, u2 - w / 2, 0.012), b2 = P(q + 1, u2 + w / 2, 0.012);
      mk.quad(a, a2, b2, b, col);
    }
  };
  const is = (...t) => (q) => t.includes(ztype(q));
  const hill = is('ghat', 'hairpin', 'descent');
  for (const sg of [1, -1]) {
    line((q) => sg * (p.med[q] / 2 + (p.hw[q] - p.med[q] / 2) / 2), 0.13, true, WHITE, is('city'));
    line((q) => sg * (p.hw[q] - 0.28), 0.15, false, WHITE, (q) => is('city')(q) || hill(q));
    line((q) => sg * (p.med[q] / 2 + 0.2), 0.12, false, YEL, (q) => ztype(q) === 'city' && p.med[q] > 0.4);
  }
  line(() => 0, 0.13, true, WHITE, (q) => {
    const t = ztype(q);
    if (t === 'market') return ((q + p.base) * 0.37 % 1) > 0.25 && p.med[q] < 0.1;
    if (t === 'hillstation') return true;
    if (hill(q)) return Math.abs(p.k[q]) < 1 / 90;
    return false;
  });
  line(() => 0, 0.13, false, YEL, (q) => hill(q) && Math.abs(p.k[q]) >= 1 / 90);
  addMesh(group, mk, A.mat.paint, false, true);

  // ---------------- roadside furniture
  const metal = new Builder(), plain = new Builder(), facade = new Builder(), shops = new Builder(), roofs = new Builder();
  const wires = [];
  const blocks = [];
  const local = (x, y, z) => [x - Ox, y - Oy, z - Oz];

  // Parapets on the valley side in hill zones
  for (let q = q0; q < q1; q += 3) {
    if (p.mtn[q] < 6) continue;
    const h = p.h[q];
    for (const side of [1, -1]) {
      const edge = p.hw[q] + Math.max(p.sw[q], p.sh[q]);
      let ty = 1e9;
      for (const pr of [3.5, 8]) ty = Math.min(ty, field.height(p.x[q] - Math.sin(h) * side * (edge + pr), p.z[q] - Math.cos(h) * side * (edge + pr)) + (pr > 4 ? 0.8 : 0));
      const sharp = Math.abs(p.k[q]) > 1 / 30 && Math.sign(p.k[q]) === -side; // outside of tight bend
      if (ty < p.y[q] - 1.1 || sharp) {
        const pos = P(q, side * (edge - 0.2), -0.05);
        blocks.push({ pos, rot: h, color: ((q + p.base) / 3) % 2 < 1 ? '#f2c80f' : '#1c1c1c' });
      }
    }
  }
  if (blocks.length) {
    const im = new THREE.InstancedMesh(A.block, A.mat.plain, blocks.length);
    const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(1.9, 0.62, 0.32), ps = new THREE.Vector3(), c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    blocks.forEach((b, k) => {
      qt.setFromAxisAngle(up, b.rot); ps.set(...b.pos);
      m.compose(ps, qt, sc); im.setMatrixAt(k, m); im.setColorAt(k, c.set(b.color));
    });
    im.castShadow = true; im.receiveShadow = true;
    // vertex colours absent on BoxGeometry -> use a dedicated material
    im.material = A.blockMat || (A.blockMat = new THREE.MeshStandardMaterial({ roughness: 0.7 }));
    group.add(im);
  }

  // Street lights on the city median, electric poles + wires elsewhere
  const POLE = 34;
  for (let s = Math.ceil(i0 / POLE) * POLE; s < i1; s += POLE) {
    const q = s - p.base;
    const t = ztype(q);
    if (t === 'city' && p.med[q] > 0.8) {
      const b = P(q, 0, 0.24), h = p.h[q];
      metal.cylinder([b[0], b[1] + 4.5, b[2]], 0.09, 9, 'y', 8, hex('#7d8186'), 0.06);
      for (const sd of [1, -1]) {
        const lx = -Math.sin(h) * sd, lz = -Math.cos(h) * sd;
        const tip = [b[0] + lx * 2.4, b[1] + 9.1, b[2] + lz * 2.4];
        metal.box([b[0] + lx * 1.2, b[1] + 8.85, b[2] + lz * 1.2], [0.08, 0.08, 2.4], h, hex('#7d8186'));
        metal.box([tip[0], tip[1] - 0.25, tip[2]], [0.7, 0.18, 0.32], h, hex('#d8d8d0'));
      }
    } else if (t === 'market' || t === 'narrow' || t === 'hillstation' || (s / POLE) % 3 === 0) {
      // utility poles on the left side
      const pole = (ss) => {
        const qq = Math.max(0, Math.min(p.x.length - 1, ss - p.base));
        const hw = p.hw[qq] + (p.sw[qq] > 0.3 ? p.sw[qq] - 0.4 : Math.max(p.sh[qq], 0.4) + 0.3);
        const h = p.h[qq];
        const wx = p.x[qq] - Math.sin(h) * hw, wz = p.z[qq] - Math.cos(h) * hw;
        const gy = Math.max(p.y[qq] + p.curb[qq], field.height(wx, wz)) - 0.1;
        return [wx, gy, wz, h];
      };
      const [wx, gy, wz, h] = pole(s);
      const b = local(wx, gy, wz);
      plain.box(b, [0.24, 9, 0.24], h, hex('#9a9a92'));
      plain.box([b[0], b[1] + 8.3, b[2]], [0.12, 0.12, 1.6], h, hex('#4a4a4a'));
      if (rnd() < 0.5) plain.box([b[0] - Math.sin(h) * 0.35, b[1] + 6.2, b[2] - Math.cos(h) * 0.35], [0.6, 0.7, 0.5], h, hex('#6c6f70'));
      // wires to next pole
      const [nx, ny, nz] = pole(s + POLE);
      if (Math.hypot(nx - wx, nz - wz) < POLE * 1.15) {
        for (const off of [-0.65, 0, 0.65]) {
          const sx = -Math.sin(h) * off, sz = -Math.cos(h) * off;
          let prev = null;
          for (let k = 0; k <= 10; k++) {
            const f = k / 10;
            const sag = 0.7 * 4 * f * (1 - f);
            const pt = local(wx + (nx - wx) * f + sx, gy + 8.35 + (ny - gy) * f - sag, wz + (nz - wz) * f + sz);
            if (prev) wires.push(...prev, ...pt);
            prev = pt;
          }
        }
      }
    }
  }
  if (wires.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    group.add(new THREE.LineSegments(g, A.mat.wire));
  }

  // Signs and milestones on hill roads
  for (let q = Math.max(q0, 1); q < q1; q++) {
    const kq = Math.abs(p.k[q]), kp = Math.abs(p.k[q - 1]);
    if (kq > 1 / 22 && kp <= 1 / 22 && p.mtn[q] > 6) {
      const qs = Math.max(0, q - 32);
      const pos = P(qs, p.hw[qs] + Math.max(p.sh[qs], 0.6) + 0.4, 0);
      addSign(metal, A, group, pos, p.h[qs], Ox, Oy, Oz);
    }
    if ((q + p.base) % 400 === 0 && p.mtn[q] > 6) {
      const pos = P(q, p.hw[q] + Math.max(p.sh[q], 0.6) + 0.5, -0.05);
      const g = new THREE.BoxGeometry(0.45, 0.75, 0.22);
      g.translate(0, 0.37, 0);
      const ms = new THREE.Mesh(g, [A.mat.plain, A.mat.plain, A.mat.plain, A.mat.plain, A.mat.milestone, A.mat.milestone]);
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count * 3).fill(0.9), 3));
      ms.position.set(...pos); ms.rotation.y = p.h[q] - Math.PI / 2; ms.castShadow = true;
      group.add(ms);
    }
  }

  // ---------------- buildings
  const placeBuildings = () => {
    for (const side of [1, -1]) {
      let s = i0 + rnd() * 4;
      while (s < i1) {
        const q = Math.floor(s) - p.base;
        const t = ztype(q);
        const prof = BPROF[t];
        if (!prof || rnd() > prof.prob) { s += prof ? prof.gap : 12; continue; }
        const w = prof.w[0] + rnd() * (prof.w[1] - prof.w[0]);
        const d = prof.d[0] + rnd() * (prof.d[1] - prof.d[0]);
        const sc = Math.floor(s + w / 2);
        if (sc >= p.length - 1) break;
        const qc = sc - p.base;
        const setback = prof.set[0] + rnd() * (prof.set[1] - prof.set[0]);
        const edge = p.hw[qc] + p.sw[qc] + setback;
        const h = p.h[qc];
        let ok = false, cx = 0, cz = 0;
        for (let push = 0; push < 4 && !ok; push++) {
          const lat = side * (edge + d / 2 + push * 0.7);
          cx = p.x[qc] - Math.sin(h) * lat; cz = p.z[qc] - Math.cos(h) * lat;
          ok = clearOfRoad(p, cx, cz, h, w, d, prof.clear) && !overlaps(footprints, cx, cz, h, w, d);
        }
        if (ok) {
          footprints.push({ cx, cz, rot: h, w, d });
          const hgt = prof.h[0] + Math.floor(rnd() * ((prof.h[1] - prof.h[0]) / 3.1)) * 3.1;
          makeBuilding({ facade, shops, roofs, plain, metal }, field, p, t, prof, rnd, cx, cz, h, w, d, hgt, side, Ox, Oy, Oz, qc);
          s += w + prof.gap * rnd();
        } else s += 4;
      }
    }
  };
  placeBuildings();
  // fill pass: corners on tight turns and gaps between lots in built-up zones
  for (let k = 0; k < 18; k++) {
    const q = q0 + Math.floor(rnd() * (q1 - q0));
    const t = ztype(q);
    const prof = BPROF[t];
    if (!prof || prof.prob < 0.5) continue;
    const side = rnd() < 0.5 ? 1 : -1;
    const w = prof.w[0] + rnd() * (prof.w[1] - prof.w[0]);
    const d = prof.d[0] + rnd() * (prof.d[1] - prof.d[0]);
    const h = p.h[q] + (rnd() < 0.3 ? (rnd() - 0.5) * 0.6 : 0);
    const lat = side * (p.hw[q] + p.sw[q] + prof.set[0] + d / 2 + rnd() * 9);
    const cx = p.x[q] - Math.sin(p.h[q]) * lat, cz = p.z[q] - Math.cos(p.h[q]) * lat;
    if (!clearOfRoad(p, cx, cz, h, w, d, prof.clear) || overlaps(footprints, cx, cz, h, w, d)) continue;
    footprints.push({ cx, cz, rot: h, w, d });
    const hgt = prof.h[0] + Math.floor(rnd() * ((prof.h[1] - prof.h[0]) / 3.1)) * 3.1;
    makeBuilding({ facade, shops, roofs, plain, metal }, field, p, t, prof, rnd, cx, cz, h, w, d, hgt, side, Ox, Oy, Oz, q);
  }
  addMesh(group, facade, A.mat.facade, true, true);
  addMesh(group, shops, A.mat.shops, false, true);
  addMesh(group, roofs, A.mat.concrete, true, true);
  addMesh(group, plain, A.mat.plain, true, true);
  addMesh(group, metal, A.mat.metal, true, false);

  // ---------------- vegetation, rocks, people
  const inst = { pine: [], broad: [], rock: [], bush: [], people: A.people.map(() => []) };
  const tryPlace = (kind, x, z, minE, scale, rot, col) => {
    const y = field.height(x, z);
    const e = field.out.e;
    if (e < minE) return false;
    // keep clear of every nearby road (incl. other legs of hairpins)
    const nn = p.nearest(x, z, 20);
    if (nn) {
      const qq = nn.i - p.base;
      if (nn.d < p.hw[qq] + Math.max(p.sw[qq], p.sh[qq]) + minE) return false;
    }
    if (overlapsPoint(footprints, x, z, scale * 0.25)) return false;
    inst[kind].push({ x, y: y - 0.15, z, scale, rot, col });
    return true;
  };
  for (let q = q0; q < q1; q += 2) {
    const t = ztype(q);
    const h = p.h[q];
    const dens = VEG[t];
    if (!dens) continue;
    for (let k = 0; k < dens.n; k++) {
      if (rnd() > dens.p) continue;
      const side = rnd() < 0.5 ? 1 : -1;
      const edge = p.hw[q] + Math.max(p.sw[q], p.sh[q]);
      const off = dens.e0 + Math.pow(rnd(), dens.pow) * (dens.e1 - dens.e0);
      const lat = side * (edge + off);
      const x = p.x[q] - Math.sin(h) * lat + (rnd() - 0.5) * 2, z = p.z[q] - Math.cos(h) * lat + (rnd() - 0.5) * 2;
      const r = rnd();
      if (r < dens.pine) { const sc = 10 + rnd() * 12; tryPlace('pine', x, z, 1.5 + sc * 0.2, sc, rnd() * 6.28, 0.75 + rnd() * 0.45); }
      else if (r < dens.pine + dens.broad) { const sc = 6 + rnd() * 6; tryPlace('broad', x, z, 1.5 + sc * 0.33, sc, rnd() * 6.28, 0.8 + rnd() * 0.4); }
      else if (r < dens.pine + dens.broad + dens.rock) tryPlace('rock', x, z, 1.5, 0.6 + rnd() * 1.8, rnd() * 6.28, 0.75 + rnd() * 0.4);
      else tryPlace('bush', x, z, 1.0, 0.6 + rnd() * 0.9, rnd() * 6.28, 0.8 + rnd() * 0.4);
    }
    // street trees on city sidewalks
    if ((t === 'city' || t === 'hillstation') && (q + p.base) % 23 === 0 && p.sw[q] > 2) {
      const side = rnd() < 0.5 ? 1 : -1;
      const pos = P(q, side * (p.hw[q] + p.sw[q] - 0.8), p.curb[q]);
      inst.broad.push({ x: pos[0] + Ox, y: pos[1] + Oy, z: pos[2] + Oz, scale: 6 + rnd() * 3, rot: rnd() * 6, col: 0.9 + rnd() * 0.2 });
    }
    // pedestrians
    const pp = PEOPLE[t] || 0;
    if (pp && p.sw[q] > 1.2 && rnd() < pp) {
      const side = rnd() < 0.5 ? 1 : -1;
      const u = side * (p.hw[q] + 0.5 + rnd() * (p.sw[q] - 0.9));
      const pos = P(q, u, p.curb[q]);
      const v = Math.floor(rnd() * A.people.length);
      inst.people[v].push({ x: pos[0] + Ox, y: pos[1] + Oy, z: pos[2] + Oz, scale: 0.92 + rnd() * 0.16, rot: rnd() * 6.28, col: 1 });
    }
    // market stalls / carts
    if (t === 'market' && rnd() < 0.07) {
      const side = rnd() < 0.5 ? 1 : -1;
      const pos = P(q, side * (p.hw[q] + p.sw[q] - 0.65), p.curb[q]);
      plain.box(pos, [1.8, 0.9, 1.1], h, hex('#7a5232'));
      const top = [pos[0], pos[1] + 0.9, pos[2]];
      for (let g = 0; g < 6; g++) plain.box([top[0] + (rnd() - 0.5) * 1.3, top[1], top[2] + (rnd() - 0.5) * 0.7], [0.3, 0.2, 0.3], h, hex(['#e2541b', '#f2b705', '#2e9a3a', '#c81d6b'][g % 4]));
      plain.box([pos[0], pos[1] + 2.1, pos[2]], [2.4, 0.06, 1.8], h, hex(TARP[Math.floor(rnd() * TARP.length)]));
      plain.box([pos[0], pos[1], pos[2]], [0.05, 2.1, 0.05], h, hex('#444'));
    }
  }
  // parked vehicles along the kerbs (half on the footpath, as in Indian towns)
  const P0 = P;
  const parked = new Map(); // geometry -> list
  const PARK = {
    city: { every: 8, p: 0.35, types: ['hatch', 'sedan', 'suv', 'taxi', 'auto', 'bike', 'bike'], off: 1.15 },
    market: { every: 4, p: 0.6, types: ['bike', 'bike', 'bike', 'auto', 'auto', 'hatch'], off: 0.7 },
    narrow: { every: 3, p: 0.45, types: ['bike', 'bike', 'bike', 'bike'], off: 0.22 },
    hillstation: { every: 9, p: 0.35, types: ['hatch', 'suv', 'bike', 'taxi'], off: 0.75 },
  };
  if (A.parked) for (let q = q0; q < q1; q++) {
    const t = ztype(q);
    const P = PARK[t];
    if (!P || (q + p.base) % P.every !== 0) continue;
    for (const side of [1, -1]) {
      if (rnd() > P.p) continue;
      const type = P.types[Math.floor(rnd() * P.types.length)];
      const vs = A.parked.variants[type];
      if (!vs) continue;
      const geo = vs[Math.floor(rnd() * vs.length)];
      const big = type !== 'bike' && type !== 'auto';
      const u = side * (p.hw[q] + P.off + (big ? 0.35 : 0) + rnd() * 0.15);
      const pos = P0(q, u, p.curb[q] * (big ? 0.5 : 1));
      if (overlapsPoint(footprints, pos[0] + Ox, pos[2] + Oz, 1.2)) continue;
      const ang = p.h[q] + (side > 0 ? 0 : Math.PI) + (type === 'bike' ? (rnd() - 0.5) * 0.6 : (rnd() - 0.5) * 0.08);
      if (!parked.has(geo)) parked.set(geo, []);
      parked.get(geo).push({ x: pos[0] + Ox, y: pos[1] + Oy, z: pos[2] + Oz, scale: 1, rot: ang, col: 1 });
    }
  }
  const instMesh = (geo, list, mat, shadow = true) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    list.forEach((it, k) => {
      qt.setFromAxisAngle(up, it.rot); ps.set(it.x - Ox, it.y - Oy, it.z - Oz);
      sc.set(it.scale, it.scale, it.scale);
      m.compose(ps, qt, sc); im.setMatrixAt(k, m); im.setColorAt(k, c.setScalar(it.col));
    });
    im.castShadow = shadow; im.receiveShadow = true;
    im.computeBoundingSphere();
    group.add(im);
  };
  instMesh(A.pine, inst.pine, A.mat.foliage);
  instMesh(A.broad, inst.broad, A.mat.foliage);
  instMesh(A.rock, inst.rock, A.mat.foliage);
  instMesh(A.bush, inst.bush, A.mat.foliage, false);
  A.people.forEach((g, k) => instMesh(g, inst.people[k], A.mat.plain));
  for (const [geo, list] of parked) instMesh(geo, list, A.parked.mat);

  return {
    group,
    s0: i0, s1: i1,
    dispose() {
      group.traverse((o) => { if (o.geometry && !o.isInstancedMesh) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
    },
  };
}

function addMesh(group, b, mat, cast, receive) {
  if (b.empty) return;
  const m = new THREE.Mesh(b.geometry(), mat);
  m.castShadow = cast; m.receiveShadow = receive;
  m.matrixAutoUpdate = false; m.updateMatrix();
  group.add(m);
}

function addSign(metal, A, group, pos, h, Ox, Oy, Oz) {
  void Ox; void Oy; void Oz;
  metal.cylinder([pos[0], pos[1] + 1.2, pos[2]], 0.04, 2.4, 'y', 6, hex('#9aa0a6'));
  const g = new THREE.PlaneGeometry(0.9, 0.9);
  const m = new THREE.Mesh(g, A.mat.sign);
  m.position.set(pos[0], pos[1] + 2.4, pos[2]);
  m.rotation.y = h - Math.PI / 2; // face the approaching driver
  group.add(m);
  const back = new THREE.Mesh(g, A.backMat || (A.backMat = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.7 })));
  back.position.copy(m.position); back.rotation.y = m.rotation.y + Math.PI;
  group.add(back);
}

// ----------------------------------------------------------- building rules
const BPROF = {
  city: { prob: 0.92, gap: 1.5, w: [11, 22], d: [12, 20], h: [12.4, 40], set: [0.3, 1.2], clear: 0.4, shops: 0.85, tank: 0.6 },
  market: { prob: 0.97, gap: 0.5, w: [6, 11], d: [8, 12], h: [6.2, 13], set: [0.1, 0.4], clear: 0.2, shops: 1, tank: 0.7, awning: 0.7 },
  narrow: { prob: 1, gap: 0.2, w: [5, 9], d: [7, 11], h: [6.2, 15], set: [0.05, 0.25], clear: 0.1, shops: 0.5, tank: 0.7, balcony: 0.5 },
  hillstation: { prob: 0.7, gap: 3, w: [7, 11], d: [7, 10], h: [6.2, 10], set: [1.2, 5], clear: 0.8, shops: 0.4, hill: true },
  ghat: { prob: 0.025, gap: 40, w: [7, 9], d: [6, 8], h: [3.1, 6.2], set: [2, 4], clear: 1.2, shops: 0.6, hill: true },
  descent: { prob: 0.025, gap: 40, w: [7, 9], d: [6, 8], h: [3.1, 6.2], set: [2, 4], clear: 1.2, shops: 0.6, hill: true },
};
const VEG = {
  city: { n: 1, p: 0.06, e0: 25, e1: 80, pow: 1, pine: 0, broad: 0.8, rock: 0, bush: 0.2 },
  market: null,
  narrow: null,
  ghat: { n: 6, p: 0.8, e0: 2.5, e1: 110, pow: 1.7, pine: 0.62, broad: 0.13, rock: 0.13, bush: 0.12 },
  hairpin: { n: 6, p: 0.8, e0: 2.5, e1: 100, pow: 1.6, pine: 0.62, broad: 0.1, rock: 0.15, bush: 0.13 },
  hillstation: { n: 3, p: 0.7, e0: 6, e1: 90, pow: 1.3, pine: 0.7, broad: 0.15, rock: 0.05, bush: 0.1 },
  descent: { n: 6, p: 0.8, e0: 2.5, e1: 110, pow: 1.7, pine: 0.58, broad: 0.17, rock: 0.13, bush: 0.12 },
};
const PEOPLE = { city: 0.08, market: 0.35, hillstation: 0.12 };

function clearOfRoad(p, cx, cz, rot, w, d, margin) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const R = Math.hypot(w, d) / 2 + 12;
  let ok = true;
  p.forEachNear(cx, cz, R, (i, q, dx, dz) => {
    if (!ok) return;
    const lx = -dx * cs + dz * sn;   // sample relative to building, in building local axes
    const lz = -dx * sn - dz * cs;
    const c = p.hw[q] + p.sw[q] + margin;
    if (Math.abs(lx) < w / 2 + c && Math.abs(lz) < d / 2 + c) ok = false;
  });
  return ok;
}

function obbAxes(b) {
  const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
  return [[cs, -sn], [sn, cs]]; // local x, local z directions in world (x,z)
}
function overlaps(list, cx, cz, rot, w, d) {
  const a = { cx, cz, rot, w, d };
  const ra = Math.hypot(w, d) / 2;
  for (let k = list.length - 1; k >= Math.max(0, list.length - 220); k--) {
    const b = list[k];
    const dx = b.cx - cx, dz = b.cz - cz;
    const rb = Math.hypot(b.w, b.d) / 2;
    if (dx * dx + dz * dz > (ra + rb + 0.6) ** 2) continue;
    const axes = [...obbAxes(a), ...obbAxes(b)];
    let sep = false;
    for (const [ax, az] of axes) {
      const proj = (o) => {
        const [[x1, z1], [x2, z2]] = obbAxes(o);
        const c = o.cx * ax + o.cz * az;
        const r = Math.abs(x1 * ax + z1 * az) * o.w / 2 + Math.abs(x2 * ax + z2 * az) * o.d / 2;
        return [c - r, c + r];
      };
      const [a0, a1] = proj(a), [b0, b1] = proj(b);
      if (a1 + 0.3 < b0 || b1 + 0.3 < a0) { sep = true; break; }
    }
    if (!sep) return true;
  }
  return false;
}
function overlapsPoint(list, x, z, r) {
  for (let k = list.length - 1; k >= Math.max(0, list.length - 220); k--) {
    const b = list[k];
    const dx = x - b.cx, dz = z - b.cz;
    const cs = Math.cos(b.rot), sn = Math.sin(b.rot);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    if (Math.abs(lx) < b.w / 2 + r && Math.abs(lz) < b.d / 2 + r) return true;
  }
  return false;
}

function makeBuilding(B, field, p, type, prof, rnd, cx, cz, rot, w, d, hgt, side, Ox, Oy, Oz, qc) {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  const W2 = (lx, lz) => [cx + lx * cs + lz * sn, cz - lx * sn + lz * cs];
  let ymin = 1e9, ymax = -1e9;
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const [x, z] = W2(a * w / 2, b * d / 2);
    const y = field.height(x, z);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  const roadTop = p.y[qc] + p.curb[qc];
  if (!prof.hill) { ymin = Math.min(ymin, roadTop); ymax = Math.max(ymax, roadTop); }
  const base = ymin - 0.4;
  const H = hgt + (ymax - base);
  const c = [cx - Ox, base - Oy, cz - Oz];
  const streetFace = side > 0 ? 'pz' : 'nz';
  const pal = prof.hill ? HILL_WALL : BUILDING_COLS;
  const col = hex(pal[Math.floor(rnd() * pal.length)]);
  const floorOff = (ymax - base);
  // facade UVs: 2 bays (6.4 m) x 2 floors (6.2 m) per repeat, floors start above ground level
  const uvF = (face, fw, fh) => {
    if (face === 'py' || face === 'ny') return [0.02, 0.02, 0.06, 0.06];
    return [0, -floorOff / 6.2, fw / 6.4, (fh - floorOff) / 6.2];
  };
  B.facade.box(c, [w, H, d], rot, col, uvF, ['px', 'nx', 'pz', 'nz']);
  if (prof.hill) {
    // pitched tin roof (very typical of Himalayan hill stations)
    const roofCol = hex(HILL_ROOF[Math.floor(rnd() * HILL_ROOF.length)]);
    const top = base + H - Oy;
    const ov = 0.5, rh = Math.min(w, d) * 0.32;
    const P = (lx, ly, lz) => [cx - Ox + lx * cs + lz * sn, top + ly, cz - Oz - lx * sn + lz * cs];
    const hx = w / 2 + ov, hz = d / 2 + ov;
    B.plain.quad(P(-hx, -0.15, hz), P(hx, -0.15, hz), P(hx, rh, 0), P(-hx, rh, 0), roofCol);
    B.plain.quad(P(hx, -0.15, -hz), P(-hx, -0.15, -hz), P(-hx, rh, 0), P(hx, rh, 0), roofCol);
    B.plain.tri(P(w / 2, 0, d / 2), P(w / 2, 0, -d / 2), P(w / 2, rh * 0.95, 0), col);
    B.plain.tri(P(-w / 2, 0, -d / 2), P(-w / 2, 0, d / 2), P(-w / 2, rh * 0.95, 0), col);
    B.plain.quad(P(-w / 2, 0, d / 2), P(w / 2, 0, d / 2), P(w / 2, 0, -d / 2), P(-w / 2, 0, -d / 2), col);
  } else {
    // flat roof with parapet, water tanks
    B.roofs.box([c[0], c[1] + H, c[2]], [w + 0.3, 0.25, d + 0.3], rot, hex('#b9b4aa'));
    B.roofs.box([c[0], c[1] + H, c[2]], [w - 0.2, 0.02, d - 0.2], rot, hex('#8e8a83'), null, ['py']);
    if (rnd() < (prof.tank || 0)) {
      const [tx, tz] = W2((rnd() - 0.5) * (w - 3), (rnd() - 0.5) * (d - 3));
      B.plain.cylinder([tx - Ox, base + H + 0.25 + 0.7 - Oy, tz - Oz], 0.65, 1.4, 'y', 10, hex('#1a1a1a'));
      B.plain.box([tx - Ox, base + H + 0.2 - Oy, tz - Oz], [1.6, 0.08, 1.6], rot, hex('#6b6b6b'));
    }
  }
  // ground-floor shops on the street face
  if (rnd() < (prof.shops || 0)) {
    const row = Math.floor(rnd() * 8);
    const lz = side > 0 ? d / 2 + 0.12 : -(d / 2 + 0.12);
    const [sx, sz] = W2(0, lz);
    const g = p.y[qc] + p.curb[qc] - 0.02;
    const yb = Math.max(g, base);
    const u0 = rnd();
    B.shops.box([sx - Ox, yb - Oy, sz - Oz], [w - 0.3, 3.3, 0.24], rot, [1, 1, 1],
      (f, fw) => [u0, 1 - (row + 1) / 8 + 0.004, u0 + fw / 12.8, 1 - row / 8 - 0.004], [streetFace]);
    if (rnd() < (prof.awning || 0)) {
      const tc = hex(TARP[Math.floor(rnd() * TARP.length)]);
      const out = side > 0 ? 1 : -1;
      const P = (lx, y, lz2) => { const [x, z] = W2(lx, lz2); return [x - Ox, y - Oy, z - Oz]; };
      const z0 = lz, z1 = lz + out * 1.8;
      const a = P(-w / 2 + 0.3, yb + 3.0, z0), b2 = P(w / 2 - 0.3, yb + 3.0, z0), c2 = P(w / 2 - 0.3, yb + 2.45, z1), d2 = P(-w / 2 + 0.3, yb + 2.45, z1);
      if (out > 0) { B.plain.quad(d2, c2, b2, a, tc); B.plain.quad(a, b2, c2, d2, tc); }
      else { B.plain.quad(a, b2, c2, d2, tc); B.plain.quad(d2, c2, b2, a, tc); }
    }
  }
  // balconies (narrow lanes) – slabs projecting over the street
  if (rnd() < (prof.balcony || 0) && hgt > 6) {
    const lz = side > 0 ? d / 2 + 0.55 : -(d / 2 + 0.55);
    const [bx, bz] = W2(0, lz);
    for (let f = 1; f * 3.1 < hgt - 1; f++) {
      const y = Math.max(base + floorOff, p.y[qc]) + f * 3.1 - 0.15;
      B.roofs.box([bx - Ox, y - Oy, bz - Oz], [w * 0.7, 0.15, 1.1], rot, hex('#cfc9bd'));
      B.metal.box([bx - Ox, y + 0.15 - Oy, bz - Oz + 0], [w * 0.7, 0.9, 1.1], rot, hex('#3a3a3a'), null, [streetFace]);
    }
  }
  void smoothstep;
}
