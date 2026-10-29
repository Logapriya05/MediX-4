// Tiny shared store so the info pages can show live data from the running drive.
const subs = new Set();
let state = { whkm: 95, limit: 60, grade: 0, elevation: 40, traffic: 0, overtaking: false, auto: true, soc: 86.4, power: 0, motorTemp: 34, speed: 0, status: 'DRIVE', zone: 'City Traffic', odo: 0 };
export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...patch }; subs.forEach((f) => f(state)); },
  sub(f) { subs.add(f); return () => subs.delete(f); },
};
