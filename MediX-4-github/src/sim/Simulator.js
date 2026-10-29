import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoutePath } from './path.js';
import { TerrainField, TerrainManager } from './terrain.js';
import { makeTextures } from './textures.js';
import { makeSharedAssets, buildChunk, CHUNK } from './chunks.js';
import { buildVariants, makeVehicleMaterial } from './vehicles.js';
import { Traffic } from './traffic.js';
import { loadAmbulanceModel, AmbulanceDriver, AMB } from './ambulance.js';
import { ZONES } from './zones.js';
import { clamp, lerp, ridged, fbm } from './util.js';

const AHEAD = 620, BEHIND = 140;

export class Simulator {
  constructor(container, { onStats, onReady, modelUrl = '/ambulance.glb' } = {}) {
    this.container = container;
    this.onStats = onStats;
    this.onReady = onReady;
    this.modelUrl = modelUrl;
    this.active = true;
    this.disposed = false;
    this.clock = new THREE.Clock();
    this.statT = 0;
    this.frameTimes = [];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    this.init();
  }

  init() {
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this.pixelRatio);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 0.88;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(r.domElement);
    r.domElement.style.display = 'block';

    const scene = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(56, 1, 0.3, 4200);

    // --- sky & sun
    const sky = this.sky = new Sky();
    sky.scale.setScalar(8000);
    const u = sky.material.uniforms;
    u.turbidity.value = 5.5; u.rayleigh.value = 1.35; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.82;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 47), THREE.MathUtils.degToRad(200));
    u.sunPosition.value.copy(this.sunDir);
    scene.add(sky);
    // environment map from the sky for reflections
    const pm = new THREE.PMREMGenerator(r);
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(8000);
    Object.assign(sky2.material.uniforms.sunPosition.value, this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = u[k].value;
    envScene.add(sky2);
    const hemiEnv = new THREE.Mesh(new THREE.SphereGeometry(100, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5a5448, side: THREE.BackSide }));
    envScene.add(hemiEnv);
    this.env = pm.fromScene(envScene, 0.02).texture;
    scene.environment = this.env;
    scene.environmentIntensity = 0.32;
    pm.dispose();

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a45, 0.38);
    scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d8, 3.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -48; sc.right = 48; sc.top = 48; sc.bottom = -48; sc.near = 10; sc.far = 400;
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.35;
    scene.add(sun); scene.add(sun.target);

    this.fogCol = new THREE.Color(0xc8d3dc);
    scene.fog = new THREE.Fog(this.fogCol.clone(), 80, 600);

    // --- shared assets (built once)
    this.T = makeTextures();
    this.assets = makeSharedAssets(this.T);
    this.terrain = new TerrainManager(null, scene, this.T);
    this.vehMat = makeVehicleMaterial(this.env);
    this.variants = buildVariants();
    this.assets.parked = { variants: this.variants, mat: this.vehMat };
    this.traffic = new Traffic(scene, null, this.variants, this.vehMat);
    this.chunks = new Map();
    this.footprints = [];

    this.makeMountains();

    this.camPos = new THREE.Vector3(); this.camVel = new THREE.Vector3();
    this.lookPos = new THREE.Vector3(); this.lookVel = new THREE.Vector3();
    this.camInit = false;
    this.zoneKey = null;

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);

    // initial world build (synchronous so the first frame is complete)
    this.buildWorld(this.only || null);

    loadAmbulanceModel(this.modelUrl, this.env).then((m) => {
      if (this.disposed) return;
      this.amb = m;
      scene.add(m.root);
      this.onReady && this.onReady();
    }).catch((e) => {
      console.error('Ambulance model failed to load', e);
      this.onReady && this.onReady(e);
    });

    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  // (Re)build the road world. only = zone key to repeat, or null for the full tour.
  buildWorld(only) {
    this.only = only;
    for (const ch of this.chunks.values()) { this.scene.remove(ch.group); ch.dispose(); }
    this.chunks.clear();
    this.footprints = [];
    this.terrain.clear();
    this.traffic.clear();
    const path = this.path = new RoutePath(20251, only);
    this.field = new TerrainField(path);
    this.terrain.field = this.field;
    this.traffic.path = path;
    path.listeners.push((s0, s1) => {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (let i = s0; i < s1; i += 8) {
        const q = i - path.base;
        x0 = Math.min(x0, path.x[q]); x1 = Math.max(x1, path.x[q]);
        z0 = Math.min(z0, path.z[q]); z1 = Math.max(z1, path.z[q]);
      }
      this.terrain.markDirtyAround(x0, z0, x1, z1);
    });
    path.ensure(4000);
    const old = this.driver;
    this.driver = new AmbulanceDriver(path, 320);
    if (old) { this.driver.soc = old.soc; this.driver.odo = old.odo; this.driver.motorTemp = old.motorTemp; }
    this.updateChunks(true);
    const p0 = path.point(this.driver.s);
    this.terrain.update(p0.x, p0.z, 1e9);
    this.traffic.update(0.016, this.driver, true);
    // snap fog / backdrop to the new environment
    const Z = ZONES[path.zoneAt(this.driver.s).type];
    this.scene.fog.near = Z.fog[0]; this.scene.fog.far = Z.fog[1];
    this.camInit = false;
    this.zoneKey = null;
    this.statT = 0;
  }

  setEnvironment(only) {
    if (only === this.only) return;
    this.buildWorld(only);
  }

  makeMountains() {
    // distant mountain silhouettes on a ring that follows the camera
    const seg = 256, R = 3400;
    const pos = [], col = [], idx = [];
    const cLow = new THREE.Color(0x9fb2c2), cHigh = new THREE.Color(0x6f8496), cSnow = new THREE.Color(0xeef3f8);
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const x = Math.cos(a) * R, z = Math.sin(a) * R;
      const n = ridged(Math.cos(a) * 3 + 10, Math.sin(a) * 3 + 10, 5);
      const n2 = fbm(Math.cos(a) * 1.4 + 3, Math.sin(a) * 1.4 - 2, 3) * 0.5 + 0.5;
      const h = 120 + n * 520 * (0.4 + n2);
      pos.push(x, -200, z, x, h, z);
      col.push(cLow.r, cLow.g, cLow.b);
      const snow = h > 520 ? 0.85 : h > 420 ? 0.4 : 0;
      const c = cHigh.clone().lerp(cSnow, snow);
      col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, transparent: true, opacity: 0.92, depthWrite: false }));
    m.renderOrder = -1;
    m.frustumCulled = false;
    this.mountains = m;
    this.scene.add(m);
  }

  resize() {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 70 : 56;
    this.camera.updateProjectionMatrix();
  }

  // active = render the feed; background = keep driving without rendering
  // (used while the Dashboard is open so its numbers stay live)
  setActive(a, background = false) {
    this.active = a;
    this.background = background;
    if (a || background) { this.clock.getDelta(); if (!this.raf) this.raf = requestAnimationFrame(this.loop); }
  }

  updateChunks(sync = false) {
    const s = this.driver.s;
    const c0 = Math.floor((s - BEHIND) / CHUNK), c1 = Math.floor((s + AHEAD) / CHUNK);
    const t0 = performance.now();
    for (let c = c0; c <= c1; c++) {
      if (this.chunks.has(c)) continue;
      if (!sync && performance.now() - t0 > 6) break;
      const ch = buildChunk(c, this.path, this.field, this.assets, this.footprints);
      if (ch) { this.scene.add(ch.group); this.chunks.set(c, ch); }
      if (!sync) break; // at most one chunk per frame when streaming
    }
    for (const [c, ch] of this.chunks) {
      if (c < c0 - 1 || c > c1 + 2) { this.scene.remove(ch.group); ch.dispose(); this.chunks.delete(c); }
    }
    if (this.footprints.length > 900) this.footprints.splice(0, this.footprints.length - 600);
  }

  loop() {
    this.raf = null;
    if (this.disposed) return;
    if (!this.active && !this.background) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 1 / 20);
    const t0 = performance.now();
    if (!this.active) { if (this.amb) this.step(dt); return; }
    if (this.amb) this.step(dt);
    else this.idleCamera(dt);
    this.renderer.render(this.scene, this.camera);
    this.adaptQuality(performance.now() - t0, dt);
  }

  idleCamera() {
    const p = this.path.point(this.driver.s);
    this.camera.position.set(p.x - p.tx * 10, p.y + 4, p.z - p.tz * 10);
    this.camera.lookAt(p.x, p.y + 1, p.z);
    this.sky.position.copy(this.camera.position);
  }

  adaptQuality(ms, dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    const maxPR = Math.min(window.devicePixelRatio || 1, 1.5);
    let pr = this.pixelRatio;
    if (avg > 1 / 38 && pr > 0.7) pr = Math.max(0.7, pr - 0.15);
    else if (avg < 1 / 57 && pr < maxPR) pr = Math.min(maxPR, pr + 0.1);
    if (pr !== this.pixelRatio) { this.pixelRatio = pr; this.renderer.setPixelRatio(pr); this.resize(); }
    void ms;
  }

  step(dt) {
    const d = this.driver, p = this.path;
    // world streaming
    p.ensure(d.s + 2800);
    p.trim(d.s - 1400);
    d.update(dt, this.traffic);
    this.traffic.update(dt, d);
    this.updateChunks();

    // --- ambulance pose: axles on the road
    const A = this.amb;
    const half = AMB.wheelbase / 2;
    const f = p.point(d.s + half, d.u), r = p.point(d.s - half, d.u);
    const cx = (f.x + r.x) / 2, cz = (f.z + r.z) / 2, cy = (f.y + r.y) / 2;
    const yaw = Math.atan2(-(f.z - r.z), f.x - r.x) + Math.atan(d.uv / Math.max(2.5, d.v));
    const pitch = Math.atan2(f.y - r.y, Math.hypot(f.x - r.x, f.z - r.z));
    A.root.position.set(cx, cy, cz);
    A.root.rotation.order = 'YZX';
    A.root.rotation.set(0, yaw, pitch);
    // suspension feel
    const k = p.val('k', d.s);
    const alat = d.v * d.v * k;
    d.roll += (clamp(alat * 0.011, -0.04, 0.04) - d.roll) * Math.min(1, dt * 4);
    d.pitchA += (clamp(d.a * 0.006, -0.03, 0.02) - d.pitchA) * Math.min(1, dt * 4);
    const bounce = Math.sin(d.t * 9.1) * 0.004 * Math.min(1, d.v / 8) + Math.sin(d.t * 3.3) * 0.006 * Math.min(1, d.v / 8);
    A.body.rotation.order = 'YZX';
    A.body.rotation.set(d.roll, 0, d.pitchA);
    A.body.position.y = bounce;
    // wheels
    const steerT = Math.atan(AMB.wheelbase * (k + 0)) + Math.atan(d.uv / Math.max(3, d.v)) * 0.8;
    d.steer += (clamp(steerT, -0.6, 0.6) - d.steer) * Math.min(1, dt * 8);
    d.spin -= (d.v * dt) / (A.wheels[0].r || 0.3);
    for (const w of A.wheels) {
      w.steer.rotation.y = w.front ? d.steer : 0;
      w.spin.rotation.z = d.spin;
    }
    // siren pattern
    const ph = (d.t * 2.6) % 1;
    const on0 = ph < 0.25 || (ph > 0.5 && ph < 0.6), on1 = (ph > 0.25 && ph < 0.5) || (ph > 0.75 && ph < 0.85);
    A.lights.forEach((L, i) => {
      const on = i % 2 === 0 ? on0 : on1;
      if (L.mesh) L.mesh.material.color.copy(L.base).multiplyScalar(on ? 1.6 : 0.18);
      L.spr.material.opacity = on ? 0.95 : 0;
    });

    // --- environment blend
    const zone = p.zoneAt(d.s);
    const Z = ZONES[zone.type];
    const blend = Math.min(1, dt * 0.35);
    const fog = this.scene.fog;
    fog.near = lerp(fog.near, Z.fog[0], blend);
    fog.far = lerp(fog.far, Z.fog[1], blend);
    const hill = clamp(p.val('mtn', d.s) / 20, 0, 1);
    const fogTarget = new THREE.Color(0xd2cbbb).lerp(new THREE.Color(0xbfd0de), hill);
    this.fogCol.lerp(fogTarget, blend);
    fog.color.copy(this.fogCol);
    this.mountains.scale.y = lerp(this.mountains.scale.y || 0.35, 0.3 + 0.7 * hill, blend);

    this.updateCamera(dt, A, d, cx, cy, cz, yaw);

    // sun & shadow camera follow the vehicle (snapped to texels to avoid shimmer)
    const texel = 96 / 2048;
    const tx = Math.round(cx / texel) * texel, tz = Math.round(cz / texel) * texel, ty = Math.round(cy / texel) * texel;
    this.sun.target.position.set(tx, ty, tz);
    this.sun.position.set(tx + this.sunDir.x * 200, ty + this.sunDir.y * 200, tz + this.sunDir.z * 200);
    this.sun.target.updateMatrixWorld();

    this.sky.position.copy(this.camera.position);
    this.mountains.position.set(this.camera.position.x, cy - 40, this.camera.position.z);
    this.terrain.update(cx, cz, 5);

    // --- stats for HUD
    this.statT -= dt;
    if (this.statT <= 0 && this.onStats) {
      this.statT = 0.15;
      if (this.zoneKey !== zone.type) this.zoneKey = zone.type;
      this.onStats({
        speed: d.v * 3.6, soc: d.soc * 100, power: d.power / 1000, motorTemp: d.motorTemp,
        status: d.status, zone: Z.label, zoneKey: zone.type, grade: p.val('g', d.s) * 100,
        elevation: cy, odo: d.odo / 1000, overtaking: !!d.passing, traffic: this.traffic.list.length,
        whkm: d.odo > 300 ? d.usedWh / (d.odo / 1000) : 95, limit: p.val('limit', d.s) * 3.6 * 1.6,
        accel: d.a, auto: !this.only, usedWh: d.usedWh || 0,
      });
    }
  }

  updateCamera(dt, A, d, cx, cy, cz, yaw) {
    const p = this.path;
    const dist = 7.4 + d.v * 0.11;
    const height = 2.75 + d.v * 0.03;
    const back = p.point(d.s - dist, d.u * 0.55);
    const target = new THREE.Vector3(back.x, back.y + height, back.z);
    // keep above terrain / road
    const gh = Math.max(this.field.height(target.x, target.z), back.y);
    if (target.y < gh + 1.6) target.y = gh + 1.6;
    const look = new THREE.Vector3(cx + Math.cos(yaw) * 5.5, cy + 1.25, cz - Math.sin(yaw) * 5.5);
    if (!this.camInit) { this.camPos.copy(target); this.lookPos.copy(look); this.camInit = true; }
    // critically damped springs
    const spring = (pos, vel, tgt, w) => {
      const ax = (tgt.x - pos.x) * w * w - 2 * w * vel.x;
      const ay = (tgt.y - pos.y) * w * w - 2 * w * vel.y;
      const az = (tgt.z - pos.z) * w * w - 2 * w * vel.z;
      vel.x += ax * dt; vel.y += ay * dt; vel.z += az * dt;
      pos.x += vel.x * dt; pos.y += vel.y * dt; pos.z += vel.z * dt;
    };
    spring(this.camPos, this.camVel, target, 4.2);
    spring(this.lookPos, this.lookVel, look, 7.5);
    const cam = this.camera;
    const shake = Math.min(1, d.v / 12) * 0.018;
    cam.position.set(this.camPos.x, this.camPos.y + Math.sin(d.t * 13.7) * shake, this.camPos.z);
    cam.lookAt(this.lookPos);
    const fovT = (cam.aspect < 1 ? 70 : 56) + d.v * 0.25;
    cam.fov += (fovT - cam.fov) * Math.min(1, dt * 2);
    cam.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ro && this.ro.disconnect();
    for (const ch of this.chunks.values()) ch.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.renderer.dispose();
    this.renderer.forceContextLoss?.();
    this.renderer.domElement.remove();
  }
}
