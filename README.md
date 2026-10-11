# Marina Bay Street Circuit: overtaking redesign lab (2026 regulations)

This is an interactive study of how the F1 Singapore GP Marina Bay Street Circuit could be redesigned for more overtaking. It uses **real OpenStreetMap road geometry** and a simple **2026-regulation point-mass lap sim**. All numbers come from the scripts in `analysis/`. Lap times and the overtaking index are **estimates or simple indices, not validated predictions**.

**Hard constraint:** every layout keeps the existing start grid, start/finish straight and pit lane on Republic Blvd by the Pit Building unchanged. Changes start after the grid.

## Repository layout
- `src/`, `public/`, `index.html`: Vite + React web app (MapLibre GL + OpenFreeMap vector tiles, Recharts)
- `public/data/`: layout GeoJSONs, 3D ribbons, `metrics2026.json`, `traces2026.json`, and a stripped-down dark basemap style
- `public/maplibre-gl-worker.mjs`: MapLibre worker, copied from `node_modules/maplibre-gl/dist`
- `analysis/`: Python pipeline and outputs
  - `fetch.py`, `lib.py` (routing on OSM), `layouts.py` (waypoints for every layout)
  - `analyse.py`: v1 analysis (2022–25 regs with DRS)
  - `analyse2.py`: v2 analysis (2026 regs and grade-separation checks)
  - `osm.json`: Overpass extract, 2.2 MB, fetched 2026-10-11, ODbL
  - PNG maps, GeoJSONs, metrics and traces, `summary.md`
- `shots/`: headless screenshots

## Build and run the app
```bash
npm install
npm run build        # output: dist/ (static, relative asset paths)
npx vite preview     # or serve dist/ with any static server
```
Views are linked with hash URLs: `#view=current|redesign_A2|redesign_B2|overlay&mode=2d|3d`.

## Re-run the analysis
```bash
cd analysis
python3 -m venv v && . v/bin/activate
pip install osmnx shapely matplotlib networkx requests scipy pyproj
python analyse2.py   # needs network access for Open-Meteo elevation
cp current.geojson redesign_A2.geojson redesign_B2.geojson v1_redesign_*.geojson *_ribbon.geojson metrics2026.json traces2026.json ../public/data/
```
`osm.json` is included. To refetch it, query Overpass for bbox 1.272–1.304 N, 103.838–103.878 E (see `fetch.py`). The main overpass-api.de server was failing when this was built, so the maps.mail.ru mirror was used.
Then run `python make_ribbons.py` to rebuild the 3D ribbon files (`*_ribbon.geojson`).

## Results (2026 sim; estimates)
| Metric | Current | A2 (at-grade) | B2 (at-grade) | v1 A (superseded) | v1 B (superseded) |
|---|---|---|---|---|---|
| Length, smoothed (km) | 4.715 | 5.346 | 5.528 | 4.484 | 4.58 |
| Length, routed (km) | 4.818 | 5.434 | 5.639 | 4.557 | 4.683 |
| Corners | 16 | 14 | 17 | 11 | 14 |
| Slow 90° corners | 8 | 5 | 8 | 5 | 7 |
| Longest straight (m) | 731 | 1134 | 760 | 1237 | 731 |
| Heavy braking zones | 2 | 3 | 3 | 2 | 2 |
| X-mode total (m) | 1534 | 2787 | 2268 | 2549 | 1871 |
| Lap, sim est. (s) | 87.54 | 89.01 | 99.97 | 74.37 | 82.37 |
| Lap with Overtake, sim (s) | 87.43 | 88.8 | 99.87 | 74.17 | 82.22 |
| Overtake gain/lap (s) | 0.11 | 0.21 | 0.1 | 0.2 | 0.15 |
| Top speed, sim (km/h) | 285 | 314 | 299 | 313 | 287 |
| Clipping above (km/h) | 175 | 199 | 171 | 210 | 186 |
| Braking-only regen (MJ) | 4.57 | 4.16 | 5.01 | 3.58 | 4.08 |
| 2026 overtaking index | 1.11 | 2.92 | 1.18 | 2.76 | 1.33 |
| Grade-feasible | True | True | True | False | False |
| Temporary links (m) | [243, 146] | [54, 146] | [243, 32, 146] | [101] | [130, 101] |

The 2026 overtaking index = Σ over straights >300 m into corners >70° of (metres gained by the Overtake car by the braking point ÷ 5) × (speed drop ÷ 100 km/h). Slipstream is ignored.

## 2026 regulation assumptions and sources
- **No DRS.** Active aero: Z-mode (corners, high downforce) and X-mode (low drag on designated straights). The FIA anticipates X-mode on straights longer than about 3 s. Here X-mode is applied on full-throttle stretches with radius >300 m lasting ≥3.0 s. [F1.com aero explainer](https://www.formula1.com/en/latest/article/explained-2026-aerodynamic-regulations-fia-x-mode-z-mode-.26c1CtOzCmN3GfLMywrgb2)
- Car: 768 kg minimum mass, about 30% less downforce and 55% less drag than 2022 cars (same source). Sim uses 800 kg, 3.5 g lateral, 4.5 g braking, CdA Z/X = 1.25/0.9 m², all assumptions.
- Power unit: roughly 50/50 ICE/electric. ICE about 400 kW, MGU-K up to 350 kW, harvest up to 8.5 MJ/lap. [F1.com PU explainer](https://www.formula1.com/en/latest/article/the-inside-scoop-on-the-2026-power-unit-regulations.68izKQ2tn1voQPWvgLVMXN), [F1.com 2026 guide](https://www.formula1.com/en/latest/article/everything-you-require-to-know-about-the-new-f1-rules-for-2026.48bv0VTxhIlhrQXmxercXk)
- MGU-K speed taper, FIA 2026 Technical Regulations C5.2.8 (27 Feb 2026 text, quoted via gp.news FIA documents):
  - Standard: P = min(350, 1800 − 5·v) below 340 km/h, then 6900 − 20·v, reaching 0 at 345 km/h.
  - **Overtake Mode** (formerly "manual override"): P = min(350, 7100 − 20·v), reaching 0 at 355 km/h.
  - Harvest cap per C5.2.10: 8.5 MJ, +0.5 MJ with Overtake.
  - Overtake Mode is available when within 1.0 s at the detection line, for the following lap. [F1.com beginner's guide](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-2026-regulations.6j0tS0hrHG2T01tpmK6XYz)
  - An older PU regs issue (Issue 7, 2024) had a different taper; the newer text is used here.
- Energy model (assumption): deployment budget = harvest cap, treated as fully harvested via braking plus super-clipping. The power cost of super-clipping is not modelled. When over budget, MGU-K deployment is cut above a speed found by bisection ("clipping"). Braking-only regen (≤350 kW) is reported separately.

## Grade-separation feasibility (OSM tags + DEM)
- Classified from OSM `bridge`, `layer`, `tunnel`, `highway` and `bridge:name` tags on the routed ways:
  - **Bayfront Ave runs on Bayfront Bridge** (`layer=2`, above the layer-1 ECP structures).
  - The **Sheares Ave carriageways are tagged as Benjamin Sheares Bridge** (`layer=1`) and continue straight into ECP motorway/trunk_link bridges.
  - Both are treated as raised expressway structures, so the v1 redesigns are **infeasible**.
- Already used by the current circuit, so OK: the low Esplanade Bridge and the covered Raffles Blvd passages (`tunnel=building_passage`).
- Anderson Bridge and the T14 slip are missing or only partly in the OSM extract, so they are straight-line links.
- Elevation: Copernicus GLO-90 via the Open-Meteo API. It is a surface model, so buildings, trees and bridges add noise and water reads as 0 m. It is shown for context only; the feasibility decision rests on the OSM tags.
- A2 and B2 run in both directions on adjacent carriageways about 15–30 m apart. To avoid a self-crossing at the north end, they race south on the *west* carriageway and north on the *east* one. They need central barriers and temporary hairpin links (A2: 54 m through the Collyer Quay / Marina Blvd junction; B2: 32 m across the Collyer Quay median). The width of each carriageway against FIA minimum track width was **not checked**.

## Caveats
- Geometry follows street centrelines with σ = 14 m smoothing and a 12 m minimum corner radius. The current layout reconstructs to 4.818 km against the official 4.940 km.
- Not modelled: run-off, barriers, track width, FIA grading, tyres, slipstream, the ICE fuel-flow limit, or the power cost of harvesting.
- Basemap © OpenStreetMap contributors via OpenFreeMap / OpenMapTiles. Road data © OpenStreetMap contributors (ODbL).
