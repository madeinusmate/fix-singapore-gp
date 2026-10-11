# Marina Bay layouts

A public site for proposing laps of the Marina Bay street circuit and comparing them under a simple 2026-regulation lap sim. The start/finish straight on Republic Boulevard is fixed. A layout may run it clockwise or anticlockwise, and the rest of the lap follows real streets.

Lap times and the overtaking index are estimates, not predictions.

## Run the site

```bash
pnpm install
pnpm dev
```

`pnpm test` checks the lap sim against the published Python figures and checks that the current lap can be rebuilt from its waypoints. `pnpm build` writes `dist/`.

## Publish a layout

Drafts stay in the browser. Publishing and upvoting use Google sign-in and Cloud Firestore.

1. Create a Firebase project, enable Google sign-in, and deploy the rules and the leaderboard index with `firebase deploy --only firestore:rules,firestore:indexes`.
2. Copy `.env.example` to `.env` and fill in the web app config.
3. In `vercel.json`, replace `YOUR_PROJECT_ID` with the Firebase project id. That rewrite keeps Google sign-in on the site's own domain.
4. Add the Vercel domain to Firebase's authorized domains.

Without those keys the current circuit and the editor still work. The leaderboard, Publish and upvotes stay unavailable.

## Rebuild the street data

```bash
cd analysis
python3 -m venv .venv && . .venv/bin/activate
pip install numpy pyproj networkx scipy requests
python export_web.py
```

That writes `public/data/graph.json`, `dem.json`, and `current.json`. The graph is the OpenStreetMap extract plus Anderson Bridge and the Turn 14 slip. The pit lane is left out. `python export_web.py dem` refreshes only the elevation grid.

`analysis/analyse2.py` is the reference sim. `analysis/fixtures/sim-path.json` is the centreline those published figures were computed on, including a pit-lane detour the site no longer uses. The current layout shown on the site keeps to the start/finish straight.

## Caveats

Geometry follows street centrelines. The sim is a point-mass model: it does not include run-off, track width, tyres, slipstream, or the fuel-flow limit. Basemap © OpenStreetMap contributors via OpenFreeMap. Road data © OpenStreetMap contributors (ODbL).
