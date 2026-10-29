import * as THREE from 'three';
import { mulberry32 } from './util.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noiseFill(ctx, w, h, base, amp, seed = 1, blob = 0) {
  const r = mulberry32(seed);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const n = (r() - 0.5) * amp;
    d[i * 4] = Math.max(0, Math.min(255, base[0] + n));
    d[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
    d[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < blob; i++) {
    const x = r() * w, y = r() * h, rad = 4 + r() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const a = (r() - 0.5) * 0.18;
    const col = a > 0 ? '255,255,255' : '0,0,0';
    g.addColorStop(0, `rgba(${col},${Math.abs(a)})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function makeTextures() {
  const T = {};

  // Asphalt: u across the road (1 unit = 4 m), v along (1 unit = 4 m)
  {
    const [c, x] = canvas(512, 512);
    noiseFill(x, 512, 512, [70, 70, 72], 26, 3, 160);
    const r = mulberry32(9);
    // tyre polish bands (subtly lighter where wheels run)
    for (const band of [0.17, 0.33, 0.67, 0.83]) {
      const g = x.createLinearGradient((band - 0.06) * 512, 0, (band + 0.06) * 512, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(20,20,22,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, 512, 512);
    }
    // cracks & patches
    x.strokeStyle = 'rgba(25,25,25,0.5)'; x.lineWidth = 1.2;
    for (let i = 0; i < 18; i++) {
      x.beginPath(); let px = r() * 512, py = r() * 512; x.moveTo(px, py);
      for (let j = 0; j < 6; j++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; x.lineTo(px, py); }
      x.stroke();
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = `rgba(${r() < 0.5 ? '40,40,42' : '95,95,95'},0.35)`;
      x.fillRect(r() * 512, r() * 512, 30 + r() * 70, 20 + r() * 50);
    }
    T.asphalt = tex(c);
  }
  // Pavers
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [150, 146, 138], 22, 5, 40);
    x.strokeStyle = 'rgba(60,58,55,0.55)'; x.lineWidth = 2;
    for (let i = 0; i <= 8; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(256, i * 32); x.stroke(); }
    for (let j = 0; j < 8; j++) for (let i = 0; i <= 4; i++) {
      const off = (j % 2) * 32;
      x.beginPath(); x.moveTo(i * 64 + off, j * 32); x.lineTo(i * 64 + off, j * 32 + 32); x.stroke();
    }
    T.paver = tex(c);
  }
  // Kerb stripes (black / yellow, 1 m each along v)
  {
    const [c, x] = canvas(32, 128);
    x.fillStyle = '#e8c21c'; x.fillRect(0, 0, 32, 64);
    x.fillStyle = '#1b1b1b'; x.fillRect(0, 64, 32, 64);
    const img = x.getImageData(0, 0, 32, 128);
    const r = mulberry32(2);
    for (let i = 0; i < img.data.length; i += 4) { const n = (r() - 0.5) * 30; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    x.putImageData(img, 0, 0);
    T.kerb = tex(c);
  }
  // Gravel / dirt shoulder
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [128, 112, 90], 60, 11, 80);
    T.gravel = tex(c);
  }
  // Terrain detail (multiplied with vertex colours)
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [220, 220, 220], 46, 13, 260);
    T.detail = tex(c, { srgb: false });
  }
  // Concrete
  {
    const [c, x] = canvas(128, 128);
    noiseFill(x, 128, 128, [175, 172, 165], 24, 17, 30);
    T.concrete = tex(c);
  }

  // Building facade: 2 x 2 bays per texture repeat (1 bay = 3.2 m wide, 1 floor = 3.1 m)
  {
    const [c, x] = canvas(256, 256);
    noiseFill(x, 256, 256, [232, 228, 220], 18, 21, 30);
    const r = mulberry32(31);
    for (let by = 0; by < 2; by++) for (let bx = 0; bx < 2; bx++) {
      const ox = bx * 128, oy = by * 128;
      // floor slab line
      x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(ox, oy + 120, 128, 8);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(ox, oy + 118, 128, 2);
      const style = (bx + by * 2) % 4;
      const ww = style === 1 ? 70 : 56, wh = style === 2 ? 66 : 58;
      const wx = ox + (128 - ww) / 2, wy = oy + 30;
      // window recess + frame
      x.fillStyle = '#4b4f52'; x.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      const gg = x.createLinearGradient(wx, wy, wx + ww, wy + wh);
      gg.addColorStop(0, '#2e4458'); gg.addColorStop(0.5, '#6a8396'); gg.addColorStop(1, '#22313f');
      x.fillStyle = gg; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = '#d8d4cc'; x.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); x.fillRect(wx, wy + wh * 0.38, ww, 3);
      // sunshade (chajja) – very common in Indian buildings
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(wx - 10, wy - 12, ww + 20, 6);
      x.fillStyle = '#bdb8ae'; x.fillRect(wx - 10, wy - 14, ww + 20, 4);
      if (style === 3) { // AC unit
        x.fillStyle = '#e9e9e6'; x.fillRect(wx + ww - 26, wy + wh + 8, 26, 16);
        x.fillStyle = '#9b9b98'; for (let i = 0; i < 5; i++) x.fillRect(wx + ww - 24, wy + wh + 10 + i * 3, 22, 1);
      }
      if (style === 0 && r() < 2) { // balcony railing
        x.fillStyle = 'rgba(40,40,40,0.75)';
        x.fillRect(wx - 8, wy + wh + 2, ww + 16, 3);
        for (let i = 0; i < 9; i++) x.fillRect(wx - 6 + i * ((ww + 12) / 8), wy + wh + 2, 2, 20);
        x.fillRect(wx - 8, wy + wh + 22, ww + 16, 3);
      }
      // grime streaks
      x.fillStyle = 'rgba(60,50,40,0.10)';
      x.fillRect(wx + 4, wy + wh + 4, 6, 40 + r() * 40);
    }
    T.facade = tex(c);
  }
  // Shopfronts atlas: 4 rows of variants, each 256 x 64 (= 6.4 m x 3.4 m)
  {
    const [c, x] = canvas(512, 512);
    const r = mulberry32(41);
    const signCols = ['#d7262e', '#1f5fbf', '#f2b705', '#0f8f5a', '#e2541b', '#7a2ca8', '#16a3b5', '#c81d6b'];
    for (let row = 0; row < 8; row++) {
      const oy = row * 64;
      x.fillStyle = '#5a5650'; x.fillRect(0, oy, 512, 64);
      for (let k = 0; k < 2; k++) {
        const ox = k * 256;
        const col = signCols[Math.floor(r() * signCols.length)];
        x.fillStyle = col; x.fillRect(ox + 4, oy + 2, 248, 16);
        x.fillStyle = 'rgba(255,255,255,0.92)';
        let px = ox + 14;
        while (px < ox + 230) { const w = 6 + r() * 16; x.fillRect(px, oy + 6, w, 8); px += w + 4 + r() * 6; }
        // shop opening: either shutter or lit interior with goods
        if (r() < 0.35) {
          x.fillStyle = '#8b8d8f'; x.fillRect(ox + 12, oy + 22, 232, 40);
          x.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 12; i++) x.fillRect(ox + 12, oy + 24 + i * 3.3, 232, 1);
        } else {
          x.fillStyle = '#3a332c'; x.fillRect(ox + 12, oy + 22, 232, 40);
          // shelves with neatly stacked goods
          for (let sh = 0; sh < 3; sh++) {
            const sy = oy + 26 + sh * 12;
            x.fillStyle = '#6b5a48'; x.fillRect(ox + 14, sy + 9, 228, 2);
            let gx = ox + 16;
            const hue = Math.floor(r() * 360);
            while (gx < ox + 236) {
              const gw = 5 + r() * 7;
              x.fillStyle = `hsl(${(hue + r() * 50) % 360},${25 + r() * 25}%,${38 + r() * 22}%)`;
              x.fillRect(gx, sy + 2 + r() * 2, gw, 7);
              gx += gw + 1.5;
            }
          }
          x.fillStyle = '#c9c4ba'; x.fillRect(ox + 12, oy + 22, 3, 40); x.fillRect(ox + 241, oy + 22, 3, 40);
          x.fillStyle = 'rgba(255,230,180,0.18)'; x.fillRect(ox + 12, oy + 22, 232, 40);
        }
      }
    }
    T.shops = tex(c);
  }
  // Warning sign (red triangle, hairpin bend symbol) and milestone
  {
    const [c, x] = canvas(128, 128);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    x.beginPath(); x.moveTo(64, 8); x.lineTo(122, 116); x.lineTo(6, 116); x.closePath();
    x.fillStyle = '#d32020'; x.fill();
    x.beginPath(); x.moveTo(64, 30); x.lineTo(104, 104); x.lineTo(24, 104); x.closePath();
    x.fillStyle = '#ffffff'; x.fill();
    x.strokeStyle = '#111'; x.lineWidth = 6; x.lineCap = 'round';
    x.beginPath(); x.moveTo(54, 98); x.lineTo(54, 66); x.arc(64, 66, 10, Math.PI, 0); x.lineTo(74, 82); x.stroke();
    x.beginPath(); x.moveTo(68, 80); x.lineTo(74, 90); x.lineTo(80, 80); x.fillStyle = '#111'; x.fill();
    T.signHairpin = tex(c, { repeat: false });
  }
  {
    const [c, x] = canvas(64, 96);
    x.fillStyle = '#f4f2ea'; x.fillRect(0, 0, 64, 96);
    x.fillStyle = '#f2c200'; x.beginPath(); x.arc(32, 32, 32, Math.PI, 0); x.fillRect(0, 0, 64, 32); x.fill();
    x.fillStyle = '#222'; x.font = 'bold 13px sans-serif'; x.textAlign = 'center';
    x.fillText('MEDIX', 32, 52); x.font = 'bold 18px sans-serif'; x.fillText('12', 32, 74);
    x.font = 'bold 10px sans-serif'; x.fillText('KM', 32, 88);
    T.milestone = tex(c, { repeat: false });
  }
  // Soft blob shadow / glow sprite
  {
    const [c, x] = canvas(64, 64);
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    T.glow = tex(c, { repeat: false, srgb: false });
  }
  return T;
}
