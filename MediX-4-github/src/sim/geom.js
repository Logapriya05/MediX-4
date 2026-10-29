import * as THREE from 'three';

// Lightweight mesh builder: flat-shaded quads/triangles with colour + uv.
export class Builder {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; this.i = []; this.v = 0; }

  tri(a, b, c, col, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const [P, U] of [[a, ua], [b, ub], [c, uc]]) {
      this.p.push(P[0], P[1], P[2]); this.n.push(nx, ny, nz);
      this.c.push(col[0], col[1], col[2]); this.uv.push(U[0], U[1]);
    }
    this.i.push(this.v, this.v + 1, this.v + 2);
    this.v += 3;
  }

  // quad a-b-c-d counter-clockwise when seen from the front
  quad(a, b, c, d, col, ua = [0, 0], ub = [1, 0], uc = [1, 1], ud = [0, 1]) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const base = this.v;
    for (const [P, U] of [[a, ua], [b, ub], [c, uc], [d, ud]]) {
      this.p.push(P[0], P[1], P[2]); this.n.push(nx, ny, nz);
      this.c.push(col[0], col[1], col[2]); this.uv.push(U[0], U[1]);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    this.v += 4;
  }

  // Oriented box. c = centre [x,y,z] of the BOTTOM face, size [lx, h, lz], rot about Y.
  // uvFn(faceName, w, h) -> [u0,v0,u1,v1] ; colFn(faceName) -> colour
  box(c, size, rot, col, uvFn = null, faces = null) {
    const [sx, sy, sz] = size;
    const cs = Math.cos(rot), sn = Math.sin(rot);
    const P = (lx, ly, lz) => [c[0] + lx * cs + lz * sn, c[1] + ly, c[2] - lx * sn + lz * cs];
    const hx = sx / 2, hz = sz / 2;
    const v = [
      P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz),
      P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz),
    ];
    const F = {
      px: [v[2], v[1], v[5], v[6], sz, sy],
      nx: [v[0], v[3], v[7], v[4], sz, sy],
      pz: [v[3], v[2], v[6], v[7], sx, sy],
      nz: [v[1], v[0], v[4], v[5], sx, sy],
      py: [v[7], v[6], v[5], v[4], sx, sz],
      ny: [v[0], v[1], v[2], v[3], sx, sz],
    };
    for (const k of Object.keys(F)) {
      if (faces && !faces.includes(k)) continue;
      const [a, b, cc, d, w, h] = F[k];
      const colr = typeof col === 'function' ? col(k) : col;
      if (uvFn) {
        const [u0, v0, u1, v1] = uvFn(k, w, h);
        this.quad(a, b, cc, d, colr, [u0, v0], [u1, v0], [u1, v1], [u0, v1]);
      } else this.quad(a, b, cc, d, colr);
    }
  }

  // Cylinder along an axis, flat-ish shading (smooth normals around)
  cylinder(c, r, len, axis, seg, col, r2 = r) {
    // axis: 'x' | 'y' | 'z'; c = centre
    const base = this.v;
    const pt = (ang, t, rr) => {
      const a = Math.cos(ang) * rr, b = Math.sin(ang) * rr, l = (t - 0.5) * len;
      if (axis === 'x') return [c[0] + l, c[1] + a, c[2] + b];
      if (axis === 'z') return [c[0] + a, c[1] + b, c[2] + l];
      return [c[0] + a, c[1] + l, c[2] - b];
    };
    const nrm = (ang) => {
      const a = Math.cos(ang), b = Math.sin(ang);
      if (axis === 'x') return [0, a, b];
      if (axis === 'z') return [a, b, 0];
      return [a, 0, -b];
    };
    for (let s = 0; s <= seg; s++) {
      const ang = (s / seg) * Math.PI * 2;
      for (const [t, rr] of [[0, r], [1, r2]]) {
        const P = pt(ang, t, rr), N = nrm(ang);
        this.p.push(...P); this.n.push(...N); this.c.push(...col); this.uv.push(s / seg, t);
      }
    }
    for (let s = 0; s < seg; s++) {
      const a = base + s * 2;
      this.i.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    this.v += (seg + 1) * 2;
    // caps
    for (const [t, rr, sgn] of [[0, r, -1], [1, r2, 1]]) {
      const cb = this.v;
      const cc = pt(0, t, 0);
      const N = axis === 'x' ? [sgn, 0, 0] : axis === 'z' ? [0, 0, sgn] : [0, sgn, 0];
      this.p.push(...cc); this.n.push(...N); this.c.push(...col); this.uv.push(0.5, 0.5);
      for (let s = 0; s <= seg; s++) {
        const P = pt((s / seg) * Math.PI * 2, t, rr);
        this.p.push(...P); this.n.push(...N); this.c.push(...col); this.uv.push(0, 0);
      }
      for (let s = 0; s < seg; s++) {
        if (sgn > 0) this.i.push(cb, cb + 1 + s, cb + 2 + s);
        else this.i.push(cb, cb + 2 + s, cb + 1 + s);
      }
      this.v += seg + 2;
    }
  }

  // Extrude a 2D profile (in X/Y plane) along Z from z0..z1
  extrude(profile, z0, z1, col, offset = [0, 0, 0]) {
    const [ox, oy, oz] = offset;
    const n = profile.length;
    for (let i = 0; i < n; i++) {
      const a = profile[i], b = profile[(i + 1) % n];
      this.quad(
        [ox + b[0], oy + b[1], oz + z1], [ox + a[0], oy + a[1], oz + z1],
        [ox + a[0], oy + a[1], oz + z0], [ox + b[0], oy + b[1], oz + z0], col,
      );
    }
    // caps (fan; profile must be convex-ish)
    for (let i = 1; i < n - 1; i++) {
      const a = profile[0], b = profile[i], c = profile[i + 1];
      this.tri([ox + a[0], oy + a[1], oz + z1], [ox + b[0], oy + b[1], oz + z1], [ox + c[0], oy + c[1], oz + z1], col);
      this.tri([ox + a[0], oy + a[1], oz + z0], [ox + c[0], oy + c[1], oz + z0], [ox + b[0], oy + b[1], oz + z0], col);
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.v > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
  get empty() { return this.v === 0; }
}

export const hex = (h) => {
  const c = new THREE.Color(h);
  // vertex colours are linear in three's pipeline
  return [c.r, c.g, c.b];
};
