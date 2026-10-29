// Road/environment profiles. Distances in metres, speeds in m/s.
// India drives on the LEFT: forward traffic uses positive lateral offsets (u > 0).

export const ZONES = {
  city: {
    label: 'City Traffic',
    hw: 7.4, median: 1.2, sidewalk: 3.4, curb: 0.18, shoulder: 0,
    limit: 12.5, fwd: 32, onc: 32, mountain: 1.2, far: 0.12,
    fog: [70, 520], lanes2: true,
  },
  market: {
    label: 'Market Congestion',
    hw: 3.5, median: 0, sidewalk: 2.4, curb: 0.16, shoulder: 0,
    limit: 6.0, fwd: 16, onc: 20, mountain: 1.0, far: 0.15,
    fog: [60, 460], lanes2: false,
  },
  narrow: {
    label: 'Old Town Lanes',
    hw: 2.05, median: 0, sidewalk: 0.45, curb: 0.1, shoulder: 0,
    limit: 5.0, fwd: 3, onc: 8, mountain: 1.0, far: 0.2,
    fog: [60, 460], lanes2: false,
  },
  ghat: {
    label: 'Ghat Road Climb',
    hw: 3.6, median: 0, sidewalk: 0, curb: 0, shoulder: 1.3,
    limit: 11.5, fwd: 5, onc: 6, mountain: 26, far: 1.0,
    fog: [110, 900], lanes2: false,
  },
  hairpin: {
    label: 'Hairpin Bends',
    hw: 3.9, median: 0, sidewalk: 0, curb: 0, shoulder: 1.3,
    limit: 9.0, fwd: 3, onc: 4, mountain: 22, far: 1.0,
    fog: [110, 900], lanes2: false,
  },
  hillstation: {
    label: 'Hill Station',
    hw: 3.4, median: 0, sidewalk: 1.2, curb: 0.14, shoulder: 0.4,
    limit: 8.0, fwd: 9, onc: 9, mountain: 14, far: 1.0,
    fog: [90, 800], lanes2: false,
  },
  descent: {
    label: 'Mountain Descent',
    hw: 3.6, median: 0, sidewalk: 0, curb: 0, shoulder: 1.3,
    limit: 11.0, fwd: 5, onc: 5, mountain: 28, far: 1.0,
    fog: [110, 900], lanes2: false,
  },
};

export const ZONE_ORDER = ['city', 'market', 'narrow', 'ghat', 'hairpin', 'hillstation', 'descent'];
export const ZONE_KEYS = Object.keys(ZONES);
export const BLEND = 70; // metres over which a zone's road profile blends into the next

// Forward lane centres [outer (slow, left kerb side), inner (next to median / centre)]
export function laneCentres(z) {
  if (z.lanes2) {
    const w = (z.hw - z.median / 2) / 2;
    return [z.median / 2 + 1.5 * w, z.median / 2 + 0.5 * w];
  }
  return [z.hw / 2, z.hw / 2];
}
