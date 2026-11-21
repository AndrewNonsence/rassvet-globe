// Run from this folder: node moon-prepare.mjs <catalog-id> <source.glb> <output.glb>
import { NodeIO, getBounds } from '@gltf-transform/core';
import { readFile } from 'node:fs/promises';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, dequantize, prune, tangents, unweld, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { generateTangents } from 'mikktspace';

const [, , id, input, output] = process.argv;
if (!output) throw new Error('Expected catalog ID, source path and output path');
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'meshopt.decoder': MeshoptDecoder
});
const doc = await io.read(input);
const root = doc.getRoot();
for (const animation of root.listAnimations()) animation.dispose();
const decoded = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'EXT_texture_webp'];
for (const extension of root.listExtensionsUsed()) {
  if (decoded.includes(extension.extensionName)) extension.dispose();
}
await doc.transform(dequantize(), dedup(), prune());
if (id === 'gateway') {
  await doc.transform(unweld(), tangents({generateTangents}), weld());
  // Degenerate UV triangles in the source have no MikkTSpace direction.
  for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
    const tangent = prim.getAttribute('TANGENT'), normal = prim.getAttribute('NORMAL');
    if (!tangent) continue;
    for (let i = 0; i < tangent.getCount(); i++) {
      const [tx, ty, tz] = tangent.getElement(i, []);
      if (Math.hypot(tx, ty, tz) > 0.99) continue;
      const [x, y, z] = normal.getElement(i, []);
      const axis = Math.abs(x) < 0.8 ? [0,z,-y] : [-z,0,x];
      const length = Math.hypot(...axis);
      tangent.setElement(i, [...axis.map(v => v / length),1]);
    }
  }
}
if (id === 'luna17' || id === 'change4') {
  const license = await readFile(new URL('../../models/moon/Space-Radar-LICENSE.txt', import.meta.url), 'utf8');
  root.setExtras({...root.getExtras(), license, creator:'Space Radar (spaceradar.ai)'});
}

// Embedded PNG/JPEG and ordinary mesh buffers work in the offline deck.gl viewer.
for (const texture of root.listTextures()) {
  const image = sharp(texture.getImage());
  if (id === 'gateway') image.resize(512, 512, {fit:'inside', withoutEnlargement:true});
  const alpha = (await image.stats()).isOpaque === false;
  texture.setImage(await (alpha ? image.png() : image.jpeg({quality:85, chromaSubsampling:'4:4:4'})).toBuffer())
    .setMimeType(alpha ? 'image/png' : 'image/jpeg').setURI('');
}
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const { min, max } = getBounds(scene);
const radius = Math.hypot(...max.map((v, i) => (v - min[i]) / 2));
if (!Number.isFinite(radius) || radius <= 0) throw new Error('Empty scene');
const center = min.map((v, i) => (v + max[i]) / 2);
const frame = doc.createNode('Viewer frame').setTranslation(center.map(v => -v / radius))
  .setScale([1/radius, 1/radius, 1/radius]);
for (const child of [...scene.listChildren()]) frame.addChild(child);
scene.addChild(frame);
await io.write(output, doc);
