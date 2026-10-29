import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Shared PBR materials, canvas textures and helpers for the component models.

export function canvasTex(w, h, draw, { srgb = true, repeat = false } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function brushed(x, w, h, base) {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    const y = Math.random() * h, a = Math.random() * 0.08;
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${a})`;
    x.fillRect(0, y, w, 1);
  }
}

let M = null;
export function mats() {
  if (M) return M;
  const brushTex = canvasTex(256, 256, (x, w, h) => brushed(x, w, h, '#bfc3c7'), { repeat: true });
  const castTex = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { const g = 110 + Math.random() * 40; x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  }, { srgb: false, repeat: true });
  M = {
    alu: new THREE.MeshPhysicalMaterial({ color: 0xc8ccd0, metalness: 0.9, roughness: 0.32, map: brushTex, clearcoat: 0.2 }),
    aluDark: new THREE.MeshStandardMaterial({ color: 0x8d9298, metalness: 0.85, roughness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xb9bec4, metalness: 1, roughness: 0.22 }),
    darkSteel: new THREE.MeshStandardMaterial({ color: 0x3b4046, metalness: 0.8, roughness: 0.45 }),
    blueCast: new THREE.MeshPhysicalMaterial({ color: 0x24508f, metalness: 0.35, roughness: 0.48, roughnessMap: castTex, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xd9824a, metalness: 1, roughness: 0.28 }),
    copperWire: new THREE.MeshStandardMaterial({ color: 0xc8692e, metalness: 0.9, roughness: 0.38 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc9a43f, metalness: 1, roughness: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x18191b, metalness: 0, roughness: 0.85 }),
    plasticBlack: new THREE.MeshStandardMaterial({ color: 0x1f2124, metalness: 0.1, roughness: 0.5 }),
    plasticGrey: new THREE.MeshStandardMaterial({ color: 0x6b7077, metalness: 0.1, roughness: 0.55 }),
    plasticWhite: new THREE.MeshStandardMaterial({ color: 0xeeeeea, metalness: 0, roughness: 0.45 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc8202a, metalness: 0.1, roughness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xf07a1a, metalness: 0.05, roughness: 0.45 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xdfefff, metalness: 0, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25, thickness: 0.01, depthWrite: false }),
    magnet: new THREE.MeshStandardMaterial({ color: 0x5b6168, metalness: 0.9, roughness: 0.3 }),
    lamination: new THREE.MeshStandardMaterial({ color: 0x4b5058, metalness: 0.85, roughness: 0.42 }),
  };
  return M;
}

export const rbox = (w, h, d, r = 0.004, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01));

export function mesh(geo, mat, parent, pos = [0, 0, 0], rot = null) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true; m.receiveShadow = true;
  parent && parent.add(m);
  return m;
}

// bolt head (hex) facing +Y
export function bolt(parent, pos, r = 0.006, rot = null, mat = null) {
  const g = new THREE.CylinderGeometry(r, r, r * 0.7, 6);
  return mesh(g, mat || mats().steel, parent, pos, rot);
}

// tube along a list of points
export function cable(parent, pts, r, mat, seg = 40) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.3);
  const m = mesh(new THREE.TubeGeometry(curve, seg, r, 10), mat, parent);
  m.userData.curve = curve;
  return m;
}

// spur gear extruded along Z (centered)
export function gear(rOuter, teeth, width, mat, rInner = rOuter * 0.18) {
  const s = new THREE.Shape();
  const rRoot = rOuter - rOuter * 0.09 - 0.002;
  for (let i = 0; i < teeth; i++) {
    const a0 = (i / teeth) * Math.PI * 2;
    const step = (Math.PI * 2) / teeth;
    const pts = [[rRoot, a0], [rOuter, a0 + step * 0.18], [rOuter, a0 + step * 0.45], [rRoot, a0 + step * 0.63]];
    pts.forEach(([r, a], k) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  const hole = new THREE.Path(); hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -width / 2);
  return new THREE.Mesh(g, mat);
}

// Highlight helper: give a set of meshes an emissive pulse when selected.
export function highlighter(groups) {
  const orig = new Map();
  const prep = (mt) => {
    const c = mt.clone();
    if (c.emissive) { c.emissive = new THREE.Color(0x39ff88); c.emissiveIntensity = 0; }
    return c;
  };
  const mark = (m) => {
    if (!m.material || orig.has(m)) return;
    m.material = Array.isArray(m.material) ? m.material.map(prep) : prep(m.material);
    orig.set(m, true);
  };
  for (const list of Object.values(groups)) list.forEach((o) => o.traverse ? o.traverse((c) => c.isMesh && mark(c)) : mark(o));
  const owners = new Map(); // mesh -> [group keys]
  for (const [k, list] of Object.entries(groups)) list.forEach((o) => {
    const add = (m) => { if (!owners.has(m)) owners.set(m, []); owners.get(m).push(k); };
    o.traverse ? o.traverse((c) => c.isMesh && add(c)) : add(o);
  });
  return (sel, t, dt) => {
    const glow = 0.2 + 0.04 * Math.sin(t * 2.5); // gentle, steady highlight
    for (const [m, keys] of owners) {
      const want = keys.includes(sel) ? glow : 0;
      const stepM = (mt) => { if (mt && mt.emissive) mt.emissiveIntensity += (want - mt.emissiveIntensity) * Math.min(1, dt * 8); };
      if (Array.isArray(m.material)) m.material.forEach(stepM); else stepM(m.material);
    }
  };
}

export function lerpVec(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
