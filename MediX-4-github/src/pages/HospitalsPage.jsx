import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buildWorld, ROAD, W, H, riverX } from '../map/world.js';
import { rankHospitals, pathTo, congestion, CONDITIONS, CAP_LABEL } from '../map/route.js';

const SIM_SPEED = 30; // dispatch animation runs 30x faster than real time

export default function HospitalsPage({ active }) {
  const world = useMemo(() => buildWorld(), []);
  const svgRef = useRef(null);
  const [view, setView] = useState({ x: 0, y: 0, w: W, h: H });
  const [src, setSrc] = useState(() => nearestNode(world, 600, 640));
  const [cond, setCond] = useState('cardiac');
  const [rush, setRush] = useState(false);
  const [traffic, setTraffic] = useState(true);
  const [t, setT] = useState(100);
  const [pick, setPick] = useState(null); // hospital id chosen for comparison
  const [trip, setTrip] = useState(null); // active dispatch
  const [log, setLog] = useState([]);
  const addLog = (msg, lvl = 'info') => setLog((l) => [{ id: Math.random(), t: new Date(), msg, lvl }, ...l].slice(0, 6));

  // live world: traffic changes, beds and ER waits drift
  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => {
      setT((x) => x + 20);
      for (const h of world.hospitals) {
        h.wait = Math.max(3, Math.min(60, h.wait + (Math.random() - 0.5) * 3 + (h.baseWait - h.wait) * 0.1));
        if (Math.random() < 0.12) h.beds = Math.max(0, Math.min(h.baseBeds + 3, h.beds + (Math.random() < 0.5 ? -1 : 1)));
      }
    }, 2000);
    return () => clearInterval(i);
  }, [active, world]);

  const rank = useMemo(() => rankHospitals(world, src, cond, t, rush), [world, src, cond, t, rush]);
  // hysteresis: keep the current recommendation unless another is clearly better (>1.5 min)
  const held = useRef({ id: null, key: '' });
  const key = cond + ':' + src;
  let best = rank.best;
  if (best && held.current.key === key && held.current.id && held.current.id !== best.h.id) {
    const keep = rank.rows.find((r) => r.h.id === held.current.id && r.ok);
    if (keep && keep.score <= best.score + 1.5) best = keep;
  }
  held.current = { id: best ? best.h.id : null, key };
  const prevBest = useRef({ id: null, key: '' });
  useEffect(() => {
    if (!best) return;
    const key = cond + ':' + src;
    const P = prevBest.current;
    if (P.id && P.key === key && P.id !== best.h.id && !trip) addLog(`Re-optimised for traffic: ${best.h.short} is now the better choice`, 'warn');
    prevBest.current = { id: best.h.id, key };
  }, [best && best.h.id, cond, src]);
  const optRoute = useMemo(() => (best ? pathTo(world, rank.res, src, best.h.node) : null), [rank, best, src, world]);
  const bestRoute = trip ? { pts: trip.pts } : optRoute;
  const pickRow = pick ? rank.rows.find((r) => r.h.id === pick) : null;
  const pickRoute = useMemo(() => (pickRow && pickRow.h.id !== best?.h.id ? pathTo(world, rank.res, src, pickRow.h.node) : null), [pickRow, rank, best, src, world]);

  // ---------------------------------------------------------------- dispatch animation
  const [amb, setAmb] = useState(null); // animated position
  useEffect(() => {
    if (!trip) return;
    let raf, t0 = performance.now();
    const pts = trip.pts, cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const total = cum[cum.length - 1] || 1, dur = (trip.eta * 60 * 1000) / SIM_SPEED;
    const tick = (now) => {
      const f = Math.min(1, (now - t0) / dur);
      const d = f * total;
      let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
      const k = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
      const x = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k;
      const ang = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      setAmb({ x, y, ang, f, left: trip.eta * (1 - f) });
      if (f < 1) raf = requestAnimationFrame(tick);
      else {
        addLog(`Arrived at ${trip.h.short}: patient handed over in ${trip.eta.toFixed(1)} min`, 'ok');
        setSrc(trip.h.node); setTrip(null); setAmb(null);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [trip]);

  const dispatch = () => {
    if (!best || trip) return;
    setTrip({ pts: bestRoute.pts, eta: best.eta, h: best.h });
    addLog(`Dispatched to ${best.h.short}: ETA ${best.eta.toFixed(1)} min, ${best.km.toFixed(1)} km. Hospital pre-alerted.`, 'ok');
  };
  const randomCall = () => {
    if (trip) return;
    const n = world.nodes[Math.floor(Math.random() * world.nodes.length)];
    const keys = Object.keys(CONDITIONS);
    const c = keys[Math.floor(Math.random() * keys.length)];
    setSrc(n.id); setCond(c); setPick(null);
    addLog(`New emergency call: ${CONDITIONS[c].label}${n.name ? ` near ${n.name}` : ''}`, 'crit');
    focusOn(n.x, n.y, 1100);
  };

  // ---------------------------------------------------------------- pan / zoom / click
  const toWorld = (cx, cy) => {
    const svg = svgRef.current; const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse()); return [p.x, p.y];
  };
  const drag = useRef(null);
  const pointers = useRef(new Map());
  const onDown = (e) => {
    svgRef.current.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    drag.current = { sx: e.clientX, sy: e.clientY, v: { ...view }, moved: false, w0: toWorld(e.clientX, e.clientY) };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current.pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), v: { ...view }, c: toWorld((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) };
    }
  };
  const onMove = (e) => {
    if (!drag.current) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const D = drag.current;
    if (D.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const s = D.pinch.d / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1]));
      zoomAbout(D.pinch.v, D.pinch.c, s); D.moved = true; return;
    }
    if (Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > 5) D.moved = true;
    if (!D.moved) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scale = Math.max(D.v.w / rect.width, D.v.h / rect.height);
    setView({ ...D.v, x: D.v.x - (e.clientX - D.sx) * scale, y: D.v.y - (e.clientY - D.sy) * scale });
  };
  const onUp = (e) => {
    pointers.current.delete(e.pointerId);
    const D = drag.current;
    if (D && !D.moved && !D.pinch && !trip) {
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const tol = Math.max(22, view.w * 0.02);
      const hosp = world.hospitals.find((h) => Math.hypot(h.x - wx, h.y - wy) < tol);
      if (hosp) setPick(pick === hosp.id ? null : hosp.id);
      else { setSrc(nearestNode(world, wx, wy)); setPick(null); addLog('Ambulance position updated', 'info'); }
    }
    if (pointers.current.size === 0) drag.current = null;
  };
  const zoomAbout = (v0, [cx, cy], s) => {
    const w = Math.max(260, Math.min(W * 1.4, v0.w * s)), h = (w / v0.w) * v0.h;
    setView({ x: cx - ((cx - v0.x) / v0.w) * w, y: cy - ((cy - v0.y) / v0.h) * h, w, h });
  };
  const onWheel = (e) => { zoomAbout(view, toWorld(e.clientX, e.clientY), e.deltaY > 0 ? 1.15 : 1 / 1.15); };
  useEffect(() => {
    const el = svgRef.current; const stop = (e) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);
  const focusOn = (x, y, w = 900) => {
    const r = svgRef.current ? svgRef.current.getBoundingClientRect() : { width: 10, height: 7 };
    const asp = r.height / Math.max(1, r.width);
    const ww = asp > 1 ? w * 0.6 : w;
    setView({ x: x - ww / 2, y: y - (ww * asp) / 2, w: ww, h: ww * asp });
  };
  // phones: open zoomed in around the ambulance
  useEffect(() => {
    const r = svgRef.current.getBoundingClientRect();
    if (r.width && r.width < 600) { const n = world.nodes[src]; focusOn(n.x, n.y, 1100); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ambPos = amb || world.nodes[src];
  const mk = Math.max(1, view.w / 1150); // marker scale
  const cong = (e) => congestion(e, t, rush);
  const C = CONDITIONS[cond];
  const nearestOther = rank.nearest && best && rank.nearest.h.id !== best.h.id ? rank.nearest : null;

  return (
    <div className="hosp">
      <div className="hmap">
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} preserveAspectRatio="xMidYMid meet"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel}
          role="img" aria-label="Map of Medix Valley with hospitals and the ambulance route">
          <defs>
            <pattern id="hgrid" width="50" height="50" patternUnits="userSpaceOnUse"><path d="M50 0H0V50" fill="none" stroke="rgba(57,255,136,0.035)" strokeWidth="1" /></pattern>
            <radialGradient id="hillg"><stop offset="0" stopColor="#15261c" /><stop offset="1" stopColor="#0b0f0d" stopOpacity="0" /></radialGradient>
          </defs>
          <rect x={-500} y={-500} width={W + 1000} height={H + 1000} fill="#0a0d10" />
          <rect x={-500} y={-500} width={W + 1000} height={H + 1000} fill="url(#hgrid)" />
          {/* hills */}
          {world.peaks.map(([px, py, s], i) => (
            <g key={i}>
              <circle cx={px} cy={py} r={330 * s} fill="url(#hillg)" />
              {[0.25, 0.42, 0.6, 0.78, 0.96].map((k, j) => <path key={j} d={blob(px, py, 320 * s * k, i * 7 + j)} className="contour" />)}
            </g>
          ))}
          {/* river */}
          <path d={riverPath()} className="river" />
          <path d={riverPath()} className="river-core" />
          {/* blocks + parks */}
          {world.blocks.map((b, i) => <rect key={i} x={b.x} y={b.y} width={Math.max(2, b.w)} height={Math.max(2, b.h)} rx="4" className={b.park ? 'park' : 'block'} />)}
          {/* roads */}
          {world.edges.map((e) => <polyline key={e.id} points={e.pts.map((p) => p.join(',')).join(' ')} className="road" strokeWidth={ROAD[e.cls].w + 3} />)}
          {world.edges.map((e) => <polyline key={'i' + e.id} points={e.pts.map((p) => p.join(',')).join(' ')} className={'road-in ' + e.cls} strokeWidth={ROAD[e.cls].w} />)}
          {traffic && world.edges.map((e) => {
            const c = cong(e);
            return <polyline key={'t' + e.id} points={e.pts.map((p) => p.join(',')).join(' ')} className="tflow" stroke={c < 0.3 ? '#39ff88' : c < 0.55 ? '#ffb547' : '#ff3b4a'} strokeWidth={Math.max(1.4, ROAD[e.cls].w * 0.35)} />;
          })}
          {/* labels */}
          {world.labels.map((l) => <text key={l.t} x={l.x} y={l.y} className={'mlabel' + (l.river ? ' river-l' : '')} transform={l.river ? `rotate(-82 ${l.x} ${l.y})` : undefined}>{l.t}</text>)}
          {/* routes */}
          {pickRoute && <polyline points={pickRoute.pts.map((p) => p.join(',')).join(' ')} className="route-alt" />}
          {bestRoute && <polyline points={bestRoute.pts.map((p) => p.join(',')).join(' ')} className="route-glow" />}
          {bestRoute && <polyline points={bestRoute.pts.map((p) => p.join(',')).join(' ')} className="route" />}
          {/* hospitals */}
          {rank.rows.map((r) => {
            const isBest = best && r.h.id === best.h.id;
            const cls = 'hmark' + (isBest ? ' best' : r.ok ? ' ok' : ' no') + (pick === r.h.id ? ' picked' : '');
            return (
              <g key={r.h.id} data-h={r.h.id} className={cls} transform={`translate(${r.h.x} ${r.h.y}) scale(${mk})`}>
                {isBest && <circle r="34" className="hpulse" />}
                <rect x="-15" y="-15" width="30" height="30" rx="8" />
                <path d="M-3 -9h6v6h6v6h-6v6h-6v-6h-6v-6h6z" className="hcross" />
                <text y="32" className="hname">{r.h.short}</text>
                {r.ok && <text y="48" className="heta">{r.eta.toFixed(0)} min</text>}
              </g>
            );
          })}
          {/* ambulance */}
          <g transform={`translate(${ambPos.x} ${ambPos.y}) scale(${mk})`} className="amb-mark">
            <circle r="26" className="amb-ring" />
            <g transform={`rotate(${amb ? (amb.ang * 180) / Math.PI : -90})`}><path d="M14 0 L-9 -10 L-4 0 L-9 10 Z" /></g>
          </g>
        </svg>
        <div className="map-ctrl">
          <button onClick={() => zoomAbout(view, [view.x + view.w / 2, view.y + view.h / 2], 1 / 1.3)} aria-label="Zoom in">+</button>
          <button onClick={() => zoomAbout(view, [view.x + view.w / 2, view.y + view.h / 2], 1.3)} aria-label="Zoom out">−</button>
          <button onClick={() => setView({ x: 0, y: 0, w: W, h: H })} aria-label="Show whole region">⤢</button>
        </div>
        <div className="map-legend">
          <span><i className="lg-route" />Optimal route</span>
          {pickRoute && <span><i className="lg-alt" />Compared route</span>}
          {traffic && <><span><i style={{ background: '#39ff88' }} />Free</span><span><i style={{ background: '#ffb547' }} />Busy</span><span><i style={{ background: '#ff3b4a' }} />Jammed</span></>}
        </div>
        <div className="map-hint">Click the map to move the ambulance · Click a hospital to compare · Scroll to zoom</div>
        {trip && amb && (
          <div className="trip glass">
            <span className="label">En route · {SIM_SPEED}× speed</span>
            <b>{trip.h.short}</b>
            <div className="trip-bar"><i style={{ width: `${amb.f * 100}%` }} /></div>
            <span className="trip-eta">{amb.left.toFixed(1)} min left</span>
          </div>
        )}
      </div>

      <aside className="side hside">
        <div className="card">
          <h3>Patient condition</h3>
          <div className="chips">
            {Object.entries(CONDITIONS).map(([k, c]) => <button key={k} className={'chip' + (cond === k ? ' on' : '')} onClick={() => { setCond(k); setPick(null); }} disabled={!!trip}>{c.label}</button>)}
          </div>
          <p className="cond-note">{C.note}</p>
        </div>

        {best && (() => {
          const shown = trip ? (rank.rows.find((r) => r.h.id === trip.h.id) || best) : best;
          return (
          <div className="card rec">
            <h3><span>{trip ? 'En route · locked destination' : 'AI dispatch · optimal hospital'}</span><span className="pill ok">{trip ? 'EN ROUTE' : 'BEST'}</span></h3>
            <div className="rec-name">{shown.h.name}</div>
            <div className="label">{shown.h.level}</div>
            <div className="rec-stats">
              <div><b>{trip && amb ? amb.left.toFixed(1) : shown.eta.toFixed(1)}</b><small>{trip ? 'min left' : 'min ETA'}</small></div>
              <div><b>{shown.km.toFixed(1)}</b><small>km by road</small></div>
              <div><b>{shown.h.beds}</b><small>beds free</small></div>
            </div>
            <div className="reasons">
              {shown.reasons.map((r, i) => <span key={i} className={'rs' + (r.bad ? ' bad' : r.warn ? ' warn' : '')}>{r.t}</span>)}
            </div>
            {nearestOther && !trip && (
              <p className="why">Closest hospital is <b>{nearestOther.h.short}</b> ({nearestOther.crow.toFixed(1)} km away), but {nearestOther.ok ? `it scores lower (${nearestOther.eta.toFixed(0)} min drive, ER wait ${Math.round(nearestOther.h.wait)} min)` : `it has ${nearestOther.reasons[0].t.toLowerCase()}`}.</p>
            )}
            <div className="rec-actions">
              <button className="btn-primary" onClick={dispatch} disabled={!!trip}>{trip ? 'Ambulance en route…' : 'Dispatch ambulance'}</button>
              <button className="btn-ghost" onClick={randomCall} disabled={!!trip}>Random emergency</button>
            </div>
          </div>
          );
        })()}

        <div className="card">
          <h3><span>All hospitals · ranked</span><span className="pill ok">{rank.rows.filter((r) => r.ok).length} SUITABLE</span></h3>
          <ol className="hlist">
            {rank.rows.map((r, i) => (
              <li key={r.h.id}>
                <button className={(pick === r.h.id ? 'on ' : '') + (r.ok ? '' : 'dim')} onClick={() => { setPick(pick === r.h.id ? null : r.h.id); focusOn(r.h.x, r.h.y, 1300); }}>
                  <span className="hl-rank">{r.ok ? i + 1 : '–'}</span>
                  <span className="hl-main"><b>{r.h.short}</b><small>{r.ok ? `${r.km.toFixed(1)} km · wait ${Math.round(r.h.wait)} min · ${r.h.beds} beds` : r.reasons[0].t}</small></span>
                  <span className="hl-eta">{r.ok ? `${r.eta.toFixed(0)}′` : '✕'}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h3>Map options</h3>
          <div className="seg">
            <button className={traffic ? 'on' : ''} onClick={() => setTraffic(!traffic)}>Live traffic</button>
            <button className={rush ? 'on' : ''} onClick={() => setRush(!rush)}>Rush hour</button>
          </div>
          <details className="how">
            <summary>How the optimizer decides</summary>
            <ol>
              <li>Finds the fastest road route to every hospital from live traffic speeds on each road (Dijkstra shortest-time search).</li>
              <li>Removes hospitals that cannot treat the condition.</li>
              <li>Scores the rest: drive time + 0.45 × ER wait + a penalty when beds are scarce or a preferred unit is missing.</li>
              <li>Re-checks every 2 seconds as traffic, beds and waits change.</li>
            </ol>
          </details>
        </div>

        <div className="card">
          <h3>Dispatch log</h3>
          <ul className="alist">
            {log.length === 0 && <li className="info"><span>Choose a condition and press Dispatch ambulance.</span></li>}
            {log.map((a) => <li key={a.id} className={a.lvl}><time>{a.t.toLocaleTimeString([], { hour12: false })}</time><span>{a.msg}</span></li>)}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function nearestNode(world, x, y) {
  let b = 0, bd = 1e18;
  for (const n of world.nodes) { const d = (n.x - x) ** 2 + (n.y - y) ** 2; if (d < bd) { bd = d; b = n.id; } }
  return b;
}
function riverPath() {
  let d = '';
  for (let y = -60; y <= H + 60; y += 20) d += (y === -60 ? 'M' : 'L') + riverX(y).toFixed(1) + ' ' + y + ' ';
  return d;
}
function blob(cx, cy, r, seed) {
  let d = '';
  for (let i = 0; i <= 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const k = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.07 * Math.sin(a * 5 + seed * 2.3);
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r * k).toFixed(1) + ' ' + (cy + Math.sin(a) * r * k * 0.8).toFixed(1) + ' ';
  }
  return d + 'Z';
}
