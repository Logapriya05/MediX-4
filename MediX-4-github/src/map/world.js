// Fictional "Medix Valley" region: road graph, terrain features and hospitals.
// 1 map unit = 5 m. World is 2000 x 1400 units (10 km x 7 km).
import { mulberry32 } from '../sim/util.js';

export const UNIT_M = 5;
export const W = 2000, H = 1400;

// ambulance speeds by road class (km/h, with siren) and base congestion
export const ROAD = {
  highway: { speed: 72, base: 0.12, w: 10, label: 'Highway' },
  ring: { speed: 60, base: 0.15, w: 8, label: 'Ring road' },
  arterial: { speed: 45, base: 0.28, w: 6.5, label: 'Arterial road' },
  street: { speed: 32, base: 0.22, w: 4.5, label: 'Street' },
  market: { speed: 18, base: 0.5, w: 4.5, label: 'Market road' },
  lane: { speed: 14, base: 0.38, w: 3, label: 'Narrow lane' },
  bridge: { speed: 40, base: 0.3, w: 6.5, label: 'Bridge' },
  ghat: { speed: 26, base: 0.12, w: 4.5, label: 'Ghat road' },
  mountain: { speed: 30, base: 0.06, w: 4, label: 'Mountain road' },
};

export const riverX = (y) => 1125 - 0.05 * y + 38 * Math.sin(y / 170);

export function buildWorld() {
  const r = mulberry32(4242);
  const nodes = [];
  const edges = [];
  const node = (x, y, name = null) => { nodes.push({ id: nodes.length, x, y, name, adj: [] }); return nodes.length - 1; };
  const edge = (a, b, cls, mid = [], name = null) => {
    const pts = [[nodes[a].x, nodes[a].y], ...mid, [nodes[b].x, nodes[b].y]];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const e = { id: edges.length, a, b, cls, pts, len, name };
    edges.push(e);
    nodes[a].adj.push(e.id); nodes[b].adj.push(e.id);
    return e;
  };

  // --- west-bank city grid
  const xs = [120, 270, 420, 570, 720, 870, 1020];
  const ys = [180, 330, 480, 630, 780, 930, 1080, 1230];
  const G = [];
  for (let j = 0; j < ys.length; j++) {
    G[j] = [];
    for (let i = 0; i < xs.length; i++) G[j][i] = node(xs[i] + (r() - 0.5) * 40, ys[j] + (r() - 0.5) * 40);
  }
  const oldTown = (i, j) => i >= 2 && i <= 4 && j >= 2 && j <= 4;
  const colCls = (i) => (i === 0 || i === 3 || i === 6 ? 'arterial' : 'street');
  const rowCls = (j) => (j % 2 === 0 ? 'arterial' : 'street');
  const rowNames = ['Nehru Road', 'MG Road', 'Station Road', 'Bazaar Road', 'Temple Street', 'Gandhi Road', 'College Road', 'Canal Road'];
  for (let j = 0; j < ys.length; j++) for (let i = 0; i < xs.length - 1; i++) {
    let cls = rowCls(j);
    if (j === 3 && i >= 2 && i <= 4) cls = 'market';
    else if (oldTown(i, j) && oldTown(i + 1, j)) cls = 'lane';
    edge(G[j][i], G[j][i + 1], cls, [], rowNames[j]);
  }
  const colNames = ['Ring Link', 'Hospital Road', 'Fort Lane', 'Main Avenue', 'Mill Lane', 'Lake Road', 'River Road'];
  for (let i = 0; i < xs.length; i++) for (let j = 0; j < ys.length - 1; j++) {
    let cls = colCls(i);
    if (oldTown(i, j) && oldTown(i, j + 1)) cls = 'lane';
    edge(G[j][i], G[j + 1][i], cls, [], colNames[i]);
  }

  // --- east bank suburbs
  const ex = [1250, 1400];
  const ey = [330, 630, 930, 1230];
  const E = ey.map((y) => ex.map((x) => node(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30)));
  for (let j = 0; j < ey.length; j++) edge(E[j][0], E[j][1], 'street', [], 'Valley Road');
  for (let i = 0; i < ex.length; i++) for (let j = 0; j < ey.length - 1; j++) edge(E[j][i], E[j + 1][i], i === 1 ? 'arterial' : 'street', [], i === 1 ? 'Valley Main Road' : 'Colony Road');
  // bridges (the only river crossings)
  edge(G[1][6], E[0][0], 'bridge', [], 'North Bridge');
  edge(G[5][6], E[2][0], 'bridge', [], 'Gandhi Setu');

  // --- highways
  const H0 = node(60, 1330), H1 = node(600, 1345), H2 = node(1110, 1330), H3 = node(1520, 1300), H4 = node(1640, 1010);
  edge(H0, H1, 'highway', [[330, 1345]], 'NH-44 Bypass');
  edge(H1, H2, 'highway', [[860, 1345]], 'NH-44 Bypass');
  edge(H2, H3, 'highway', [[1320, 1320]], 'NH-44 Bridge');
  edge(H3, H4, 'highway', [[1610, 1160]], 'NH-44');
  edge(H0, G[7][0], 'arterial', [], 'Bypass Link');
  edge(H1, G[7][3], 'arterial', [], 'Bypass Link');
  edge(H2, G[7][6], 'arterial', [], 'Bypass Link');
  edge(H2, E[3][0], 'arterial', [], 'Bypass Link');
  edge(H3, E[3][1], 'arterial', [], 'Bypass Link');
  // north ring road
  const R0 = node(110, 70), R1 = node(580, 55), R2 = node(1030, 70), R3 = node(1420, 130);
  edge(R0, R1, 'ring', [[340, 58]], 'Outer Ring Road');
  edge(R1, R2, 'ring', [[800, 55]], 'Outer Ring Road');
  edge(R2, R3, 'ring', [[1230, 85]], 'Ring Road Flyover');
  edge(R0, G[0][0], 'arterial', [], 'Ring Link'); edge(R1, G[0][3], 'arterial', [], 'Ring Link');
  edge(R2, G[0][6], 'arterial', [], 'Ring Link'); edge(R3, E[0][1], 'arterial', [], 'Ring Link');

  // --- the hills: ghat road with hairpins up to the hill station
  const G0 = node(1600, 760, 'Ghat foot');
  edge(E[1][1], G0, 'arterial', [[1500, 690]], 'Ghat Approach');
  edge(H4, G0, 'mountain', [[1670, 920], [1610, 850]], 'Hill Link');
  const HS = node(1830, 330, 'Hill station');
  const hp = [];
  let x = 1600, y = 760;
  for (let k = 0; k < 7; k++) {
    const dir = k % 2 ? -1 : 1;
    x += dir * 120; y -= 30; hp.push([x, y]);
    x += dir * 18; y -= 18; hp.push([x, y]);
    y -= 18; hp.push([x - dir * 4, y]);
  }
  hp.push([1760, 380]);
  edge(G0, HS, 'ghat', hp, 'Ghat Road (hairpins)');
  const HS2 = node(1900, 270);
  edge(HS, HS2, 'street', [], 'Mall Road');
  const HS3 = node(1760, 260);
  edge(HS, HS3, 'street', [], 'Church Road');
  // mountain road south-east to the rural PHC
  const RP = node(1880, 1100, 'Valley village');
  edge(G0, RP, 'mountain', [[1690, 820], [1760, 900], [1720, 960], [1820, 1010], [1790, 1060]], 'Valley Road');
  edge(H4, RP, 'mountain', [[1760, 1060]], 'Orchard Road');

  // --- hospitals (attached to the nearest node)
  const H = [
    { id: 'apex', name: 'Apex Trauma & Cardiac Center', short: 'Apex', x: 585, y: 345, level: 'Level-1 trauma centre', caps: ['trauma1', 'cath', 'icu', 'general'], beds: 9, wait: 12 },
    { id: 'citygen', name: 'City General Hospital', short: 'City General', x: 735, y: 690, level: 'Government district hospital', caps: ['trauma2', 'maternity', 'general', 'icu'], beds: 4, wait: 34 },
    { id: 'sunrise', name: 'Sunrise Heart Institute', short: 'Sunrise Heart', x: 135, y: 560, level: 'Cardiac speciality', caps: ['cath', 'icu', 'general'], beds: 6, wait: 8 },
    { id: 'stmary', name: "St. Mary's Women & Children", short: "St. Mary's", x: 285, y: 1150, level: 'Maternity and paediatrics', caps: ['maternity', 'paeds', 'general'], beds: 7, wait: 10 },
    { id: 'riverside', name: 'Riverside Burns Centre', short: 'Riverside Burns', x: 990, y: 1105, level: 'Burns and plastic surgery', caps: ['burns', 'trauma2', 'general'], beds: 3, wait: 14 },
    { id: 'neuro', name: 'NeuroCare Stroke Centre', short: 'NeuroCare', x: 900, y: 200, level: 'Comprehensive stroke centre', caps: ['stroke', 'icu', 'general'], beds: 5, wait: 9 },
    { id: 'greenvalley', name: 'GreenValley Memorial Hospital', short: 'GreenValley', x: 1415, y: 650, level: 'Multi-speciality', caps: ['trauma2', 'cath', 'stroke', 'maternity', 'icu', 'general'], beds: 11, wait: 18 },
    { id: 'highland', name: 'Highland Mountain Clinic', short: 'Highland Clinic', x: 1855, y: 300, level: 'Primary emergency outpost', caps: ['general'], beds: 2, wait: 5 },
    { id: 'phc', name: 'Valley Rural PHC', short: 'Rural PHC', x: 1890, y: 1120, level: 'Primary health centre', caps: ['general'], beds: 2, wait: 6 },
  ];
  for (const h of H) {
    let best = 0, bd = 1e9;
    for (const n of nodes) { const d = Math.hypot(n.x - h.x, n.y - h.y); if (d < bd) { bd = d; best = n.id; } }
    h.node = best;
    h.baseBeds = h.beds; h.baseWait = h.wait;
  }

  // --- scenery: city blocks, parks, hill contours, labels
  const blocks = [];
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = nodes[G[j][i]], b = nodes[G[j + 1][i + 1]];
    const x0 = Math.min(a.x, b.x) + 10, y0 = Math.min(a.y, b.y) + 10, x1 = Math.max(a.x, b.x) - 10, y1 = Math.max(a.y, b.y) - 10;
    const dense = oldTown(i, j) ? 4 : 2;
    const park = r() < 0.12 && !oldTown(i, j);
    if (park) { blocks.push({ x: x0 + 4, y: y0 + 4, w: x1 - x0 - 8, h: y1 - y0 - 8, park: true }); continue; }
    const cw = (x1 - x0) / dense, ch = (y1 - y0) / dense;
    for (let u = 0; u < dense; u++) for (let v = 0; v < dense; v++) blocks.push({ x: x0 + u * cw + 3, y: y0 + v * ch + 3, w: cw - 6, h: ch - 6 });
  }
  for (let j = 0; j < ey.length - 1; j++) {
    const a = nodes[E[j][0]], b = nodes[E[j + 1][1]];
    blocks.push({ x: a.x + 14, y: a.y + 14, w: b.x - a.x - 28, h: (b.y - a.y) / 2 - 18 });
    blocks.push({ x: a.x + 14, y: a.y + (b.y - a.y) / 2 + 4, w: b.x - a.x - 28, h: (b.y - a.y) / 2 - 18 });
  }
  const peaks = [[1800, 520, 1], [1700, 250, 0.8], [1930, 760, 0.9], [1560, 470, 0.6], [1960, 1300, 0.7]];
  const labels = [
    { x: 570, y: 600, t: 'OLD TOWN' }, { x: 360, y: 880, t: 'CIVIL LINES' }, { x: 860, y: 440, t: 'CANTONMENT' },
    { x: 1325, y: 470, t: 'EAST BANK' }, { x: 1720, y: 640, t: 'GHAT ROAD' }, { x: 1840, y: 210, t: 'HILL STATION' },
    { x: 600, y: 1385, t: 'NH-44 BYPASS' }, { x: 1170, y: 760, t: 'RIVER KAVERI', river: true }, { x: 1830, y: 1180, t: 'VALLEY VILLAGE' },
  ];
  return { nodes, edges, hospitals: H, blocks, peaks, labels };
}
