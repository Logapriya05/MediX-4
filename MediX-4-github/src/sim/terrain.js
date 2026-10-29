import * as THREE from 'three';
import { fbm, ridged, simplex2, smoothstep, clamp } from './util.js';

const NEAR_R = 76;     // radius for detailed road influence (terrain hash, 4 m samples)
const FAR_R = 520;     // radius for far base height (coarse hash, 16 m samples)

// Terrain height field. Near the road it equals road height (slightly carved
// under the asphalt), and blends into procedural hills/mountains further away.
export class TerrainField {
  constructor(path) {
    this.path = path;
    this.out = { y: 0, e: 0, mtn: 0, far: 0, base: 0 };
  }

  _near(x, z) {
    const p = this.path, H = p.h2, cs = H.cell;
    const r = Math.ceil(NEAR_R / cs);
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    let sw = 0, sy = 0, sm = 0, sf = 0, sx = 0, sz = 0, best = -1, bd = 1e18;
    const r2 = NEAR_R * NEAR_R;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const cell = H.cellAt(cx + a, cz + b);
      if (!cell) continue;
      for (let n = 0; n < cell.length; n++) {
        const i = cell[n];
        if (i < p.base) continue;
        const q = i - p.base;
        const dx = p.x[q] - x, dz = p.z[q] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 > r2) continue;
        if (d2 < bd) { bd = d2; best = q; }
        const w = 1 / ((d2 + 6) * (d2 + 6));
        sw += w; sy += w * p.y[q]; sm += w * p.mtn[q]; sf += w * p.far[q]; sx += w * p.x[q]; sz += w * p.z[q];
      }
    }
    if (best < 0) return null;
    // refine distance with fine samples around the nearest coarse sample
    let dmin = Math.sqrt(bd), qb = best;
    const q0 = Math.max(0, best - 4), q1 = Math.min(p.x.length - 2, best + 4);
    for (let q = q0; q < q1; q++) {
      // point-segment distance
      const ax = p.x[q], az = p.z[q], bx = p.x[q + 1], bz = p.z[q + 1];
      const vx = bx - ax, vz = bz - az;
      const t = clamp(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0, 1);
      const ex = ax + vx * t - x, ez = az + vz * t - z;
      const d = Math.sqrt(ex * ex + ez * ez);
      if (d < dmin) { dmin = d; qb = q; }
    }
    return { y: sy / sw, mtn: sm / sw, far: sf / sw, cx: sx / sw, cz: sz / sw, d: dmin, q: qb };
  }

  _far(x, z) {
    const p = this.path, H = p.h3, cs = H.cell;
    const r = Math.ceil(FAR_R / cs);
    const cx = Math.floor(x / cs), cz = Math.floor(z / cs);
    let sw = 0, sy = 0, sm = 0, sf = 0, sx = 0, sz = 0, bd = 1e18;
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const cell = H.cellAt(cx + a, cz + b);
      if (!cell) continue;
      for (let n = 0; n < cell.length; n++) {
        const i = cell[n];
        if (i < p.base) continue;
        const q = i - p.base;
        const dx = p.x[q] - x, dz = p.z[q] - z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) bd = d2;
        const w = 1 / Math.pow(d2 + 400, 1.6);
        sw += w; sy += w * p.y[q]; sm += w * p.mtn[q]; sf += w * p.far[q]; sx += w * p.x[q]; sz += w * p.z[q];
      }
    }
    if (sw === 0) return { y: 40, mtn: 10, far: 1, cx: x, cz: z, d: 1000 };
    return { y: sy / sw, mtn: sm / sw, far: sf / sw, cx: sx / sw, cz: sz / sw, d: Math.sqrt(bd) };
  }

  // Returns height; also fills this.out with e (distance past road edge) etc.
  height(x, z) {
    const p = this.path;
    const n = this._near(x, z);
    let base, mtn, far, e, cx, cz;
    if (n) {
      const edge = p.hw[n.q] + Math.max(p.sw[n.q], p.sh[n.q]);
      e = n.d - edge;
      const t = smoothstep(42, NEAR_R - 4, n.d);
      if (t > 0) {
        const f = this._far(x, z);
        base = n.y + (f.y - n.y) * t; mtn = n.mtn + (f.mtn - n.mtn) * t; far = n.far + (f.far - n.far) * t;
        cx = n.cx + (f.cx - n.cx) * t; cz = n.cz + (f.cz - n.cz) * t;
      } else { base = n.y; mtn = n.mtn; far = n.far; cx = n.cx; cz = n.cz; }
    } else {
      const f = this._far(x, z);
      base = f.y; mtn = f.mtn; far = f.far; e = Math.max(NEAR_R, f.d - 5); cx = f.cx; cz = f.cz;
    }
    // carve under the road and blend out
    let off = 0;
    if (e < 2.2) off = -0.32 * (1 - smoothstep(0.4, 2.2, e));
    // natural relief
    const N = fbm(x / 210, z / 210, 4) + 0.22;
    const ramp = smoothstep(1.8, 48, e) * (0.45 + Math.min(e, 260) / 70);
    off += mtn * 0.6 * N * ramp;
    // mountainside tilt: one side of the road rises as a cut slope, the other falls to a valley
    const hilly = clamp(mtn / 22, 0, 1.3);
    if (hilly > 0.02) {
      const ang = fbm(x / 1100 + 5.3, z / 1100 - 3.1, 2) * 6.0;
      const dd = (x - cx) * Math.cos(ang) + (z - cz) * Math.sin(ang);
      const T = hilly * 0.66 * dd * smoothstep(2.0, 18, e);
      off += 75 * Math.tanh(T / 75);
    }
    off += far * 150 * ridged(x / 700 + 3.1, z / 700 - 7.3, 4) * smoothstep(70, 420, e);
    off += 0.35 * simplex2(x / 7, z / 7) * smoothstep(1.5, 8, e);
    const o = this.out;
    o.y = base + off; o.e = e; o.mtn = mtn; o.far = far; o.base = base;
    return o.y;
  }
}

// ---------------------------------------------------------------------------
const TILE = 64;
const RADIUS = 470;

export class TerrainManager {
  constructor(field, scene, textures) {
    this.field = field;
    this.scene = scene;
    this.tiles = new Map();
    this.queue = [];
    this.dirty = new Set();
    this.material = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.97, metalness: 0,
      map: textures.detail,
    });
    // world-space detail UVs are baked into the uv attribute
  }

  key(ix, iz) { return ix + ',' + iz; }

  clear() {
    for (const t of this.tiles.values()) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); }
    this.tiles.clear(); this.dirty.clear();
  }

  markDirtyAround(x0, z0, x1, z1) {
    const m = 90;
    const ix0 = Math.floor((x0 - m) / TILE), ix1 = Math.floor((x1 + m) / TILE);
    const iz0 = Math.floor((z0 - m) / TILE), iz1 = Math.floor((z1 + m) / TILE);
    for (let ix = ix0; ix <= ix1; ix++) for (let iz = iz0; iz <= iz1; iz++) {
      const k = this.key(ix, iz);
      if (this.tiles.has(k)) this.dirty.add(k);
    }
  }

  build(ix, iz, res) {
    const f = this.field;
    const n = Math.round(TILE / res) + 1;     // vertices per side (interior)
    const N = n + 2;                          // with 1-vertex border for normals
    const ox = ix * TILE, oz = iz * TILE;
    const hts = new Float32Array(N * N);
    const es = new Float32Array(N * N);
    const mt = new Float32Array(N * N);
    const bs = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = ox + (i - 1) * res, z = oz + (j - 1) * res;
      hts[j * N + i] = f.height(x, z);
      es[j * N + i] = f.out.e; mt[j * N + i] = f.out.mtn; bs[j * N + i] = f.out.base;
    }
    const cx = ox + TILE / 2, cz = oz + TILE / 2;
    const skirt = 4 * (n - 1);
    const vcount = n * n + skirt;
    const pos = new Float32Array(vcount * 3);
    const nor = new Float32Array(vcount * 3);
    const col = new Float32Array(vcount * 3);
    const uv = new Float32Array(vcount * 2);
    const tmp = new THREE.Vector3();
    let v = 0;
    const put = (i, j, dy) => {
      const k = (j + 1) * N + (i + 1);
      const x = ox + i * res, z = oz + j * res, y = hts[k];
      pos[v * 3] = x - cx; pos[v * 3 + 1] = y + dy; pos[v * 3 + 2] = z - cz;
      const hl = hts[k - 1], hr = hts[k + 1], hd = hts[k - N], hu = hts[k + N];
      tmp.set(hl - hr, 2 * res, hd - hu).normalize();
      nor[v * 3] = tmp.x; nor[v * 3 + 1] = tmp.y; nor[v * 3 + 2] = tmp.z;
      // colour
      const e = es[k], slope = tmp.y, rel = y - bs[k], mtn = mt[k];
      const hilly = clamp(mtn / 20, 0, 1);
      const nn = simplex2(x / 37, z / 37) * 0.5 + 0.5;
      const n2 = simplex2(x / 9 + 50, z / 9) * 0.5 + 0.5;
      // grass tones: hills lush green / dry yellow, plains dusty
      let r = 0.36 + 0.10 * nn, g = 0.40 + 0.08 * nn, b = 0.22;
      const gr = [0.20 + 0.08 * nn, 0.33 + 0.10 * n2, 0.12 + 0.03 * nn];
      r = r + (gr[0] - r) * hilly; g = g + (gr[1] - g) * hilly; b = b + (gr[2] - b) * hilly;
      // dirt verge near road
      const verge = 1 - smoothstep(0.5, 5 + 3 * n2, e);
      r += (0.46 - r) * verge; g += (0.39 - g) * verge; b += (0.29 - b) * verge;
      // rock on steep slopes
      const rock = smoothstep(0.76, 0.6, slope + n2 * 0.06);
      r += (0.31 - r) * rock; g += (0.30 - g) * rock; b += (0.27 - b) * rock;
      // snow on high far ridges
      const snow = smoothstep(95, 130, rel + nn * 20) * smoothstep(0.55, 0.75, slope);
      r += (0.94 - r) * snow; g += (0.95 - g) * snow; b += (0.97 - b) * snow;
      col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = b;
      uv[v * 2] = x / 9; uv[v * 2 + 1] = z / 9;
      v++;
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) put(i, j, 0);
    // skirt vertices (edge ring dropped down) to hide LOD cracks
    const ring = [];
    for (let i = 0; i < n - 1; i++) ring.push([i, 0]);
    for (let j = 0; j < n - 1; j++) ring.push([n - 1, j]);
    for (let i = n - 1; i > 0; i--) ring.push([i, n - 1]);
    for (let j = n - 1; j > 0; j--) ring.push([0, j]);
    const ringStart = v;
    for (const [i, j] of ring) put(i, j, -3.5);
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b2 = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, b2, b2, c, d);
    }
    for (let r2 = 0; r2 < ring.length; r2++) {
      const [i0, j0] = ring[r2], [i1, j1] = ring[(r2 + 1) % ring.length];
      const a = j0 * n + i0, b2 = j1 * n + i1;
      const c = ringStart + r2, d = ringStart + (r2 + 1) % ring.length;
      idx.push(a, b2, c, b2, d, c, a, c, b2, b2, c, d); // both windings: skirts seen from any side
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(cx, 0, cz);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    return mesh;
  }

  update(px, pz, budgetMs = 6) {
    const t0 = performance.now();
    const cix = Math.floor(px / TILE), ciz = Math.floor(pz / TILE);
    const R = Math.ceil(RADIUS / TILE);
    const want = [];
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const ix = cix + a, iz = ciz + b;
      const dx = (ix + 0.5) * TILE - px, dz = (iz + 0.5) * TILE - pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > RADIUS + TILE * 0.7) continue;
      const res = d < 190 ? 2 : d < 330 ? 4 : 8;
      const k = this.key(ix, iz);
      const t = this.tiles.get(k);
      if (!t || t.res > res || this.dirty.has(k)) want.push({ ix, iz, res: t && !this.dirty.has(k) ? Math.min(res, t.res) : res, d, k });
    }
    want.sort((p, q) => p.d - q.d);
    for (const w of want) {
      if (performance.now() - t0 > budgetMs) break;
      const old = this.tiles.get(w.k);
      const mesh = this.build(w.ix, w.iz, w.res);
      this.scene.add(mesh);
      if (old) { this.scene.remove(old.mesh); old.mesh.geometry.dispose(); }
      this.tiles.set(w.k, { mesh, res: w.res });
      this.dirty.delete(w.k);
    }
    // dispose distant tiles
    for (const [k, t] of this.tiles) {
      const dx = t.mesh.position.x - px, dz = t.mesh.position.z - pz;
      if (dx * dx + dz * dz > (RADIUS + 160) ** 2) {
        this.scene.remove(t.mesh); t.mesh.geometry.dispose(); this.tiles.delete(k); this.dirty.delete(k);
      }
    }
    return want.length;
  }
}
