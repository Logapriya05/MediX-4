import * as THREE from 'three';
import { Builder, hex } from './geom.js';

// All models: forward = +X, up = +Y, origin at ground centre.
const GLASS = hex('#1d2a33');
const TYRE = hex('#151515');
const HUB = hex('#9a9da1');
const DARK = hex('#222222');
const HEAD = [1.6, 1.55, 1.4];
const TAIL = [0.9, 0.04, 0.03];

function wheels(b, L, W, r, xs, wide = 0.22) {
  for (const x of xs) for (const sz of [1, -1]) {
    b.cylinder([x, r, sz * (W / 2 - wide / 2 + 0.01)], r, wide, 'z', 12, TYRE);
    b.cylinder([x, r, sz * (W / 2 - wide / 2 + 0.03)], r * 0.55, wide, 'z', 10, HUB);
  }
}

function lights(b, L, W, y, h = 0.13) {
  for (const sz of [1, -1]) {
    b.box([L / 2 - 0.02, y, sz * (W / 2 - 0.28)], [0.06, h, 0.32], 0, HEAD);
    b.box([-L / 2 + 0.02, y, sz * (W / 2 - 0.2)], [0.06, h, 0.24], 0, TAIL);
  }
}

function car(o) {
  const { L, W, r = 0.31, belt = 0.92, top = 1.45, fb, rb, ft, rt, color, roof = color, lower = color } = o;
  const b = new Builder();
  const body = hex(color), low = hex(lower);
  const prof = [
    [-L / 2 + 0.05, 0.24], [L / 2 - 0.08, 0.24], [L / 2, 0.42], [L / 2 - 0.05, belt - 0.2],
    [L / 2 - 0.35, belt - 0.04], [fb, belt], [rb, belt], [-L / 2 + 0.02, belt - 0.06], [-L / 2, 0.5],
  ];
  b.extrude(prof, -W / 2, W / 2, low);
  // greenhouse
  const cab = [[rb + 0.05, belt - 0.02], [fb - 0.05, belt - 0.02], [ft, top - 0.05], [rt, top - 0.05]];
  b.extrude(cab, -W / 2 + 0.1, W / 2 - 0.1, GLASS);
  // roof + pillars in body colour
  const rf = [[rt - 0.02, top - 0.09], [ft + 0.02, top - 0.09], [ft - 0.03, top], [rt + 0.03, top]];
  b.extrude(rf, -W / 2 + 0.09, W / 2 - 0.09, hex(roof));
  const mid = (fb + rb) / 2;
  b.box([mid, belt - 0.02, 0], [0.11, top - belt - 0.05, W - 0.17], 0, body);
  // A / C pillars (thin wedges)
  b.extrude([[fb - 0.02, belt - 0.02], [fb + 0.06, belt - 0.02], [ft + 0.04, top - 0.06], [ft - 0.04, top - 0.06]], -W / 2 + 0.085, -W / 2 + 0.115, body);
  b.extrude([[fb - 0.02, belt - 0.02], [fb + 0.06, belt - 0.02], [ft + 0.04, top - 0.06], [ft - 0.04, top - 0.06]], W / 2 - 0.115, W / 2 - 0.085, body);
  b.extrude([[rb - 0.05, belt - 0.02], [rb + 0.04, belt - 0.02], [rt + 0.06, top - 0.06], [rt - 0.02, top - 0.06]], -W / 2 + 0.085, -W / 2 + 0.115, body);
  b.extrude([[rb - 0.05, belt - 0.02], [rb + 0.04, belt - 0.02], [rt + 0.06, top - 0.06], [rt - 0.02, top - 0.06]], W / 2 - 0.115, W / 2 - 0.085, body);
  // bumpers & grille
  b.box([L / 2 - 0.05, 0.24, 0], [0.12, 0.2, W - 0.05], 0, DARK);
  b.box([-L / 2 + 0.05, 0.24, 0], [0.12, 0.2, W - 0.05], 0, DARK);
  b.box([L / 2 - 0.01, 0.48, 0], [0.04, 0.12, W * 0.45], 0, DARK);
  lights(b, L, W, 0.6);
  // mirrors
  for (const sz of [1, -1]) b.box([fb - 0.1, belt + 0.02, sz * (W / 2 + 0.05)], [0.12, 0.1, 0.12], 0, body);
  wheels(b, L, W, r, [L / 2 - o.fa, -L / 2 + o.ra]);
  return b;
}

function bus(color, stripe, roofC = '#e8e8e8') {
  const L = 10.8, W = 2.5, H = 3.1, r = 0.5;
  const b = new Builder();
  const c = hex(color);
  b.box([0, 0.38, 0], [L, H - 0.38, W], 0, c);
  b.box([0, H, 0], [L - 0.2, 0.08, W - 0.2], 0, hex(roofC));
  // window band sides
  b.box([-0.3, 1.45, 0], [L - 2.0, 0.95, W + 0.02], 0, GLASS, null, ['pz', 'nz']);
  // pillars
  for (let x = -L / 2 + 1.2; x < L / 2 - 1.4; x += 1.25) b.box([x, 1.45, 0], [0.1, 0.95, W + 0.04], 0, c, null, ['pz', 'nz']);
  b.box([0, 0.95, 0], [L, 0.18, W + 0.03], 0, hex(stripe), null, ['pz', 'nz', 'px', 'nx']);
  // windscreen + destination board
  b.box([L / 2 - 0.01, 1.15, 0], [0.04, 1.35, W - 0.25], 0, GLASS);
  b.box([L / 2, 2.6, 0], [0.05, 0.32, W - 0.6], 0, [0.05, 0.05, 0.05]);
  b.box([L / 2 + 0.01, 2.68, 0], [0.03, 0.16, W - 0.9], 0, [1.4, 0.55, 0.05]);
  b.box([-L / 2 + 0.01, 1.5, 0], [0.04, 0.9, W - 0.4], 0, GLASS);
  // door
  b.box([L / 2 - 1.3, 0.4, W / 2], [0.9, 2.2, 0.05], 0, GLASS);
  b.box([L / 2 - 0.05, 0.38, 0], [0.14, 0.3, W], 0, DARK);
  lights(b, L, W, 0.75, 0.18);
  wheels(b, L, W, r, [L / 2 - 2.0, -L / 2 + 2.6, -L / 2 + 1.6], 0.3);
  return b;
}

function truck(cabC, boxC, tarp) {
  const L = 8.4, W = 2.45, r = 0.5;
  const b = new Builder();
  const cab = hex(cabC);
  // chassis
  b.box([0, 0.55, 0], [L - 0.3, 0.3, W - 0.6], 0, DARK);
  // cab (Indian style flat-nose)
  b.box([L / 2 - 1.15, 0.8, 0], [2.2, 1.55, W], 0, cab);
  b.box([L / 2 - 1.05, 2.35, 0], [2.0, 0.55, W - 0.05], 0, cab);
  b.box([L / 2 - 0.06, 1.75, 0], [0.06, 0.9, W - 0.3], 0, GLASS);
  b.box([L / 2 - 1.2, 1.8, 0], [0.9, 0.7, W + 0.02], 0, GLASS, null, ['pz', 'nz']);
  b.box([L / 2 - 0.05, 2.65, 0], [0.08, 0.25, W - 0.1], 0, hex('#e8c21c'));
  // cargo body with painted sides
  b.box([-1.15, 0.85, 0], [5.9, 1.55, W], 0, hex(boxC));
  b.box([-1.15, 1.25, 0], [5.92, 0.2, W + 0.02], 0, hex('#d7262e'), null, ['pz', 'nz']);
  b.box([-1.15, 1.75, 0], [5.92, 0.14, W + 0.02], 0, hex('#1f5fbf'), null, ['pz', 'nz']);
  // tarp hump
  b.extrude([[-4.0, 2.4], [1.7, 2.4], [1.6, 3.15], [-3.9, 3.15]], -W / 2 + 0.05, W / 2 - 0.05, hex(tarp));
  b.box([L / 2 - 0.05, 0.5, 0], [0.12, 0.3, W], 0, DARK);
  lights(b, L, W, 0.95, 0.16);
  wheels(b, L, W, r, [L / 2 - 1.2, -L / 2 + 2.4, -L / 2 + 1.4], 0.32);
  return b;
}

function auto(body, low = '#1d1d1d') {
  const L = 2.65, W = 1.32, r = 0.22;
  const b = new Builder();
  const c = hex(body);
  // floor + lower body
  b.box([-0.25, 0.28, 0], [1.9, 0.42, W], 0, hex(low));
  b.box([-0.35, 0.7, 0], [1.4, 0.28, W], 0, c, null, ['pz', 'nz', 'nx']);
  // front cowl
  b.extrude([[0.55, 0.28], [1.25, 0.32], [1.3, 0.85], [1.05, 1.15], [0.6, 1.2]], -0.32, 0.32, c);
  b.box([1.28, 0.62, 0], [0.04, 0.12, 0.2], 0, HEAD);
  // windscreen
  b.extrude([[0.62, 1.18], [0.92, 1.12], [0.82, 1.68], [0.6, 1.7]], -0.55, 0.55, GLASS);
  // canopy
  b.extrude([[-1.15, 1.62], [0.85, 1.7], [0.78, 1.82], [-0.3, 1.92], [-1.1, 1.85]], -W / 2, W / 2, hex('#161616'));
  b.box([-1.12, 0.95, 0], [0.06, 0.75, W - 0.02], 0, hex('#161616'));
  // pillars
  for (const x of [0.6, -1.1]) for (const sz of [1, -1]) b.box([x, 0.9, sz * (W / 2 - 0.04)], [0.05, 0.8, 0.05], 0, DARK);
  // driver
  b.box([0.25, 0.7, 0], [0.35, 0.65, 0.42], 0, hex('#d9d2c4'));
  b.box([0.3, 1.35, 0], [0.22, 0.24, 0.2], 0, hex('#7b4f33'));
  b.cylinder([1.05, r, 0], r, 0.12, 'z', 10, TYRE);
  for (const sz of [1, -1]) b.cylinder([-0.85, r, sz * (W / 2 - 0.1)], r, 0.14, 'z', 10, TYRE);
  b.box([-L / 2 + 0.1, 0.45, 0], [0.04, 0.12, W - 0.3], 0, TAIL);
  return b;
}

function bike(color, shirt, helmet, pillion) {
  const b = new Builder();
  const r = 0.29;
  b.cylinder([0.66, r, 0], r, 0.1, 'z', 12, TYRE);
  b.cylinder([-0.62, r, 0], r, 0.11, 'z', 12, TYRE);
  b.extrude([[-0.8, 0.38], [0.35, 0.36], [0.62, 0.78], [0.5, 0.92], [-0.1, 0.72], [-0.75, 0.75]], -0.16, 0.16, hex(color));
  b.box([0.5, 0.95, 0], [0.06, 0.06, 0.7], 0, DARK);
  b.box([0.64, 0.75, 0], [0.04, 0.12, 0.14], 0, HEAD);
  const rider = (x, sh, hel) => {
    b.box([x, 0.75, 0], [0.42, 0.28, 0.38], 0, hex('#2d2f38'));
    b.box([x + 0.05, 0.95, 0], [0.3, 0.6, 0.4], 0, hex(sh));
    b.box([x + 0.1, 1.55, 0], [0.24, 0.26, 0.24], 0, hex(hel));
  };
  rider(-0.15, shirt, helmet);
  if (pillion) rider(-0.55, pillion, '#4a2f1e');
  return b;
}

function van(color) { // boxy Omni-style van
  return car({ L: 3.6, W: 1.5, belt: 0.95, top: 1.82, fb: 1.25, rb: -1.75, ft: 1.12, rt: -1.72, color, fa: 0.45, ra: 0.5, r: 0.27 });
}

export const TYPES = {
  hatch: { L: 3.8, W: 1.68, vmax: 13, a: 1.8 },
  sedan: { L: 4.4, W: 1.75, vmax: 14, a: 1.8 },
  suv: { L: 4.6, W: 1.86, vmax: 13.5, a: 1.6 },
  taxi: { L: 4.2, W: 1.65, vmax: 11, a: 1.4 },
  van: { L: 3.6, W: 1.5, vmax: 11, a: 1.3 },
  auto: { L: 2.65, W: 1.32, vmax: 8.5, a: 1.1 },
  bike: { L: 1.9, W: 0.75, vmax: 12, a: 2.2 },
  bus: { L: 10.8, W: 2.5, vmax: 10, a: 0.8 },
  truck: { L: 8.4, W: 2.45, vmax: 9, a: 0.7 },
};

export const MIX = {
  city: { hatch: 26, sedan: 14, suv: 10, taxi: 7, auto: 14, bike: 16, bus: 7, truck: 3, van: 3 },
  market: { hatch: 12, sedan: 4, auto: 30, bike: 34, van: 10, taxi: 6, suv: 4 },
  narrow: { bike: 50, auto: 28, hatch: 12, van: 10 },
  ghat: { hatch: 22, suv: 26, sedan: 8, bus: 10, truck: 14, van: 8, bike: 12 },
  hairpin: { hatch: 26, suv: 30, sedan: 10, van: 10, bike: 16, bus: 4, truck: 4 },
  hillstation: { hatch: 28, suv: 22, taxi: 6, van: 12, bike: 22, auto: 6, sedan: 4 },
  descent: { hatch: 22, suv: 26, sedan: 8, bus: 10, truck: 14, van: 8, bike: 12 },
};

const CAR_COLS = ['#f4f4f2', '#c9cbcf', '#9ea3a8', '#2b2d31', '#b3121c', '#1c3f8a', '#7a1f2b', '#e9e5da', '#4a5a3a', '#d26a1c'];

export function buildVariants() {
  const V = {};
  const add = (type, b) => { (V[type] = V[type] || []).push(b.geometry()); };
  for (const c of CAR_COLS.slice(0, 7)) add('hatch', car({ L: 3.8, W: 1.68, belt: 0.92, top: 1.5, fb: 0.75, rb: -1.6, ft: 0.0, rt: -1.55, color: c, fa: 0.62, ra: 0.6 }));
  for (const c of CAR_COLS.slice(2, 9)) add('sedan', car({ L: 4.4, W: 1.75, belt: 0.9, top: 1.46, fb: 0.95, rb: -1.15, ft: 0.2, rt: -0.95, color: c, fa: 0.75, ra: 0.75 }));
  for (const c of ['#f4f4f2', '#2b2d31', '#9ea3a8', '#7a1f2b', '#3a4a5a', '#c9cbcf']) add('suv', car({ L: 4.6, W: 1.86, belt: 1.12, top: 1.84, fb: 0.95, rb: -2.2, ft: 0.35, rt: -2.15, color: c, fa: 0.8, ra: 0.8, r: 0.36 }));
  add('taxi', car({ L: 4.2, W: 1.65, belt: 0.9, top: 1.5, fb: 0.85, rb: -1.1, ft: 0.15, rt: -0.9, color: '#121212', roof: '#f2c200', lower: '#121212', fa: 0.7, ra: 0.7 }));
  add('taxi', car({ L: 4.2, W: 1.65, belt: 0.9, top: 1.5, fb: 0.85, rb: -1.1, ft: 0.15, rt: -0.9, color: '#f2c200', roof: '#f2c200', lower: '#0e7a3f', fa: 0.7, ra: 0.7 }));
  for (const c of ['#f4f4f2', '#c9cbcf', '#e8d9b0', '#9a1d22']) add('van', van(c));
  add('auto', auto('#f2c200', '#1d6b2f')); add('auto', auto('#1d8a3a', '#f2c200')); add('auto', auto('#f2c200', '#111')); add('auto', auto('#1d8a3a', '#1d8a3a'));
  add('bike', bike('#1b1b1b', '#f2f2f2', '#c0262d', null)); add('bike', bike('#b3121c', '#2a64b0', '#111', '#e09a1a'));
  add('bike', bike('#2a64b0', '#6b3fa0', '#f2f2f2', null)); add('bike', bike('#888', '#1d8a5a', '#f2c200', '#c0262d'));
  add('bus', bus('#c4161c', '#f2c200', '#e9e4d8')); add('bus', bus('#1f4f9a', '#f4f4f2')); add('bus', bus('#2f7d32', '#f2c200')); add('bus', bus('#e9e4d8', '#c4161c'));
  add('truck', truck('#e2541b', '#f2c200', '#c9a24a')); add('truck', truck('#1f5fbf', '#e8d9b0', '#2f6b3b')); add('truck', truck('#f2c200', '#c4161c', '#d9c08a'));
  return V;
}

export function makeVehicleMaterial(env) {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35, envMap: env || null, envMapIntensity: 0.9 });
}
