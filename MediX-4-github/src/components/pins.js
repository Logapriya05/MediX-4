import * as THREE from 'three';

// Numbered callout pins projected from 3D anchor points, with a leader line
// to a text label (like an engineering diagram). Dims pins whose anchor is
// hidden behind geometry.
export class PinLayer {
  constructor(host, camera, { onSelect } = {}) {
    this.host = host;
    this.camera = camera;
    this.onSelect = onSelect;
    this.root = document.createElement('div');
    this.root.className = 'pins';
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'pins-lines');
    this.root.appendChild(this.svg);
    host.appendChild(this.root);
    this.items = [];
    this.ray = new THREE.Raycaster();
    this.occluders = [];
    this.visible = true;
    this.selected = null;
    this.v = new THREE.Vector3();
    this.frame = 0;
  }

  set(pins, occluders = []) {
    for (const it of this.items) { it.el.remove(); it.line.remove(); }
    this.items = [];
    this.occluders = occluders;
    pins.forEach((p) => {
      const el = document.createElement('button');
      el.className = 'pin';
      el.innerHTML = `<span class="pin-dot">${p.num}</span><span class="pin-label"><b>${p.label}</b>${p.sub ? `<small>${p.sub}</small>` : ''}</span>`;
      el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect && this.onSelect(p.id); });
      this.root.appendChild(el);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('class', 'pin-line');
      this.svg.appendChild(line);
      this.items.push({ ...p, el, line, occ: 0 });
    });
  }

  select(id) {
    this.selected = id;
    for (const it of this.items) it.el.classList.toggle('on', it.id === id);
  }

  setVisible(v) { this.visible = v; this.root.style.display = v ? '' : 'none'; }

  update() {
    if (!this.visible || !this.items.length) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.frame++;
    const camPos = this.camera.position;
    const cx = w / 2;
    // keep labels out of the title (top), toolbar (top right) and the bottom strip
    const TOP = 74, BOTTOM = h - 62;
    for (const it of this.items) {
      const a = it.anchor();
      this.v.copy(a).project(this.camera);
      const behind = this.v.z > 1 || this.v.z < -1;
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h;
      const off = x < 6 || x > w - 6 || y < 6 || y > h - 6;
      if ((this.frame + it.num) % 6 === 0 && this.occluders.length && !behind && !off) {
        const dir = a.clone().sub(camPos);
        const dist = dir.length();
        this.ray.set(camPos, dir.normalize());
        this.ray.camera = this.camera;
        this.ray.far = dist - 0.004;
        const hits = this.ray.intersectObjects(this.occluders, true).filter((hh) => hh.object.isMesh && hh.object.visible && !hh.object.userData.noOcclude && (hh.object.material?.opacity ?? 1) > 0.5);
        it.occ = hits.length ? 1 : 0;
      }
      it.x = x; it.y = y; it.hidden = behind || off;
    }
    const sel = this.selected;
    const placed = { '-1': [], '1': [] };
    for (const it of this.items) {
      const lab = it.el.querySelector('.pin-label');
      if (!it.lw || this.frame % 30 === 1) { it.lw = lab.offsetWidth || it.lw || 160; it.lh = lab.offsetHeight || it.lh || 34; }
      it.showLabel = !it.hidden && (!sel || sel === it.id);
      if (!it.showLabel) continue;
      const reach = it.reach || 46;
      // side choice with hysteresis: only switch when clearly across the centre or out of room
      let side = it.side || (it.x < cx ? -1 : 1);
      if (side < 0 && it.x > cx + w * 0.12) side = 1;
      if (side > 0 && it.x < cx - w * 0.12) side = -1;
      if (side > 0 && it.x + reach + it.lw > w - 8) side = -1;
      if (side < 0 && it.x - reach - it.lw < 8) side = 1;
      it.side = side;
      it.lx = it.x + side * reach;
      it.ly = Math.max(TOP + it.lh / 2, Math.min(BOTTOM - it.lh / 2, it.y - (it.lift ?? 26)));
      placed[side].push(it);
    }
    for (const k of ['-1', '1']) {
      const arr = placed[k].sort((p, q) => p.ly - q.ly);
      for (let i = 1; i < arr.length; i++) {
        const prev = arr[i - 1], cur = arr[i];
        const gap = (prev.lh + cur.lh) / 2 + 4;
        const px0 = prev.side < 0 ? prev.lx - prev.lw : prev.lx, px1 = px0 + prev.lw;
        const cx0 = cur.side < 0 ? cur.lx - cur.lw : cur.lx, cx1 = cx0 + cur.lw;
        if (cx1 < px0 || cx0 > px1) continue;
        if (cur.ly - prev.ly < gap) cur.ly = prev.ly + gap;
      }
    }
    for (const it of this.items) {
      const isSel = sel === it.id;
      // smooth everything so labels glide instead of jumping
      const k = it.sx === undefined ? 1 : 0.35;
      if (it.showLabel) {
        it.sx = it.sx === undefined ? it.lx : it.sx + (it.lx - it.sx) * k;
        it.sy = it.sy === undefined ? it.ly : it.sy + (it.ly - it.sy) * k;
      }
      const wantOp = it.hidden ? 0 : sel && !isSel ? 0.55 : it.occ && !isSel ? 0.45 : 1;
      it.op = it.op === undefined ? wantOp : it.op + (wantOp - it.op) * 0.25;
      it.el.style.transform = `translate(${it.x}px, ${it.y}px)`;
      it.el.style.opacity = it.op;
      it.el.style.pointerEvents = it.hidden ? 'none' : '';
      const lab = it.el.querySelector('.pin-label');
      const showLab = it.showLabel && !(w < 520 && !isSel);
      lab.style.visibility = showLab ? 'visible' : 'hidden';
      if (showLab) {
        const lx = it.sx, ly = it.sy;
        lab.style.transform = `translate(${it.side < 0 ? lx - it.x - it.lw : lx - it.x}px, ${ly - it.y - it.lh / 2}px)`;
        it.line.setAttribute('x1', it.x); it.line.setAttribute('y1', it.y);
        it.line.setAttribute('x2', lx); it.line.setAttribute('y2', ly);
      }
      it.line.style.opacity = showLab ? it.op * 0.9 : 0;
      it.line.classList.toggle('on', isSel);
    }
  }

  dispose() { this.root.remove(); }
}
