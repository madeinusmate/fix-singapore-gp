<p align="center">
  <a href="https://fixsingaporegp.com">
    <img src="public/favicon.svg" alt="" width="72" height="72">
  </a>
</p>

<h1 align="center">Fix Singapore GP</h1>

<p align="center">
  Draw a Marina Bay lap on real streets, score it under a 2026-regulation lap sim, and drive it.
</p>

<p align="center">
  <a href="https://fixsingaporegp.com"><img src="https://img.shields.io/badge/site-fixsingaporegp.com-e10600" alt="Live site"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License"></a>
  <a href="https://github.com/madeinusmate/sgp-circuit-redesign/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/tests-vitest-6E9F18?logo=vitest&logoColor=white" alt="Tests: Vitest"></a>
  <img src="https://img.shields.io/badge/node-20.19%20%7C%2022.12-339933?logo=nodedotjs&logoColor=white" alt="Node.js 20.19 or 22.12">
  <img src="https://img.shields.io/badge/pnpm-8.15-F69220?logo=pnpm&logoColor=white" alt="pnpm 8.15">
  <img src="https://img.shields.io/badge/vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/react-19-087EA4?logo=react&logoColor=white" alt="React 19">
</p>

<p align="center">
  <a href="https://fixsingaporegp.com">Live site</a>
  ·
  <a href="#quick-start">Quick start</a>
  ·
  <a href="#license">License</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <a href="https://fixsingaporegp.com">
    <img src="https://fixsingaporegp.com/api/og?v=1" alt="Marina Bay has an overtaking problem. Fix it." width="820">
  </a>
</p>

A public site for proposing laps of the Marina Bay street circuit and comparing them under a simple 2026-regulation lap sim. The start/finish straight on Republic Boulevard is fixed. A layout may run it clockwise or anticlockwise, and the rest of the lap follows real streets.

Lap times and the overtaking index are estimates, not predictions.

## Features

- **Editor.** Drop waypoints on the Marina Bay streets. The lap between them follows the road graph. The route home, from the last waypoint back to the starting grid, is drawn dashed.
- **A lap that can be published.** It is closed, never drives the same road twice in either direction, does not cross itself where both roads are at the same level, and is between 3.5 km and 7 km.
- **2026 lap sim.** A point-mass model in the browser, ported from `analysis/analyse2.py`. Every layout, including the current one, is scored the same way.
- **The grid.** Published layouts, most upvotes first. One Google account, one upvote per layout.
- **Drive.** `/l/:id/drive` puts a car on the layout, with the sim's lap as a ghost. Eight-speed gearbox, downforce that grows with speed, tyre grip that falls off past the slip peak, and concrete walls behind a kerb and a strip of run-off.
- **Share cards.** Link-preview crawlers get a card from `api/layout-card` or `api/page-card`. `api/og` draws the image.

Drafts stay in the browser. Publishing and upvoting need Google sign-in. The current circuit and the editor still run with no Firebase keys.

## Quick start

Node `^20.19.0` or `>=22.12.0`.

```bash
pnpm install
pnpm dev
```

`pnpm test` checks the lap sim against the published Python figures and checks that the current lap can be rebuilt from its waypoints. `pnpm build` writes `dist/`.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production build into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm test` | Vitest |
| `pnpm lint` | oxlint |
| `pnpm city` | OpenStreetMap → OSM2World → `public/drive/city.glb` |
| `pnpm car` | F1 model → `public/drive/f1.glb` |
| `pnpm drive-assets` | Sky, track textures, tyre loop, engine worklet |

## Publish a layout

1. Create a Firebase project. Copy `.firebaserc.example` to `.firebaserc` and set your project id. `.firebaserc` stays on your machine.
2. Enable Google sign-in and Firebase Storage. Deploy the rules and the leaderboard index with `firebase deploy --only firestore:rules,firestore:indexes,storage`. Storage rules go to the project's default bucket, and `VITE_FIREBASE_STORAGE_BUCKET` must be that bucket. Publishing uploads a public JPEG of the 3D view to `layouts/{uid}/{layoutId}.jpg`.
3. Copy `.env.example` to `.env` and fill in the web app config. Those `VITE_` values are public in the browser bundle. Leave `VITE_FIREBASE_AUTH_DOMAIN` empty. Sign-in then uses `https://<project-id>.firebaseapp.com/__/auth/handler`, which is the redirect URI Firebase registers with Google.
4. Add the production domain, such as `fixsingaporegp.com`, under Firebase Authentication → Settings → Authorized domains. Restrict the web API key to that domain.

`VITE_RHEO_PUBLISHABLE_KEY` is optional. It turns on [Rheo](https://getrheo.io) analytics. Leave it empty and the site runs without it.

`vercel.json` rewrites the app to `index.html`. Link-preview crawlers that open `/l/:id` get `api/layout-card` instead, and crawlers that open `/create`, `/terms`, or `/privacy` get `api/page-card`. Those cards point `og:image` at `api/og`, which draws the PNG with `@vercel/og`. A published layout's card includes its public 3D picture when that picture is the one stored for the layout. `api/layout-card` and `api/og` read the layout with `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY`, the same public values the browser build uses. A same-origin auth domain needs an extra rewrite to your own project, and `https://<that-domain>/__/auth/handler` on the Firebase web client's Authorized redirect URIs in Google Cloud Console → APIs & Services → Credentials. Without that entry Google blocks sign-in with `Error 400: redirect_uri_mismatch`.

```json
{ "source": "/__/auth/:path*", "destination": "https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/:path*" }
```

## Street data

```bash
cd analysis
python3 -m venv .venv && . .venv/bin/activate
pip install numpy pyproj networkx scipy requests
python export_web.py
```

That writes `public/data/graph.json`, `dem.json`, and `current.json`. The graph is the OpenStreetMap extract plus Anderson Bridge and the Turn 14 slip. The pit lane is left out. `python export_web.py dem` refreshes only the elevation grid.

`analysis/analyse2.py` is the reference sim. `analysis/fixtures/sim-path.json` is the centreline those published figures were computed on, including a pit-lane detour the site no longer uses. The current layout shown on the site keeps to the start/finish straight.

## Drive a layout

`/l/:id/drive` plays engine, tyre, and wind sound once you press a key.

| Key | Action |
| --- | --- |
| ↑ | Throttle |
| ↓ | Brake. Hold at a stop to reverse |
| ← → | Steer |
| E / Q | Shift by hand |
| C | Change camera |
| M | Sound |
| R | Restart |

`pnpm city` downloads the same Marina Bay window and bakes it with [OSM2World](https://osm2world.org/) and its CC0 texture style into a compressed, textured glTF. Drive mode lays it under the lap: buildings, streets, water, and parks, in the same metre grid as the road. The bake is flat, so a bridge in the drive view is the lap's own ramp. `pnpm car` and `pnpm drive-assets` fetch the car, sky, textures, and sounds from their sources.

## Project layout

```
src/            React app: editor, lap sim, drive mode, leaderboard
src/sim/        Browser lap sim and street routing
src/drive/      3D drive mode
src/lab/        Map, ribbon, and lap view
public/data/    Street graph, elevation, current lap, basemap style
public/drive/   City mesh, car, textures, audio
analysis/       Reference Python sim, OSM export, asset bake scripts
api/            Link-preview HTML and the OG image
docs/adr/       Decisions that should stay put
LICENSES/       Licence texts for the data and assets that ship here
```

## Stack

[Vite](https://vite.dev) and [React 19](https://react.dev). Maps with [MapLibre GL](https://maplibre.org). The drive view is [Three.js](https://threejs.org) through [React Three Fiber](https://r3f.docs.pmnd.rs). Published layouts, votes, and the 3D picture use [Firebase](https://firebase.google.com) Auth, Firestore, and Storage. The site is hosted on [Vercel](https://vercel.com). Tests are [Vitest](https://vitest.dev). Lint is [oxlint](https://oxc.rs/docs/guide/usage/linter).

## Caveats

Geometry follows street centrelines. The sim is a point-mass model: it does not include run-off, track width, tyres, slipstream, or the fuel-flow limit. Basemap © OpenStreetMap contributors, via OpenFreeMap and the OpenMapTiles schema. Road data and the drive-mode city © OpenStreetMap contributors (ODbL), the city generated with OSM2World. Elevation is Copernicus WorldDEM-90 via Open-Meteo (CC BY 4.0). The drive car is “F1 2022” by Blender458 (CC BY 4.0). [CREDITS.md](CREDITS.md) lists every third-party asset with its author and licence, and the drive page shows the same list under Credits.

## License

Original code is copyright Stefano Cantu and released under the [MIT License](LICENSE).

The MIT license covers that code. Files derived from other people's data keep the licence named here. The texts are in [LICENSES](LICENSES), and the attribution list is [CREDITS.md](CREDITS.md). [NOTICE](NOTICE) is the short form that should travel with a copy of the repository.

| What | Licence | Text |
| --- | --- | --- |
| Original source | MIT | [LICENSE](LICENSE) |
| Street graph, current lap, traces, city mesh | ODbL 1.0 | [LICENSES/ODbL-1.0.txt](LICENSES/ODbL-1.0.txt) |
| Elevation (`public/data/dem.json`) | CC BY 4.0 | [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt) |
| F1 car (`public/drive/f1.glb`) | CC BY 4.0 | [LICENSES/CC-BY-4.0.txt](LICENSES/CC-BY-4.0.txt) |
| Tyre squeal | CC BY 3.0 | [LICENSES/CC-BY-3.0.txt](LICENSES/CC-BY-3.0.txt) |
| City textures, track textures, sky | CC0 1.0 | [LICENSES/CC0-1.0.txt](LICENSES/CC0-1.0.txt) |
| Engine worklet | MIT | [engine-sound-generator-LICENSE.txt](public/drive/audio/engine-sound-generator-LICENSE.txt) |

Street geometry is a derived OpenStreetMap database. That covers `analysis/osm.json`, `public/data/graph.json`, `public/data/current.json`, `analysis/fixtures/sim-path.json`, the GeoJSON and traces under `analysis/`, and `public/drive/city.glb`. © OpenStreetMap contributors.

`public/data/dem.json` is from the Open-Meteo Elevation API (CC BY 4.0), produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

`public/data/style-min-dark.json` is an original style. Its tiles come from OpenFreeMap. Dev-only tools with separate licenses, including MPL and LGPL build tools, are listed in [NOTICE](NOTICE).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test` and `pnpm lint` run on every pull request.
