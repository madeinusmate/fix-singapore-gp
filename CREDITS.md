# Credits

The drive page (`/l/:id/drive`) is built from open data and openly licensed
assets. Each one is listed here with its licence, and the same list is shown on
the page under **Credits**. The scripts in `analysis/` fetch every asset from
its source and rebuild what is in `public/drive/`.

| Asset | Source | Author | Licence | Changes |
| --- | --- | --- | --- | --- |
| Map data for the city and the streets the lap runs on | [OpenStreetMap](https://www.openstreetmap.org/copyright) | OpenStreetMap contributors | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Converted to a 3D mesh, see below |
| City mesh (`public/drive/city.glb`) | [OSM2World](https://github.com/tordanik/OSM2World) web build | Tobias Knerr and contributors | [MIT](https://github.com/tordanik/OSM2World/blob/master/LICENSE.txt) | Baked by `analysis/bake_city.mjs`: clipped to the bay, with Marina Reservoir, parks and land use that cross the edge clipped to it and the sea built from the coastline (`analysis/osm_areas.mjs`), split into 1 km cells, compressed |
| City textures, inside `city.glb` | [OSM2World default style](https://github.com/tordanik/OSM2World-default-style) (textures from the [OSM Texture Library](https://wiki.openstreetmap.org/wiki/Texture_Library) and [ambientCG](https://ambientcg.com)) | OSM2World, OpenStreetMap community, ambientCG | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Resized to 512 px, WebP |
| Track textures (`public/drive/textures/`): Asphalt010, Concrete034, Fence006 | [ambientCG](https://ambientcg.com), as served with the OSM2World default style | Lennart Demes (ambientCG) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | WebP |
| F1 car (`public/drive/f1.glb`) | [“F1 2022” on Sketchfab](https://sketchfab.com/3d-models/f5b9ca6095124bf796934c150d178a02) | Blender458 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `analysis/prep_car.mjs`: turned nose to +X, scaled to a 3.6 m wheelbase, wheels split onto steer and spin pivots, paint merged into a recolourable livery, spoke texture added to the rims, mesh compressed |
| Engine sound (`public/drive/audio/engine_sound_generator_worklet.js`) | [engine-sound-generator](https://github.com/Antonio-R1/engine-sound-generator) at `c76c5ad` | Antonio-R1 | [MIT](public/drive/audio/engine-sound-generator-LICENSE.txt) | Unmodified; parameters chosen in `src/drive/audio.js` |
| Tyre squeal (`public/drive/audio/tyre-squeal-loop.wav`) | [“Car tire squeal skid loop” on OpenGameArt](https://opengameart.org/content/car-tire-squeal-skid-loop) | audible-edge (Tom Haigh), submitted by qubodup | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) | Resampled from 96 kHz 24-bit to 22.05 kHz 16-bit |
| Sky (`public/drive/sky.jpg`) | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky), Poly Haven | Greg Zaal, Jarod Guest | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Tonemapped JPG resized to 4096 × 2048 |
| 3D engine | [three.js](https://threejs.org), [React Three Fiber](https://github.com/pmndrs/react-three-fiber), [meshoptimizer](https://github.com/zeux/meshoptimizer) decoder | three.js authors, Poimandres, Arseny Kapoulkine | MIT | — |
| Asset build tools (not shipped) | [glTF-Transform](https://gltf-transform.dev), [sharp](https://sharp.pixelplumbing.com), [polygon-clipping](https://github.com/mfogel/polygon-clipping) | Don McCurdy; Lovell Fuller; Mike Fogel | MIT; Apache 2.0; MIT | — |

## Rebuilding the assets

```bash
pnpm city          # OpenStreetMap → OSM2World → public/drive/city.glb (needs Overpass, a few minutes)
pnpm car           # F1 2022 → public/drive/f1.glb
pnpm drive-assets  # sky, track textures, tyre loop and engine worklet
```
