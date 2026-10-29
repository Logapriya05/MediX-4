import * as THREE from 'three';
import { TYPES, MIX } from './vehicles.js';
import { ZONES } from './zones.js';
import { mulberry32, clamp } from './util.js';

const S0 = 2.2;     // minimum standstill gap (m)
const TH = 1.15;    // time headway (s)
const LAT_MARGIN = 0.35;

function pick(r, mix) {
  let tot = 0;
  for (const k in mix) tot += mix[k];
  let x = r() * tot;
  for (const k in mix) { x -= mix[k]; if (x <= 0) return k; }
  return Object.keys(mix)[0];
}

export class Traffic {
  constructor(scene, path, variants, material) {
    this.scene = scene;
    this.path = path;
    this.variants = variants;
    this.material = material;
    this.list = [];
    this.rng = mulberry32(99);
    this.pools = {};
    this.tmp = {};
    this.density = 1;
  }

  laneU(s, dir, lane) {
    const p = this.path;
    return dir * (lane ? p.val('li', s) : p.val('lo', s));
  }

  getMesh(type) {
    const pool = this.pools[type] || (this.pools[type] = []);
    if (pool.length) { const m = pool.pop(); m.visible = true; return m; }
    const vs = this.variants[type];
    const g = vs[Math.floor(this.rng() * vs.length)];
    const m = new THREE.Mesh(g, this.material);
    m.castShadow = true; m.receiveShadow = false;
    m.rotation.order = 'YZX';
    this.scene.add(m);
    return m;
  }

  release(v) {
    v.mesh.visible = false;
    (this.pools[v.type] = this.pools[v.type] || []).push(v.mesh);
  }

  spawn(s, dir, zoneType, init = false) {
    const p = this.path;
    if (s < p.base + 30 || s > p.length - 30) return;
    const mix = { ...MIX[zoneType] };
    if (zoneType === 'hairpin' || zoneType === 'narrow') { delete mix.bus; delete mix.truck; }
    const type = pick(this.rng, mix);
    const T = TYPES[type];
    const lanes2 = p.val('li', s) !== p.val('lo', s);
    let lane = lanes2 ? (this.rng() < 0.55 ? 0 : 1) : 0;
    if (lanes2 && (type === 'bus' || type === 'truck' || type === 'auto' || type === 'bike')) lane = this.rng() < 0.8 ? 0 : 1;
    let u = this.laneU(s, dir, lane);
    // two-wheelers ride nearer the kerb
    if (type === 'bike' || type === 'auto') u += dir * (this.rng() * 0.6);
    // free space check
    for (const o of this.list) {
      if (o.dir !== dir) continue;
      if (Math.abs(o.s - s) < (o.L + T.L) / 2 + 9 && Math.abs(o.u - u) < (o.W + T.W) / 2 + 0.4) return;
    }
    const zl = p.val('limit', s);
    const vDes = Math.min(T.vmax, zl * (0.75 + this.rng() * 0.3));
    const v = {
      type, s, dir, lane, u, uTarget: u, uBase: u, uv: 0, L: T.L, W: T.W, aMax: T.a,
      v: init ? vDes * 0.8 : vDes * 0.9, vDes, mesh: this.getMesh(type), yield: 0, pitch: 0,
      jitter: (this.rng() - 0.5) * 0.25,
    };
    v.uBase += v.jitter * dir;
    this.list.push(v);
  }

  // Lateral overlap test between two agents at given lateral positions
  static overlap(ua, wa, ub, wb, m = LAT_MARGIN) { return Math.abs(ua - ub) < (wa + wb) / 2 + m; }

  // nearest obstacle ahead of agent `a` (in its travel direction) whose lateral span hits `u`
  leader(a, u, all, maxD = 80, ignore = null) {
    let best = null, bg = maxD;
    for (const b of all) {
      if (b === a || b === ignore) continue;
      const ahead = (b.s - a.s) * a.dir;
      if (ahead < 0) continue;               // centre behind us: not our leader
      const g = ahead - (a.L + b.L) / 2;      // negative = already overlapping -> treat as touching
      if (g > bg) continue;
      // opposing vehicles only block if the bodies would actually touch; after
      // waiting 6 s face to face, vehicles squeeze past (prevents narrow-lane deadlocks)
      if (a.dir !== b.dir) {
        if (!Traffic.overlap(u, a.W, b.u, b.W, 0.02)) continue;
      } else if (!Traffic.overlap(u, a.W, b.u, b.W)) continue;
      bg = g; best = b;
    }
    return best ? { b: best, g: Math.max(0.05, bg) } : null;
  }

  static idm(v, v0, aMax, lead, leadVel) {
    const bComf = 3.0;
    let acc = aMax * (1 - Math.pow(Math.max(0, v) / Math.max(0.1, v0), 4));
    if (lead) {
      const dv = v - leadVel;
      const sStar = S0 + Math.max(0, v * TH + (v * dv) / (2 * Math.sqrt(aMax * bComf)));
      acc -= aMax * (sStar / lead.g) ** 2;
    }
    return clamp(acc, -9, aMax);
  }

  curveSpeed(s, dir, v) {
    const p = this.path;
    const look = 8 + v * 2.2;
    const k = dir > 0 ? p.maxCurv(s, look) : p.maxCurv(s - look, look);
    return k > 1e-4 ? Math.sqrt(2.4 / k) : 99;
  }

  update(dt, amb, init = false) {
    const p = this.path;
    const z = p.zoneAt(amb.s + 120);
    const Z = ZONES[z.type];
    // ---- spawning
    let fwd = 0, onc = 0;
    for (const v of this.list) {
      if (v.s > amb.s - 10) { if (v.dir > 0) fwd++; else onc++; }
    }
    const wantF = Math.round(Z.fwd * this.density), wantO = Math.round(Z.onc * this.density);
    let tries = init ? 200 : 4;
    while (fwd < wantF && tries-- > 0) {
      const s = amb.s + (init ? 18 + this.rng() * 420 : (Z.fwd > 20 ? 240 : 300) + this.rng() * 190);
      const before = this.list.length;
      this.spawn(s, 1, p.zoneAt(s).type, init);
      if (this.list.length > before) fwd++;
    }
    tries = init ? 200 : 4;
    while (onc < wantO && tries-- > 0) {
      const s = amb.s + (init ? 25 + this.rng() * 460 : 340 + this.rng() * 150);
      const before = this.list.length;
      this.spawn(s, -1, p.zoneAt(s).type, init);
      if (this.list.length > before) onc++;
    }

    const all = this.list.concat([amb]);
    // ---- behaviour
    for (const v of this.list) {
      const ahead = (v.s - amb.s);
      // yield to the ambulance (siren): same-direction vehicles ahead pull toward the left kerb
      const hw = p.val('hw', v.s);
      let uT = v.dir * Math.abs(this.laneU(v.s, v.dir, v.lane)) + v.jitter * v.dir;
      if (v.type === 'bike' || v.type === 'auto') uT += v.dir * 0.35;
      let v0 = Math.min(v.vDes, p.val('limit', v.s) * 1.05);
      if (v.dir > 0 && ahead > 0 && ahead < 95 && Traffic.overlap(v.u, v.W, amb.u, amb.W, 1.6)) v.yield = 4;
      if (v.dir < 0 && ahead > -5 && ahead < 70 && hw < 4.8) v.yield = Math.max(v.yield, 1.5);
      if (v.yield > 0) {
        v.yield -= dt;
        const edge = v.dir * (hw - v.W / 2 - 0.3);
        uT = v.dir > 0 ? Math.max(uT, edge) : Math.min(uT, edge);
        if (v.dir > 0 && ahead > -3) v0 *= 0.5;
      }
      // never leave the carriageway
      uT = clamp(uT, -hw + v.W / 2 + 0.15, hw - v.W / 2 - 0.15);
      v.uTarget = uT;
      // narrow lane: crawl past oncoming vehicles
      if (hw < 2.8) {
        for (const o of all) {
          if (o === v || o.dir === v.dir) continue;
          const rel = (o.s - v.s) * v.dir;
          if (rel > -2 && rel < 18) { v0 = Math.min(v0, 2.2); break; }
        }
      }
      // longitudinal
      v0 = Math.min(v0, this.curveSpeed(v.s, v.dir, v.v));
      const lead = this.leader(v, v.u, all, 90);
      const lv = lead ? lead.b.v * lead.b.dir * v.dir : 0;
      let acc = Traffic.idm(v.v, v0, v.aMax, lead, lv);
      v.v = Math.max(0, v.v + acc * dt);
      v.stuck = v.v < 0.3 ? (v.stuck || 0) + dt : 0;
      v.acc = acc;
      // lateral: critically damped toward target, with check that the target side is free
      const want = v.uTarget - v.u;
      const outside = Math.abs(v.u) > hw - v.W / 2 - 0.1;
      if (Math.abs(want) > 0.05) {
        const dirU = Math.sign(want);
        const probeU = v.u + dirU * 0.6;
        for (const o of all) {
          if (o === v) continue;
          const rel = (o.s - v.s) * v.dir;
          if (rel < -(v.L + o.L) / 2 - 1 || rel > (v.L + o.L) / 2 + 4) continue;
          if (dirU * (o.u - v.u) > 0 && Traffic.overlap(probeU, v.W, o.u, o.W, 0.25)) {
            v.uTarget = v.u;
            // off the road edge and blocked: drop back to find a gap instead of pushing in
            if (outside) v.v = Math.max(0, v.v - 3 * dt);
            break;
          }
        }
      }
      const k = 2.2;
      v.uv += ((v.uTarget - v.u) * k * k - 2 * k * v.uv) * dt;
      v.uv = clamp(v.uv, -1.4, 1.4);
      v.u += v.uv * dt;
      v.s += v.dir * v.v * dt;
    }
    // ---- gridlock breaker: two vehicles face to face for 10 s -> the one
    // farther from the camera leaves the road out of view
    for (const v of all) {
      if ((v.stuck || 0) < 10) continue;
      const l = this.leader(v, v.u, all, 12);
      if (!l || l.b.dir === v.dir) continue;
      const cand = [v, l.b].filter((o) => o !== amb).sort((p2, q2) => Math.abs(q2.s - amb.s) - Math.abs(p2.s - amb.s))[0];
      if (cand && (Math.abs(cand.s - amb.s) > 35 || v.stuck > 20)) cand.remove = true;
    }
    // ---- despawn
    for (let i = this.list.length - 1; i >= 0; i--) {
      const v = this.list[i];
      const rel = v.s - amb.s;
      const big = v.type === 'bus' || v.type === 'truck';
      if (v.remove || (big && Math.abs(rel) > 45 && Math.min(p.val('hw', v.s + v.dir * 45), p.val('hw', v.s)) < 2.7)) {
        this.release(v); this.list.splice(i, 1); continue;
      }
      if ((v.dir > 0 && (rel < -70 || rel > 700)) || (v.dir < 0 && rel < -60) || v.s < p.base + 5 || v.s > p.length - 5) {
        this.release(v);
        this.list.splice(i, 1);
      }
    }
    // ---- pose
    const a = this.tmp, b = {};
    for (const v of this.list) {
      const half = Math.min(v.L * 0.35, 2.2);
      p.point(v.s + half * v.dir, v.u, a);
      p.point(v.s - half * v.dir, v.u, b);
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2, cy = (a.y + b.y) / 2;
      const yaw = Math.atan2(-(a.z - b.z), a.x - b.x) + Math.atan(v.uv / Math.max(2, v.v)) * v.dir;
      const pitch = Math.atan2(a.y - b.y, Math.hypot(a.x - b.x, a.z - b.z));
      v.mesh.position.set(cx, cy + 0.02, cz);
      v.mesh.rotation.set(0, yaw, pitch - (v.acc || 0) * 0.004);
    }
  }

  clear() {
    for (const v of this.list) this.release(v);
    this.list.length = 0;
  }
}
