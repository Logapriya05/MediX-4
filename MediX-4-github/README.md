# MEDIX-4 · Electric Ambulance (v2)

**Live site:** https://logapriya05.github.io/MediX-4/

A rebuilt MEDIX-4 site: a minimal premium UI around a continuously running, procedurally generated 3D driving feed that uses the original `ambulance.glb`.

## Run

```bash
npm install
npm run dev        # local development
npm run build      # production build into dist/
npm run preview    # serve the production build
```

The ready-to-host single-file build lives in `docs/index.html` (rebuild it with `python3 build-site.py`), and GitHub Pages serves it from the `docs/` folder. `dist/` is static too, so you can deploy it to any static host (Netlify, Vercel, GitHub Pages, etc.). Asset paths are relative, so it also works from a sub-folder.

## Pages

| Tab | What it is |
| --- | --- |
| DRIVE | Autonomous 3D drive. Plays automatically. Pick Auto tour or any single environment (city traffic, market, narrow lanes, ghat climb, hairpins, hill station, descent) to watch it on repeat. |
| DASHBOARD | Smart-ambulance cockpit, live from the drive: speedometer with power/regen bar, patient monitor (ECG, pleth, resp, HR, SpO2, NIBP, temp, alarms), battery and range, navigation minimap with ETA, vehicle systems, emergency controls and an alerts feed. |
| HOSPITALS | Map of the Medix Valley region with 9 hospitals. A dispatch optimizer finds the fastest route to each hospital with live traffic (Dijkstra), removes hospitals that can't treat the patient's condition, scores the rest on drive time, ER wait and free beds, and recommends the best one. Click to move the ambulance; Dispatch animates the trip. |
| LAYOUT | X-ray of the ambulance with the 7 numbered powertrain components and animated power flow for Drive, Regen, Charging and Solar standby. |
| COMPONENTS | 360° models of the battery pack, motor and motor controller, with cutaway, closed and exploded views and labelled parts. |
| INTERIOR | Smart mini-ambulance cabin: 1 driver (RHD), 1 paramedic, 1 patient on a smart stretcher, with 15 labelled smart features (telemedicine, IoT oxygen, RFID cabinet, UV-C, 360° camera) |
| SYSTEMS | Live architecture of 14 subsystems (power, 12 V, CAN data, 5G uplink) with animated flows, 4 scenarios, health tiles, subsystem detail with sparklines, pack cell heatmap, ECG and diagnostics feed. "How charging works" view: plug-in AC (rectifier → PFC → isolated DC-DC → BMS → CC/CV), solar (PV → MPPT), regen braking (motor as generator → controller), 12 V aux (DC-DC 3-stage) with animated energy paths, steps, charts and live readings |

## Simulator (`src/sim/`)

- **path.js**: an endless route sampled every 1 m. It cycles through city traffic, market congestion, old-town lanes, ghat climb, hairpin bends, hill station and mountain descent. The road uses clothoid transitions, so curvature never jumps. The route also checks itself so it never crosses its own path.
- **zones.js**: road width, lanes, median, sidewalk, speed limit, traffic density and fog for each environment. These blend over 70 m at zone changes.
- **terrain.js**: a height field that follows the road exactly and blends into hills, cut slopes, valleys and far ridges. It streams in 64 m tiles with 3 levels of detail.
- **chunks.js**: 64 m road chunks. Each has asphalt, markings, kerbs, median, shoulders, parapets, poles and wires, Indian-style buildings and shops, trees, stalls and pedestrians.
- **traffic.js**: traffic keeps left (Indian rules) and runs in both directions. Vehicles follow each other with braking (IDM) and yield to the siren.
- **ambulance.js**: loads the GLB and splits out the 4 wheels so they spin and steer. Also handles the siren lights, the driving controller (curve-speed preview, overtaking only when the oncoming lane is clear) and the energy model (8 kW peak limit, regen).
- **Simulator.js**: renderer, sky, sun shadows, fog, chunk streaming, chase camera and automatic quality scaling.

All data is simulated for demonstration.

Model credit: "Ambulance Car - Low Poly" by Jasmin Daniel, CC-BY-4.0.
