import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clamp } from './util.js';
import { Traffic } from './traffic.js';


// Load a GLB. Embedded data: URLs are decoded in-page and parsed directly, and
// textures load through <img> instead of fetch(), so the model works on hosts
// whose security policy blocks fetch() of data: and blob: URLs.
let glbCache = null;
let pending = 0;
const ORIGINAL_CIB = typeof window !== 'undefined' ? window.createImageBitmap : undefined;
async function loadGLB(url) {
  const loader = new GLTFLoader();
  let buf;
  if (url.startsWith('data:')) {
    if (!glbCache) {
      const b64 = url.slice(url.indexOf(',') + 1);
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      glbCache = bytes.buffer;
    }
    buf = glbCache.slice(0);
  } else {
    buf = await new Promise((res, rej) => {
      const fl = new THREE.FileLoader(); fl.setResponseType('arraybuffer'); fl.load(url, res, undefined, rej);
    });
  }
  // force the <img>-based texture path (ImageBitmapLoader uses fetch on blob: URLs)
  pending++;
  try { window.createImageBitmap = undefined; } catch (e) { /* ignore */ }
  try {
    return await new Promise((res, rej) => loader.parse(buf, '', res, rej));
  } finally {
    pending--;
    if (!pending) { try { window.createImageBitmap = ORIGINAL_CIB; } catch (e) { /* ignore */ } }
  }
}

export const AMB = { L: 4.4, W: 1.72, H: 2.35, wheelbase: 2.62, mass: 1480 };

// Loads the user's ambulance GLB and rebuilds it as body + 4 independent wheels.
// Result faces +X, sits on y = 0, realistic size (4.4 m long).
export async function loadAmbulanceModel(url, envMap) {
  const gltf = await loadGLB(url);
  gltf.scene.updateMatrixWorld(true);
  let src = null;
  gltf.scene.traverse((o) => { if (o.isMesh && !src) src = o; });
  const geo = src.geometry.clone();
  geo.applyMatrix4(src.matrixWorld);
  geo.rotateY(-Math.PI / 2); // model front (-Z after node transform) -> +X
  // After this: X = length (front +), Y = up, Z = width.
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const len = bb.max.x - bb.min.x;
  const S = AMB.L / len;
  const WF = 0.8; // the low-poly source is stylistically wide; bring to real van proportions

  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const wheelBoxes = [
    { x0: 1.2, x1: 2.05, front: true }, { x0: -2.15, x1: -1.28, front: false },
  ];
  const which = (x, y, z) => {
    if (y > 0.46 || y < -0.32) return -1;
    const az = Math.abs(z);
    if (az < 0.93 || az > 1.29) return -1;
    for (let k = 0; k < 2; k++) if (x > wheelBoxes[k].x0 && x < wheelBoxes[k].x1) return k * 2 + (z > 0 ? 1 : 0);
    return -1;
  };
  const bodyIdx = [], wheelIdx = [[], [], [], []];
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    const wa = which(pos.getX(a), pos.getY(a), pos.getZ(a));
    const wb = which(pos.getX(b), pos.getY(b), pos.getZ(b));
    const wc = which(pos.getX(c), pos.getY(c), pos.getZ(c));
    if (wa >= 0 && wa === wb && wb === wc) wheelIdx[wa].push(a, b, c);
    else bodyIdx.push(a, b, c);
  }
  const ground = -bb.min.y;
  geo.translate(0, ground, 0);
  geo.scale(S, S, S * WF);
  const material = src.material;
  material.envMap = envMap || null;
  material.envMapIntensity = 0.9;
  if ('clearcoat' in material) { material.clearcoat = 0.6; material.clearcoatRoughness = 0.25; }
  material.roughness = Math.min(material.roughness ?? 0.5, 0.45);

  const root = new THREE.Group();          // positioned on the road (yaw + road pitch)
  const body = new THREE.Group();          // suspension: roll, squat, bounce
  root.add(body);
  const sub = (list) => {
    const g = geo.clone();
    g.setIndex(list);
    return g;
  };
  const bodyMesh = new THREE.Mesh(sub(bodyIdx), material);
  bodyMesh.castShadow = true; bodyMesh.receiveShadow = true;
  body.add(bodyMesh);

  const wheels = [];
  wheelIdx.forEach((list, k) => {
    const g = sub(list);
    g.computeBoundingBox();
    const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
    // only keep the referenced vertices' bounds: recompute from indices
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
    const P = g.attributes.position;
    for (const i of list) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    c.set((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    g.translate(-c.x, -c.y, -c.z);
    const steer = new THREE.Group(); steer.position.copy(c);
    const spin = new THREE.Mesh(g, material);
    spin.castShadow = true;
    steer.add(spin);
    root.add(steer);
    wheels.push({ steer, spin, front: k < 2, r: (maxY - minY) / 2 });
  });

  // Emergency light bar overlays (roof pods), flashing red / blue
  const lightMat = [
    new THREE.MeshBasicMaterial({ color: 0xff1a1a }),
    new THREE.MeshBasicMaterial({ color: 0x1a4dff }),
  ];
  const glowTex = makeGlow();
  const lights = [];
  const podX = 0.655 * S, podY = (2.185 + ground) * S, podZ = 0.79 * S * WF;
  for (const [k, sz] of [[0, -1], [1, 1]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.56 * S, 0.31 * S, 0.47 * S * WF), lightMat[k].clone());
    m.position.set(podX, podY, sz * podZ);
    body.add(m);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k ? 0x3366ff : 0xff2222, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    spr.scale.set(1.6, 1.6, 1);
    spr.position.copy(m.position);
    body.add(spr);
    lights.push({ mesh: m, spr, base: k ? new THREE.Color(0x1a4dff) : new THREE.Color(0xff1a1a) });
  }
  // grille flashers
  for (const [k, sz] of [[0, -1], [1, 1]]) {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: k ? 0x3366ff : 0xff2222, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    spr.scale.set(0.7, 0.7, 1);
    spr.position.set(AMB.L / 2 + 0.02, 0.62, sz * 0.45);
    body.add(spr);
    lights.push({ spr, base: k ? new THREE.Color(0x1a4dff) : new THREE.Color(0xff1a1a) });
  }
  return { root, body, wheels, lights, material };
}

function makeGlow() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// --------------------------------------------------------------------------
// Autonomous driving controller (path following + overtaking + energy model)
export class AmbulanceDriver {
  constructor(path, s0) {
    this.path = path;
    this.s = s0; this.v = 6; this.a = 0;
    this.u = path.val('li', s0); this.uv = 0; this.uTarget = this.u;
    this.L = AMB.L; this.W = AMB.W; this.dir = 1;
    this.passing = null;
    this.steer = 0; this.spin = 0; this.t = 0;
    this.yaw = 0; this.roll = 0; this.pitchA = 0;
    // energy
    this.soc = 0.864; this.power = 0; this.motorTemp = 34; this.odo = 0;
    this.capacityWh = 5120;
    this.status = 'DRIVE';
  }

  laneHome(s) {
    const p = this.path;
    return p.val('li', s); // inner lane on multi-lane roads; lane centre on two-lane roads
  }

  targetSpeed(traffic) {
    const p = this.path;
    let vt = p.val('limit', this.s) * 1.6; // emergency run: well above normal traffic
    // curvature preview with braking distance
    const b = 3.2, alat = 3.4;
    for (let d = 0; d <= 70; d += 2) {
      const k = Math.abs(p.val('k', this.s + d));
      if (k < 1e-4) continue;
      const vc = Math.sqrt(alat / k);
      vt = Math.min(vt, Math.sqrt(vc * vc + 2 * b * d));
    }
    // narrow upcoming roads
    vt = Math.min(vt, p.val('limit', this.s + 30) * 1.6 + 3);
    void traffic;
    return vt;
  }

  update(dt, traffic) {
    const p = this.path;
    const all = traffic.list;
    this.t += dt;
    const hw = p.val('hw', this.s);
    const home = this.laneHome(this.s);
    // --- overtaking logic
    const lead = traffic.leader(this, this.u, all, 45);
    if (this.passing) {
      const b = this.passing;
      const gone = !all.includes(b);
      const passed = gone || b.s < this.s - (this.L + b.L) / 2 - 3;
      const blocked = this.oncomingBlocked(all, this.uTarget, 60, b);
      if (passed) this.passing = null;
      else if (blocked) { this.passing = null; }
      else this.uTarget = this.passU(b, hw);
    }
    if (!this.passing) {
      this.uTarget = home;
      if (lead && lead.b.dir > 0 && lead.g < 60 && lead.b.v < this.targetSpeed() - 1.0) {
        const pu = this.passU(lead.b, hw);
        const yielding = lead.b.yield > 0 || lead.b.v < 4;
        const curvy = yielding ? p.maxCurv(this.s, 50) > 1 / 22 : (p.maxCurv(this.s, 95) > 1 / 26 || p.maxCurv(this.s, 45) > 1 / 58);
        if (pu !== null && !curvy && !this.oncomingBlocked(all, pu, 110 + this.v * 5, lead.b) && !this.sameDirBlocked(all, pu, lead.b)) {
          this.passing = lead.b; this.uTarget = pu;
        }
      }
    }
    // --- longitudinal (IDM against whatever occupies our corridor, now or where we're going)
    let v0 = this.targetSpeed(traffic);
    // motor power limit (8 kW peak) on gradients
    const grade = p.val('g', this.s);
    const Fres = AMB.mass * 9.81 * (grade + 0.014) + 0.5 * 1.2 * 1.25 * this.v * this.v;
    if (Fres > 0) v0 = Math.min(v0, 8000 * 0.9 / Fres + 0.3);
    if (hw < 2.8) {
      for (const o of all) { if (o.dir < 0) { const rel = o.s - this.s; if (rel > -2 && rel < 20) { v0 = Math.min(v0, 4); break; } } }
    }
    const l1 = traffic.leader(this, this.u, all, 140);
    const l2 = Math.abs(this.uTarget - this.u) > 0.3 ? traffic.leader(this, this.uTarget, all, 140) : null;
    let acc = 99;
    for (const l of [l1, l2]) {
      if (!l) continue;
      const lv = l.b.v * l.b.dir;
      acc = Math.min(acc, Traffic.idm(this.v, v0, 2.4, l, lv));
    }
    if (acc === 99) acc = Traffic.idm(this.v, v0, 2.4, null, 0);
    acc = clamp(acc, -7.5, 2.4);
    // smooth jerk
    this.a += clamp(acc - this.a, -14 * dt, 6 * dt);
    this.v = Math.max(0, this.v + this.a * dt);
    this.stuck = this.v < 0.3 ? (this.stuck || 0) + dt : 0;
    // --- lateral: never slide sideways into a vehicle that is alongside
    if (Math.abs(this.uTarget - this.u) > 0.05) {
      const dirU = Math.sign(this.uTarget - this.u);
      const probe = this.u + dirU * 0.5;
      for (const o of all) {
        const rel = o.s - this.s;
        if (Math.abs(rel) > (this.L + o.L) / 2 + 1.5) continue;
        if (dirU * (o.u - this.u) > 0 && Traffic.overlap(probe, this.W, o.u, o.W, 0.3)) { this.uTarget = this.u; this.uv *= 0.5; break; }
      }
    }
    const uMax = hw - this.W / 2 - 0.2;
    this.uTarget = clamp(this.uTarget, -uMax, uMax);
    const k = 1.9;
    this.uv += ((this.uTarget - this.u) * k * k - 2 * k * this.uv) * dt;
    this.uv = clamp(this.uv, -1.6, 1.6);
    this.u = clamp(this.u + this.uv * dt, -uMax, uMax);
    const ds = this.v * dt;
    this.s += ds;
    this.odo += ds;
    // --- energy model
    const Fx = AMB.mass * this.a + AMB.mass * 9.81 * (grade + 0.014) + 0.5 * 1.2 * 1.25 * this.v * this.v;
    let P = Fx * this.v;
    P = P > 0 ? Math.min(P / 0.9, 8000) : Math.max(P * 0.65, -6000);
    P += 160; // medical auxiliaries
    this.power += (P - this.power) * Math.min(1, dt * 3);
    this.soc = clamp(this.soc - (this.power * dt) / 3600 / this.capacityWh, 0.12, 0.98);
    this.usedWh = (this.usedWh || 0) + (this.power * dt) / 3600;
    this.motorTemp += ((34 + Math.max(0, this.power) / 1000 * 4.2) - this.motorTemp) * dt * 0.02;
    this.status = this.v < 0.3 ? 'HOLD' : this.power < -150 ? 'REGEN' : this.power > 6500 ? 'PEAK' : 'DRIVE';
  }

  passU(b, hw) {
    // squeeze past vehicles that have pulled over for the siren
    const clear = b.yield > 0 ? 0.45 : 0.75;
    const u = b.u - (b.W / 2 + this.W / 2 + clear);
    if (u < -hw + this.W / 2 + 0.2) return null;
    return u;
  }

  oncomingBlocked(all, u, dist, ignore) {
    for (const o of all) {
      if (o === ignore || o.dir > 0) continue;
      const rel = o.s - this.s;
      if (rel < -6 || rel > dist + o.v * 4) continue;
      if (Traffic.overlap(u, this.W, o.u, o.W, 0.25)) return true;
    }
    return false;
  }

  sameDirBlocked(all, u, ignore) {
    for (const o of all) {
      if (o === ignore || o.dir < 0) continue;
      const rel = o.s - this.s;
      if (rel < -8 || rel > 40) continue;
      if (Traffic.overlap(u, this.W, o.u, o.W, 0.5)) return true;
    }
    return false;
  }
}
