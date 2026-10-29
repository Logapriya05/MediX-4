// Procedural route generator. The road centreline is sampled every 1 m, so a
// sample's global index equals its distance s (metres) along the route.
// Heading h: tangent = (cos h, -sin h) in (x, z); increasing h turns LEFT.
// Left normal = (-sin h, -cos h).

import { ZONES, ZONE_ORDER, BLEND, laneCentres } from './zones.js';
import { mulberry32, smoothstep, wrapAngle, lerp } from './util.js';

const C1 = 16;   // fine hash cell (every sample)
const C2 = 32;   // terrain hash cell (every 4th sample)
const C3 = 128;  // coarse hash cell (every 16th sample)

class Hash {
  constructor(cell) { this.cell = cell; this.map = new Map(); }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  add(x, z, i) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(i);
  }
  cellAt(cx, cz) { return this.map.get(this.key(cx, cz)); }
}

export class RoutePath {
  constructor(seed = 7, only = null) {
    this.only = only;
    this.rng = mulberry32(seed);
    this.base = 0;
    this.x = []; this.z = []; this.y = []; this.h = []; this.k = []; this.g = [];
    this.zid = [];            // zone instance id per sample
    this.hw = []; this.med = []; this.lo = []; this.li = []; this.sw = []; this.curb = []; this.sh = [];
    this.limit = []; this.mtn = []; this.far = [];
    this.zones = [];          // {type, s0, s1, prev}
    this.h1 = new Hash(C1); this.h2 = new Hash(C2); this.h3 = new Hash(C3);
    this.turtle = { x: 0, z: 0, h: 0, k: 0, y: only === 'descent' ? 190 : 40, g: 0 };
    this.zoneCounter = 0;
    this.listeners = [];
  }

  get length() { return this.base + this.x.length; }
  idx(i) { return i - this.base; }

  // ---------------------------------------------------------------- plans
  turn(segs, ang, R, Lt, grade) {
    const sign = Math.sign(ang) || 1;
    const a = Math.abs(ang);
    const k = sign / R;
    let lt = Lt;
    if (a < lt / R) lt = a * R;
    const arc = (a - lt / R) * R;
    if (lt > 0) segs.push({ len: lt, k0: 0, k1: k, grade });
    if (arc > 0.5) segs.push({ len: arc, k0: k, k1: k, grade });
    if (lt > 0) segs.push({ len: lt, k0: k, k1: 0, grade });
    return ang;
  }
  straight(segs, len, grade) { segs.push({ len, k0: 0, k1: 0, grade }); return 0; }

  plan(type, side, r) {
    const segs = [];
    let ang = this.turtle.h;
    // When one hill environment repeats, alternate climbing and descending so
    // the road stays within a sensible altitude band.
    let gs = 1;
    if (this.only) {
      const y = this.turtle.y;
      if (type === 'descent') { if (y < 50) this.climbing = true; if (y > 170) this.climbing = false; gs = this.climbing ? -1 : 1; }
      else { if (y > 170) this.descending = true; if (y < 50) this.descending = false; gs = this.descending ? -1 : 1; }
    }
    const T = (a, R, Lt, g) => { ang += this.turn(segs, a, R, Lt, g * gs); };
    const S = (l, g) => this.straight(segs, l, g * gs);
    const align = (R, g) => { const a = wrapAngle(-ang); if (Math.abs(a) > 0.01) T(a, R, Math.min(20, R * 0.4), g); };
    switch (type) {
      case 'city': {
        S(110 + r() * 60, 0);
        const a = side * (0.22 + r() * 0.2);
        T(a, 200, 40, 0); S(70 + r() * 50, 0); T(-a, 200, 40, 0);
        S(60 + r() * 40, 0);
        T(side * Math.PI / 2, 30, 14, 0);
        S(110 + r() * 60, 0);
        T(-side * Math.PI / 2, 30, 14, 0);
        S(80, 0); align(150, 0); S(40, 0);
        break;
      }
      case 'market': {
        S(60, 0);
        const a = side * (0.25 + r() * 0.2);
        T(a, 90, 25, 0); S(110 + r() * 40, 0); T(-a, 90, 25, 0); S(70, 0);
        align(80, 0); S(30, 0);
        break;
      }
      case 'narrow': {
        S(40, 0.01);
        const order = [1, -1, -1, 1];
        for (const o of order) { T(side * o * Math.PI / 2, 11, 5, 0.01); S(42 + r() * 22, 0.012); }
        align(14, 0.01); S(40, 0.02);
        break;
      }
      case 'ghat': {
        S(50, 0.04);
        let sgn = side;
        for (let i = 0; i < 6; i++) {
          T(sgn * (0.6 + r() * 0.65), 34 + r() * 22, 18, 0.062);
          S(25 + r() * 45, 0.06);
          sgn = -sgn;
        }
        align(45, 0.05); S(40, 0.05);
        break;
      }
      case 'hairpin': {
        S(50, 0.06);
        let sgn = side;
        for (let i = 0; i < 4; i++) {
          T(sgn * Math.PI, 14.5, 9, 0.035);
          S(58 + r() * 12, 0.075);
          sgn = -sgn;
        }
        align(40, 0.04); S(50, 0.03);
        break;
      }
      case 'hillstation': {
        S(60, 0.015);
        const a = side * (0.35 + r() * 0.2);
        T(a, 70, 25, 0.02); S(90 + r() * 40, 0.01); T(-a * 1.6, 60, 25, 0.015); S(80, 0.01);
        align(60, 0.0); S(60, 0.0);
        break;
      }
      case 'descent': {
        const drop = Math.max(0, this.turtle.y - 40);
        const target = this.only ? 700 : Math.max(500, drop / 0.065);
        let used = 0; let sgn = side; let n = 0;
        const add = () => segs.reduce((s, q) => s + q.len, 0);
        S(40, -0.04);
        while (add() < target - 80 && n < 30) {
          if (n === 3) { T(sgn * 2.1, 19, 10, -0.04); S(45, -0.06); T(-sgn * 2.1, 19, 10, -0.04); }
          else T(sgn * (0.55 + r() * 0.7), 32 + r() * 22, 16, -0.065);
          S(25 + r() * 40, -0.065);
          sgn = -sgn; n++;
        }
        used = add();
        align(45, -0.03); S(60, 0);
        void used;
        break;
      }
    }
    return segs;
  }

  // Integrate a plan into candidate samples without committing them.
  simulate(segs) {
    const t = { ...this.turtle };
    const out = [];
    const total = segs.reduce((a, q) => a + q.len, 0);
    const n = Math.round(total);
    let si = 0, segStart = 0;
    for (let j = 0; j < n; j++) {
      const sm = j + 0.5; // midpoint distance of this 1 m step
      while (si < segs.length - 1 && sm > segStart + segs[si].len) { segStart += segs[si].len; si++; }
      const sg = segs[si];
      const f = Math.min(1, Math.max(0, (sm - segStart) / sg.len));
      const k = lerp(sg.k0, sg.k1, f);
      const hm = t.h + k * 0.5;
      t.x += Math.cos(hm);
      t.z += -Math.sin(hm);
      t.h += k;
      t.k = k;
      t.g += (sg.grade - t.g) / 28;
      t.y += t.g;
      out.push({ x: t.x, z: t.z, y: t.y, h: t.h, k, g: t.g });
    }
    return { out, t };
  }

  conflicts(out) {
    const start = this.length;
    for (let j = 0; j < out.length; j += 3) {
      const p = out[j];
      const cx = Math.floor(p.x / C2), cz = Math.floor(p.z / C2);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const cell = this.h2.cellAt(cx + a, cz + b);
        if (!cell) continue;
        for (const i of cell) {
          if (i < this.base) continue;
          if (start + j - i < 160) continue;
          const q = this.idx(i);
          const dx = this.x[q] - p.x, dz = this.z[q] - p.z;
          if (dx * dx + dz * dz < 30 * 30) return true;
        }
      }
    }
    return false;
  }

  generateZone() {
    const type = this.only || ZONE_ORDER[this.zoneCounter % ZONE_ORDER.length];
    this.zoneCounter++;
    // prefer turning back toward the corridor centre line (z = 0)
    let side = this.turtle.z > 0 ? 1 : -1;
    if (this.rng() < 0.25) side = -side;
    let best = null;
    for (const sd of [side, -side]) {
      const seed = Math.floor(this.rng() * 1e9);
      const segs = this.plan(type, sd, mulberry32(seed));
      const sim = this.simulate(segs);
      if (!best) best = sim;
      if (!this.conflicts(sim.out)) { best = sim; break; }
    }
    this.commit(type, best);
  }

  commit(type, sim) {
    const prev = this.zones.length ? this.zones[this.zones.length - 1].type : type;
    const s0 = this.length;
    const zi = this.zones.length;
    this.zones.push({ type, s0, s1: s0 + sim.out.length, prev });
    const zA = ZONES[prev], zB = ZONES[type];
    const lA = laneCentres(zA), lB = laneCentres(zB);
    for (let j = 0; j < sim.out.length; j++) {
      const p = sim.out[j];
      const i = s0 + j;
      const f = smoothstep(0, BLEND, j);
      this.x.push(p.x); this.z.push(p.z); this.y.push(p.y); this.h.push(p.h); this.k.push(p.k); this.g.push(p.g);
      this.zid.push(zi);
      this.hw.push(lerp(zA.hw, zB.hw, f));
      this.med.push(lerp(zA.median, zB.median, f));
      this.lo.push(lerp(lA[0], lB[0], f));
      this.li.push(lerp(lA[1], lB[1], f));
      this.sw.push(lerp(zA.sidewalk, zB.sidewalk, f));
      this.curb.push(lerp(zA.curb, zB.curb, f));
      this.sh.push(lerp(zA.shoulder, zB.shoulder, f));
      this.limit.push(lerp(zA.limit, zB.limit, f));
      this.mtn.push(lerp(zA.mountain, zB.mountain, f));
      this.far.push(lerp(zA.far, zB.far, f));
      this.h1.add(p.x, p.z, i);
      if (i % 4 === 0) this.h2.add(p.x, p.z, i);
      if (i % 16 === 0) this.h3.add(p.x, p.z, i);
    }
    this.turtle = { ...sim.t };
    for (const l of this.listeners) l(s0, this.length);
  }

  ensure(sTarget) {
    while (this.length < sTarget) this.generateZone();
  }

  trim(sMin) {
    const n = Math.floor(sMin) - this.base;
    if (n <= 2000) return; // trim in big batches
    for (const key of ['x', 'z', 'y', 'h', 'k', 'g', 'zid', 'hw', 'med', 'lo', 'li', 'sw', 'curb', 'sh', 'limit', 'mtn', 'far']) {
      this[key].splice(0, n);
    }
    this.base += n;
    for (const hsh of [this.h1, this.h2, this.h3]) {
      for (const [k, a] of hsh.map) {
        let w = 0;
        for (let r = 0; r < a.length; r++) if (a[r] >= this.base) a[w++] = a[r];
        a.length = w;
        if (!w) hsh.map.delete(k);
      }
    }
  }

  // ------------------------------------------------------------- queries
  zoneAt(s) {
    const i = Math.max(this.base, Math.min(this.length - 1, Math.floor(s)));
    return this.zones[this.zid[this.idx(i)]];
  }

  // interpolated value of array `key` at distance s
  val(key, s) {
    const arr = this[key];
    let i = Math.floor(s);
    if (i < this.base) i = this.base;
    if (i >= this.length - 1) i = this.length - 2;
    const f = Math.min(1, Math.max(0, s - i));
    const q = i - this.base;
    return arr[q] + (arr[q + 1] - arr[q]) * f;
  }

  // position on road at distance s with lateral offset u (u>0 = left)
  point(s, u = 0, out = {}) {
    let i = Math.floor(s);
    if (i < this.base) i = this.base;
    if (i >= this.length - 1) i = this.length - 2;
    const f = Math.min(1, Math.max(0, s - i));
    const q = i - this.base;
    const x = this.x[q] + (this.x[q + 1] - this.x[q]) * f;
    const z = this.z[q] + (this.z[q + 1] - this.z[q]) * f;
    const y = this.y[q] + (this.y[q + 1] - this.y[q]) * f;
    const h = this.h[q] + (this.h[q + 1] - this.h[q]) * f;
    const lx = -Math.sin(h), lz = -Math.cos(h);
    out.x = x + lx * u; out.z = z + lz * u; out.y = y; out.h = h;
    out.tx = Math.cos(h); out.tz = -Math.sin(h);
    out.lx = lx; out.lz = lz;
    return out;
  }

  // nearest centreline sample within radius (fine hash) -> {i, d, side}
  nearest(x, z, radius = 48) {
    const cs = this.h1.cell;
    const r = Math.ceil(radius / cs);
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    let best = -1, bd = radius * radius;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const cell = this.h1.cellAt(cx + a, cz + b);
      if (!cell) continue;
      for (const i of cell) {
        if (i < this.base) continue;
        const q = i - this.base;
        const dx = this.x[q] - x, dz = this.z[q] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
    }
    if (best < 0) return null;
    return { i: best, d: Math.sqrt(bd) };
  }

  // iterate all fine samples within radius (callback(i, q, dx, dz, d2))
  forEachNear(x, z, radius, cb) {
    const cs = this.h1.cell;
    const r = Math.ceil(radius / cs);
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    const r2 = radius * radius;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const cell = this.h1.cellAt(cx + a, cz + b);
      if (!cell) continue;
      for (const i of cell) {
        if (i < this.base) continue;
        const q = i - this.base;
        const dx = this.x[q] - x, dz = this.z[q] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < r2) cb(i, q, dx, dz, d2);
      }
    }
  }

  // Max |curvature| between s and s+len
  maxCurv(s, len) {
    let m = 0;
    const a = Math.max(this.base, Math.floor(s)), b = Math.min(this.length - 1, Math.floor(s + len));
    for (let i = a; i <= b; i++) { const v = Math.abs(this.k[i - this.base]); if (v > m) m = v; }
    return m;
  }
}
