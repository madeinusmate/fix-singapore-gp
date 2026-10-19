<div align="center">

# Fix Singapore GP

### Marina Bay Circuit has an overtaking problem. Fix it.

**62 laps under the lights and hardly anywhere to pass. Keep the start/finish straight, take any street after Turn 1, and find out in seconds whether your lap would let cars race under the 2026 rules and what overtaking index it gets.**

[![Live site](https://img.shields.io/badge/site-fixsingaporegp.com-e10600?style=flat-square)](https://fixsingaporegp.com)
[![MIT license](https://img.shields.io/badge/license-MIT-f4c430?style=flat-square)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20.19%20%7C%2022.12-339933?style=flat-square&logo=nodedotjs&logoColor=white)](#quick-start)
[![pnpm](https://img.shields.io/badge/pnpm-8.15-F69220?style=flat-square&logo=pnpm&logoColor=white)](https://pnpm.io)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white)](https://vite.dev)
[![React](https://img.shields.io/badge/React-19-087EA4?style=flat-square&logo=react&logoColor=white)](https://react.dev)
[![Tests](https://img.shields.io/badge/tests-Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white)](https://github.com/madeinusmate/sgp-circuit-redesign/actions/workflows/ci.yml)

[![MapLibre](https://img.shields.io/badge/MapLibre-GL-396CB2?style=flat-square&logo=maplibre&logoColor=white)](https://maplibre.org)
[![Three.js](https://img.shields.io/badge/Three.js-000?style=flat-square&logo=threedotjs&logoColor=white)](https://threejs.org)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%C2%B7%20Firestore-FFCA28?style=flat-square&logo=firebase&logoColor=black)](https://firebase.google.com)
[![Vercel](https://img.shields.io/badge/Vercel-hosted-000?style=flat-square&logo=vercel&logoColor=white)](https://vercel.com)

<a href="https://www.producthunt.com/products/fix-singapore-gp?embed=true&utm_source=badge-featured&utm_medium=badge&utm_campaign=badge-fix-singapore-gp" target="_blank" rel="noopener noreferrer"><img alt="Fix Singapore GP - Redesign the Singapore GP. Analyse it. Drive it in 3D. | Product Hunt" width="250" height="54" src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=1277599&theme=dark&t=1792047511187"></a>

**[Live site](https://fixsingaporegp.com/) · [Singapore](https://fixsingaporegp.com/singapore) · [Draw a layout](https://fixsingaporegp.com/singapore/create) · [Credits](CREDITS.md)**

[Quick start](#quick-start) · [Drive](#drive-a-layout) · [Publish](#publish-a-layout) · [FAQ](#faq) · [License](#license)

<code>pnpm install && pnpm dev</code>

<br />

<a href="https://fixsingaporegp.com">
  <img src="https://fixsingaporegp.com/api/og?v=1" alt="Marina Bay has an overtaking problem. Fix it." width="1200" />
</a>

<br /><br />

<table aria-label="Open the site">
<tr>
<td align="center" width="360">
  <a href="https://fixsingaporegp.com">
    <img src="public/favicon.svg" height="42" alt="" /><br />
    <strong>Open Fix Singapore GP</strong>
  </a><br />
  <sub>Draw a lap · Vote on the grid · Drive it</sub>
</td>
<td align="center" width="360">
  <a href="https://github.com/madeinusmate/sgp-circuit-redesign/issues">
    <img src="https://cdn.simpleicons.org/github/181717" height="42" alt="" /><br />
    <strong>Open an issue</strong>
  </a><br />
  <sub>Bugs · Ideas · A layout worth a look</sub>
</td>
</tr>
</table>

<br />

</div>

---

A public site for the Formula 1 street circuits. The homepage lists them. Each circuit has its own streets, raced lap, editor, and leaderboard: Singapore at `/singapore`, then Azerbaijan, Monaco, Las Vegas, Miami, and Madrid. Layouts keep that circuit's start/finish straight and follow real streets. A layout belongs to one circuit in the database, so a Monaco lap never shows up on the Singapore board.

Lap times and the overtaking index are estimates, not predictions.

Drafts stay in the browser. Publishing and upvoting need Google sign-in. The current circuit and the editor still run with no Firebase keys.

## Quick start

Node `^20.19.0` or `>=22.12.0`. The package manager is pnpm 8.15.9.

```bash
pnpm install
pnpm dev
```

`pnpm test` checks the lap sim against the published Python figures and checks that the current lap can be rebuilt from its waypoints. `pnpm lint` runs oxlint. `pnpm build` writes `dist/`.

## Features

- **Editor.** Drop waypoints on Singapore's streets. The lap between them follows the road graph. The route home, from the last waypoint back to the starting grid, is drawn dashed.
- **A lap that can be published.** It is closed, never drives the same road twice in either direction, does not cross itself where both roads are at the same level, and is at least 3.5 km (2.8 km in Monaco). A lap over 7 km is flagged and can still be published.
- **2026 lap sim.** A point-mass model in the browser, ported from `analysis/analyse2.py`. Every layout, including the current one, is scored the same way.
- **The grid.** Published layouts, most upvotes first. One Google account, one upvote per layout.
- **Drive.** `/singapore/l/:id/drive` puts a car on the layout, with the sim's lap as a ghost. Eight-speed gearbox, downforce that grows with speed, tyre grip that falls off past the slip peak, and concrete walls behind a kerb and a strip of run-off.
- **Share cards.** Link-preview crawlers get a card from `api/layout-card` or `api/page-card`. `api/og` draws the image.

## Drive a layout

`/singapore/l/:id/drive` plays engine, tyre, and wind sound once you press a key. The current layout and any published layout can be driven. A draft cannot. Older `/l/:id` and `/create` links redirect to `/singapore`.

| Key | Action |
| --- | --- |
| ↑ | Throttle |
| ↓ | Brake. Hold at a stop to reverse |
| ← → | Steer |
| E / Q | Shift by hand |
| C | Change camera |
| M | Sound |
| R | Restart |

`pnpm city` downloads the Marina Bay window and bakes it with [OSM2World](https://osm2world.org/) and its CC0 texture style into a compressed, textured glTF. The same bake, with a slug, writes the window around each other circuit (`public/drive/cities/monaco.glb` and the rest). Drive mode lays that city's mesh under the lap: buildings, streets, water, and parks, in the same metre grid as the road. The bake is flat, so a bridge in the drive view is the lap's own ramp. `pnpm car` and `pnpm drive-assets` fetch the car, sky, textures, and sounds from their sources.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production build into `dist/` |
| `pnpm preview` | Serve the production build |
| `pnpm test` | Vitest |
| `pnpm lint` | oxlint |
| `pnpm city` | OpenStreetMap → OSM2World → `public/drive/city.glb` (pass a slug for another circuit) |
| `pnpm car` | F1 model → `public/drive/f1.glb` |
| `pnpm drive-assets` | Sky, track textures, tyre loop, engine worklet |

## Publish a layout

1. Create a Firebase project. Copy `.firebaserc.example` to `.firebaserc` and set your project id. `.firebaserc` stays on your machine.
2. Enable Google sign-in and Firebase Storage. Deploy the rules and the leaderboard index with `firebase deploy --only firestore:rules,firestore:indexes,storage`. Storage rules go to the project's default bucket, and `VITE_FIREBASE_STORAGE_BUCKET` must be that bucket. Publishing uploads a public JPEG of the 3D view to `layouts/{uid}/{layoutId}.jpg`.
3. Copy `.env.example` to `.env` and fill in the web app config. Those `VITE_` values are public in the browser bundle. Leave `VITE_FIREBASE_AUTH_DOMAIN` empty. Sign-in then uses `https://<project-id>.firebaseapp.com/__/auth/handler`, which is the redirect URI Firebase registers with Google.
4. Add the production domain, such as `fixsingaporegp.com`, under Firebase Authentication → Settings → Authorized domains. Restrict the web API key to that domain.

`VITE_RHEO_PUBLISHABLE_KEY` is optional. It turns on [Rheo](https://getrheo.io) analytics. Leave it empty and the site runs without it.

`vercel.json` rewrites the app to `index.html`. Link-preview crawlers that open `/singapore/l/:id` get `api/layout-card` instead, and crawlers that open `/singapore/create`, a circuit page, `/terms`, or `/privacy` get `api/page-card`. Those cards point `og:image` at `api/og`, which draws the PNG with `@vercel/og`. A published layout's card includes its public 3D picture when that picture is the one stored for the layout. `api/layout-card` and `api/og` read the layout with `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY`, the same public values the browser build uses. A same-origin auth domain needs an extra rewrite to your own project, and `https://<that-domain>/__/auth/handler` on the Firebase web client's Authorized redirect URIs in Google Cloud Console → APIs & Services → Credentials. Without that entry Google blocks sign-in with `Error 400: redirect_uri_mismatch`.

```json
{ "source": "/__/auth/:path*", "destination": "https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/:path*" }
```

## Street data

```bash
cd analysis
node fetch_roads.mjs
python3 -m venv .venv && . .venv/bin/activate
pip install numpy pyproj networkx scipy requests
python export_web.py graph
```

`node fetch_roads.mjs` downloads every drivable street in Singapore (motorway down to residential, plus raceways) into `osm.json`. `python export_web.py` then writes `public/data/graph.json`, `dem.json`, and `current.json`. The graph is that extract plus Anderson Bridge and the Turn 14 slip. The pit lane is left out. `python export_web.py graph` rebuilds the streets without refreshing elevation, and `python export_web.py dem` refreshes only the elevation grid. The elevation grid and the 3D city stay on the Marina Bay window.

`analysis/analyse2.py` is the reference sim. `analysis/fixtures/sim-path.json` is the centreline those published figures were computed on, including a pit-lane detour the site no longer uses. The current layout shown on the site keeps to the start/finish straight.

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

## FAQ

<details>
<summary><strong>Do I need Firebase to run the site?</strong></summary>

<br />

The current circuit and the editor work with no keys. The leaderboard, Publish, and upvotes need a Firebase project. See [Publish a layout](#publish-a-layout).

</details>

<details>
<summary><strong>What stays the same on every layout?</strong></summary>

<br />

The start/finish straight on Republic Boulevard, by the Pit Building. The pit lane is not part of the lap. Racing sense, clockwise or anticlockwise, is chosen by the creator. The default is anticlockwise, matching the real race.

</details>

<details>
<summary><strong>Are the lap times predictions?</strong></summary>

<br />

They are estimates from a point-mass model. Geometry follows street centrelines. The sim leaves out run-off, track width, tyres, slipstream, and the fuel-flow limit.

</details>

<details>
<summary><strong>Can I drive a draft?</strong></summary>

<br />

Drive mode is for the current layout and any published layout. A draft stays in the browser where it was drawn.

</details>

<details>
<summary><strong>Which licence covers the streets?</strong></summary>

<br />

Original code is MIT. The street graph, traces, and city mesh stay under the Open Database License. Elevation and the F1 car are CC BY 4.0. Textures and the sky are CC0. The full list is in [License](#license) and [CREDITS.md](CREDITS.md).

</details>

<details>
<summary><strong>How do I report a security issue?</strong></summary>

<br />

Use a private advisory, described in [SECURITY.md](SECURITY.md). Leave `.env` values and Firebase admin keys out of issues and pull requests.

</details>

## Star history

<a href="https://www.star-history.com/?repos=madeinusmate%2Fsgp-circuit-redesign&amp;type=date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=madeinusmate/sgp-circuit-redesign&amp;type=date&amp;theme=dark&amp;legend=top-left" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=madeinusmate/sgp-circuit-redesign&amp;type=date" />
    <img alt="GitHub star history for Fix Singapore GP" src="https://api.star-history.com/chart?repos=madeinusmate/sgp-circuit-redesign&amp;type=date" />
  </picture>
</a>

## Caveats

Basemap © OpenStreetMap contributors, via OpenFreeMap and the OpenMapTiles schema. Road data and the drive-mode city © OpenStreetMap contributors (ODbL), the city generated with OSM2World. Elevation is Copernicus WorldDEM-90 via Open-Meteo (CC BY 4.0). The drive car is “F1 2022” by Blender458 (CC BY 4.0). [CREDITS.md](CREDITS.md) lists every third-party asset with its author and licence, and the drive page shows the same list under Credits.

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

Street geometry is a derived OpenStreetMap database. That covers `analysis/osm.json`, `public/data/graph.json`, `public/data/current.json`, `analysis/fixtures/sim-path.json`, the GeoJSON and traces under `analysis/`, and `public/drive/city.glb` plus `public/drive/cities/`. © OpenStreetMap contributors.

`public/data/dem.json` is from the Open-Meteo Elevation API (CC BY 4.0), produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

`public/data/style-min-dark.json` is an original style. Its tiles come from OpenFreeMap. Dev-only tools with separate licenses, including MPL and LGPL build tools, are listed in [NOTICE](NOTICE).

## Contributing

[Open an issue](https://github.com/madeinusmate/sgp-circuit-redesign/issues) to report a bug or suggest a change, or send a pull request.

See [CONTRIBUTING.md](CONTRIBUTING.md). `pnpm test` and `pnpm lint` run on every pull request. Report vulnerabilities through [SECURITY.md](SECURITY.md).
