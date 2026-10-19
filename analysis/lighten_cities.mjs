// Rewrites the baked city glbs through meshoptimizer's simplifier.
// The drive page already has these files; a full OSM2World bake is not required
// to drop coplanar detail. Safe to re-run: each pass is capped by the same
// error limit, so a second run removes very little.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions'
import { prune, quantize, reorder, simplify, weld } from '@gltf-transform/functions'
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const root = new URL('../public/drive/', import.meta.url)
const files = [
  new URL('city.glb', root),
  ...readdirSync(new URL('cities/', root))
    .filter((name) => name.endsWith('.glb'))
    .map((name) => new URL(`cities/${name}`, root)),
]

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready])
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
})

const vertsOf = (doc) => doc.getRoot().listMeshes().reduce((sum, mesh) => (
  sum + mesh.listPrimitives().reduce((inner, prim) => inner + (prim.getAttribute('POSITION')?.getCount() || 0), 0)
), 0)

for (const file of files) {
  const doc = await io.readBinary(new Uint8Array(readFileSync(file)))
  const before = vertsOf(doc)
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.0001, lockBorder: true }),
    prune(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    quantize({ pattern: /^(POSITION|NORMAL|COLOR_0)$/, quantizeNormal: 8 }),
  )
  doc.createExtension(EXTMeshoptCompression)
    .setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const bin = await io.writeBinary(doc)
  writeFileSync(file, Buffer.from(bin))
  const after = await io.readBinary(bin)
  console.log(`${file.href.split('/').pop()} ${before} -> ${vertsOf(after)} verts, ${(bin.byteLength / 1e6).toFixed(1)} MB`)
}
