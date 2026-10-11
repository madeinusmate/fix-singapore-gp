# Marina Bay Street Circuit: overtaking redesign study (estimates from OSM geometry)

**Hard constraint met: the start grid is unchanged.** All three layouts share the same start/finish straight, grid boxes and pit lane next to Republic Blvd / Pit Building. This uses the OSM `highway=raceway` "Marina Bay Street Circuit" and "Pit Lane" ways. The 460 m grid section (orange on the maps) matches across layouts with 0.0 m deviation, checked in code. Each redesign changes only the track after the grid, from Turn 1 onward. Turns 1-3 also stay as they are.

Data: OpenStreetMap through the Overpass API (maps.mail.ru mirror, fetched 2026-10-11), bbox 1.272-1.304 N, 103.838-103.878 E. Coordinates are projected to SVY21 (EPSG:3414). The track was built by shortest-path routing between road junctions, restricted to named streets. Scripts: `lib.py`, `layouts.py`, `analyse.py`. Raw numbers: `metrics.json`.

## Comparison table (all values computed; lap times are estimates from a point-mass sim)

| Metric | Current (reconstructed) | Redesign A "Bayfront Paperclip" | Redesign B "Nicoll Hairpin + Bayfront Loop" |
|---|---|---|---|
| Routed street length (raw polyline) | 4.818 km | 4.557 km | 4.683 km |
| Smoothed centreline length (used in sim) | 4.715 km | 4.484 km | 4.580 km |
| Corners detected (>=20° heading change) | 16 | 11 | 14 |
| Slow 90°-type corners (>60°, sim min speed <120 km/h) | 7 | 5 | 7 |
| Longest straight | 731 m (grid straight) | 1,237 m (Bayfront Ave) | 731 m (grid straight; Bayfront 640 m) |
| Heavy braking zones (straight >400 m into corner >70°) | 2 | 2 | 2 |
| Overtaking score (see definition) | 4.78 | 7.09 | 5.98 |
| DRS zones (3 longest straights) | 731 / 466 / 428 m | 1,237 / 1,132 / 466 m | 731 / 640 / 500 m |
| Sim top speed | 312 km/h | 323 km/h | 312 km/h |
| **Estimated lap time (sim)** | **86.0 s** | **74.0 s** | **81.2 s** |
| Temporary links needed | none new (2 links stand in for gaps in the OSM data) | 1 x 101 m | 2 x 130 m + 101 m |

Overtaking score = sum over heavy-braking zones of (speed drop in km/h / 100) x (straight length / 500 m). It is a simple relative index, not a validated model.

## Reconstruction of the current layout and its approximations
Route: grid straight, T1-T3 raceway, Republic Blvd, Raffles Blvd, Nicoll Hwy, Stamford Rd, St Andrew's Rd, Connaught Dr, Anderson Bridge, Fullerton Rd hairpin, Esplanade Dr (bridge), Raffles Ave, the 2023 straight (raceway), final corner.
- The routed length is 4.818 km against the official 4.940 km (-2.5%). The routed line follows road centrelines and dual-carriageway nodes, not the actual barrier lines.
- **Anderson Bridge** is missing from the fetched OSM road set. It is a straight 243 m link from Connaught Dr to Fullerton Rd.
- The **T14 slip** from Esplanade Dr onto Raffles Ave is only partly tagged as raceway. It is a straight 146 m link.
- I found 16 corners against the official 19. Small kinks under 20° are not counted, and corners of the same direction less than 40 m apart are merged.
- Polylines are smoothed with a Gaussian of σ = 14 m. Corner radius is floored at 12 m, roughly a street-junction corner.

## Sim assumptions (estimates)
- Point-mass model with 4 g lateral, 5 g braking and a 330 km/h cap.
- Acceleration is 11·(1-(v/vmax)²) m/s², an assumed traction/drag curve.
- Flying lap, no elevation, no tyre or aero modelling, a 2 m step and forward/backward passes.
- The current layout's 86.0 s is in the same range as recent pole times (~89-90 s). The model is optimistic, so **compare layouts by the difference, not the absolute time**.

## Redesign A: "Bayfront Paperclip" (only real roads plus one 101 m link)
- After T3, Republic Blvd runs south onto Raffles Ave. A right turn takes the track onto **Bayfront Ave, flat out for 1.24 km south**.
- **Marina Blvd** (two ~90° corners) turns the cars back. **Sheares Ave** then runs 1.13 km north, the opposite carriageway of the same corridor.
- A 101 m temporary link joins the 2023 straight and the unchanged final corner and grid.
- Effect: the two longest straights on any layout (1.24 km and 1.13 km), each ending in heavy braking. The best overtaking score (7.09, +48%). Fewer slow 90° corners (5).
- Downsides: the Civic District / Padang section is dropped entirely. The two straights run side by side, as close as ~40-100 m apart, and need a central barrier. At 4.48 km it sits at the low end of the target length.

## Redesign B: "Nicoll Hairpin + Bayfront Loop" (keeps the Raffles Blvd/Nicoll section)
- T1-T6 are kept as today, through Raffles Blvd and Nicoll Hwy.
- Instead of the Stamford / St Andrew's / Padang / Anderson / Fullerton loop, the track turns from Nicoll Hwy straight onto **Raffles Ave**. That gives a long run east (with a 29° flat kink).
- The track then goes south on **Bayfront Ave** (640 m, heavy braking). A flagged 130 m crossover hairpin at about 1.2833 N reaches **Sheares Ave**, which runs back north (~500 m DRS).
- It finishes through the existing final corner onto the unchanged grid.
- Effect: overtaking score 5.98 (+25%). It cuts the slowest Padang-area 90° sequence and stays closer to today's character.
- Downsides: it needs two short temporary links. The crossover forms two close 90° corners rather than a true hairpin.

## Not achieved / caveats
- Neither design reaches the 3 heavy-braking zones target. Under the strict definition each layout, including the current one, has 2.
- East Coast Pkwy / Sheares Bridge were not used. They are a grade-separated expressway, and joining them would need long temporary ramps.
- No checks were made for run-off areas, track width, barriers or FIA Grade 1 compliance.
- Maps: `current.png`, `redesign.png` (= B), `redesign_A.png`, `redesign_B.png`, `comparison.png`, `speed_traces.png`. GeoJSON: `current.geojson`, `redesign_A.geojson`, `redesign_B.geojson`, each with the centreline, the unchanged grid, turns, DRS zones and braking zones.


---
# v2 update (2026 regulations and grade separation)
See the repository README for full assumptions and sources. Results from `analyse2.py`:

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

The v1 Redesigns A and B are infeasible: they use Bayfront Bridge (layer 2) and the Benjamin Sheares Bridge / ECP structures. They are replaced by the at-grade A2 and B2. The grid is unchanged in all layouts.
