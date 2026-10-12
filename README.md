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

1. Create a Firebase project. Copy `.firebaserc.example` to `.firebaserc` and set your project id. `.firebaserc` stays on your machine.
2. Enable Google sign-in and Firebase Storage. Deploy the rules and the leaderboard index with `firebase deploy --only firestore:rules,firestore:indexes,storage`. Storage rules go to the project's default bucket, and `VITE_FIREBASE_STORAGE_BUCKET` must be that bucket. Publishing uploads a public JPEG of the 3D view to `layouts/{uid}/{layoutId}.jpg`.
3. Copy `.env.example` to `.env` and fill in the web app config. Those `VITE_` values are public in the browser bundle. Leave `VITE_FIREBASE_AUTH_DOMAIN` empty. Sign-in then uses `https://<project-id>.firebaseapp.com/__/auth/handler`, which is the redirect URI Firebase registers with Google.
4. Add the production domain, such as `fixsingaporegp.com`, under Firebase Authentication → Settings → Authorized domains. Restrict the web API key to that domain.

`vercel.json` rewrites the app to `index.html`. Link-preview crawlers that open `/l/:id` get `api/layout-card` instead, so the share card can use that public picture. The function reads the layout with `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_API_KEY`, the same public values the browser build uses. A same-origin auth domain needs an extra rewrite to your own project, and `https://<that-domain>/__/auth/handler` on the Firebase web client's Authorized redirect URIs in Google Cloud Console → APIs & Services → Credentials. Without that entry Google blocks sign-in with `Error 400: redirect_uri_mismatch`.

```json
{ "source": "/__/auth/:path*", "destination": "https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/:path*" }
```

Without those keys the current circuit and the editor still work. The leaderboard, Publish and upvotes stay unavailable.

## Rebuild the street data

```bash
cd analysis
python3 -m venv .venv && . .venv/bin/activate
pip install numpy pyproj networkx scipy requests
python export_web.py
```

That writes `public/data/graph.json`, `dem.json`, and `current.json`. The graph is the OpenStreetMap extract plus Anderson Bridge and the Turn 14 slip. The pit lane is left out. `python export_web.py dem` refreshes only the elevation grid.

## Drive a layout

`/l/:id/drive` puts an F1 car on the layout, with the sim's lap as a ghost. The car has an eight-speed box, downforce that grows with speed, tyre grip that falls off past the slip peak, and concrete walls behind a kerb and a strip of run-off. The page plays engine, tyre and wind sound once you press a key.

Keys: ↑ throttle, ↓ brake (hold at a stop to reverse), ← → steer, E and Q to shift by hand, C to change camera, M for sound, R to restart.

## Rebuild the drive assets

```bash
pnpm city          # OpenStreetMap → OSM2World → public/drive/city.glb
pnpm car           # the F1 model → public/drive/f1.glb
pnpm drive-assets  # sky, track textures, tyre loop and engine worklet
```

`pnpm city` downloads the same Marina Bay window and bakes it with [OSM2World](https://osm2world.org/) and its CC0 texture style into a compressed, textured glTF. Drive mode lays it under the lap: buildings, streets, water and parks, in the same metre grid as the road. The bake is flat, so a bridge in the drive view is the lap's own ramp. The other two scripts fetch the car, sky, textures and sounds from their sources. [CREDITS.md](CREDITS.md) lists every third-party asset with its author and licence, and the drive page shows the same list under Credits.

`analysis/analyse2.py` is the reference sim. `analysis/fixtures/sim-path.json` is the centreline those published figures were computed on, including a pit-lane detour the site no longer uses. The current layout shown on the site keeps to the start/finish straight.

## Caveats

Geometry follows street centrelines. The sim is a point-mass model: it does not include run-off, track width, tyres, slipstream, or the fuel-flow limit. Basemap © OpenStreetMap contributors, via OpenFreeMap and the OpenMapTiles schema. Road data and the drive-mode city © OpenStreetMap contributors (ODbL), the city generated with OSM2World. Elevation is Copernicus WorldDEM-90 via Open-Meteo (CC BY 4.0). The drive car is “F1 2022” by Blender458 (CC BY 4.0); see [CREDITS.md](CREDITS.md) for the rest.

## License

Original code is copyright Stefano Cantu and released under the [MIT license](LICENSE).

Street geometry is a derived OpenStreetMap database and stays under the [Open Database License](https://opendatacommons.org/licenses/odbl/1-0/). That covers `analysis/osm.json`, `public/data/graph.json`, `public/data/current.json`, `analysis/fixtures/sim-path.json`, the GeoJSON and traces under `analysis/`, and `public/drive/city.glb`. The MIT license does not relicense those files.

`public/data/dem.json` is from the Open-Meteo Elevation API (CC BY 4.0), produced using Copernicus WorldDEM-90 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved.

`public/data/style-min-dark.json` is an original style. Its tiles come from OpenFreeMap. Dev-only tools with separate licenses, including MPL and LGPL build tools, are listed in [NOTICE](NOTICE).
