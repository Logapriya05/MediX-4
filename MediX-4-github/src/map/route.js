// Dispatch optimizer: time-weighted shortest paths + hospital scoring.
import { ROAD, UNIT_M } from './world.js';
import { simplex2 } from '../sim/util.js';

export const CONDITIONS = {
  cardiac: { label: 'Cardiac / chest pain', need: ['cath'], note: 'Needs a cath lab. Door-to-balloon target under 90 min.' },
  trauma: { label: 'Road accident / trauma', need: ['trauma1', 'trauma2'], prefer: 'trauma1', preferPenalty: 8, note: 'Golden hour: Level-1 trauma preferred.' },
  stroke: { label: 'Stroke', need: ['stroke'], note: 'Needs CT + thrombolysis. Every minute counts.' },
  maternity: { label: 'Maternity', need: ['maternity'], note: 'Needs a labour ward and neonatal care.' },
  burns: { label: 'Burns', need: ['burns', 'trauma1'], prefer: 'burns', preferPenalty: 10, note: 'Burns unit preferred.' },
  general: { label: 'General / breathing', need: ['general'], note: 'Any emergency department.' },
};

export const CAP_LABEL = { trauma1: 'Level-1 trauma', trauma2: 'Trauma care', cath: 'Cath lab', stroke: 'Stroke unit', maternity: 'Maternity', burns: 'Burns unit', icu: 'ICU', paeds: 'Paediatrics', general: 'Emergency dept.' };

// congestion 0..1 for an edge at time t (seconds)
export function congestion(e, t, rush) {
  const R = ROAD[e.cls];
  const city = e.cls === 'arterial' || e.cls === 'street' || e.cls === 'market' || e.cls === 'lane' || e.cls === 'bridge';
  const n = simplex2(e.id * 0.37, t / 45) * 0.5 + 0.5;
  let c = R.base + (n - 0.5) * 0.45 + (rush && city ? 0.28 : 0) + (rush && e.cls === 'highway' ? 0.1 : 0);
  return Math.max(0, Math.min(0.92, c));
}

// minutes to traverse an edge
export function edgeMinutes(e, t, rush) {
  const km = (e.len * UNIT_M) / 1000;
  const v = ROAD[e.cls].speed * (1 - congestion(e, t, rush) * 0.72);
  return (km / Math.max(4, v)) * 60;
}

export function dijkstra(world, src, t, rush) {
  const { nodes, edges } = world;
  const n = nodes.length;
  const dist = new Float64Array(n).fill(Infinity), km = new Float64Array(n), prevE = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[src] = 0;
  const w = edges.map((e) => edgeMinutes(e, t, rush));
  for (let it = 0; it < n; it++) {
    let u = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u < 0) break;
    done[u] = 1;
    for (const eid of nodes[u].adj) {
      const e = edges[eid];
      const v = e.a === u ? e.b : e.a;
      const nd = dist[u] + w[eid];
      if (nd < dist[v]) { dist[v] = nd; prevE[v] = eid; km[v] = km[u] + (e.len * UNIT_M) / 1000; }
    }
  }
  return { dist, km, prevE };
}

// rebuild the route (list of points + edges) from src to dst
export function pathTo(world, res, src, dst) {
  const pts = [], es = [];
  let v = dst;
  while (v !== src && res.prevE[v] >= 0) {
    const e = world.edges[res.prevE[v]];
    es.push(e);
    const seg = e.a === v ? e.pts.slice() : e.pts.slice().reverse(); // from v back toward u
    if (pts.length) seg.shift();
    pts.push(...seg);
    v = e.a === v ? e.b : e.a;
  }
  pts.reverse(); es.reverse();
  return { pts, edges: es };
}

// Rank every hospital for the patient's condition.
export function rankHospitals(world, src, cond, t, rush) {
  const C = CONDITIONS[cond];
  const res = dijkstra(world, src, t, rush);
  const sx = world.nodes[src].x, sy = world.nodes[src].y;
  const rows = world.hospitals.map((h) => {
    const eta = res.dist[h.node] + 1.5; // + handover
    const km = res.km[h.node];
    const crow = (Math.hypot(h.x - sx, h.y - sy) * UNIT_M) / 1000;
    const ok = C.need.some((c) => h.caps.includes(c));
    const reasons = [];
    let score = eta;
    if (!ok) reasons.push({ bad: true, t: `No ${C.need.map((c) => CAP_LABEL[c]).join(' / ')}` });
    if (ok) {
      const has = C.need.filter((c) => h.caps.includes(c)).map((c) => CAP_LABEL[c]);
      reasons.push({ t: has.join(', ') });
      if (C.prefer && !h.caps.includes(C.prefer)) { score += C.preferPenalty; reasons.push({ warn: true, t: `No ${CAP_LABEL[C.prefer]} (+${C.preferPenalty} min)` }); }
    }
    score += h.wait * 0.45;
    reasons.push({ warn: h.wait > 25, t: `ER wait ${Math.round(h.wait)} min` });
    if (h.beds <= 0) { score += 30; reasons.push({ bad: true, t: 'No emergency beds free' }); }
    else if (h.beds < 3) { score += 6; reasons.push({ warn: true, t: `Only ${h.beds} bed${h.beds > 1 ? 's' : ''} free` }); }
    else reasons.push({ t: `${h.beds} beds free` });
    return { h, eta, km, crow, ok, score: ok ? score : Infinity, reasons };
  });
  rows.sort((a, b) => a.score - b.score || a.eta - b.eta);
  const nearest = rows.slice().sort((a, b) => a.crow - b.crow)[0];
  const best = rows.find((x) => x.ok) || null;
  return { rows, best, nearest, res };
}
