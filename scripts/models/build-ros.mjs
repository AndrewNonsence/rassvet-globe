// Original, non-metric diagram of the four-module ROS separation scenario.
// Run with node scripts/models/build-ros.mjs from any directory.
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';

const doc = new Document();
const scene = doc.createScene('ROS · separation study');
const buffer = doc.createBuffer();
const output = fileURLToPath(new URL('../../models/ros.glb', import.meta.url));

function material(name, srgb) {
  const linear = srgb.map(channel => (channel / 255) ** 2.2);
  return doc.createMaterial(name).setBaseColorFactor([...linear, 1]).setDoubleSided(true);
}

const ceramic = material('Nauka · ivory', [217, 210, 187]);
const copper = material('Node · ochre', [219, 156, 91]);
const steel = material('NEM · blue-grey', [131, 170, 208]);
const green = material('Airlock · jade', [128, 191, 174]);
const rim = material('Fittings', [176, 186, 199]);
const photovoltaic = material('Solar blankets', [64, 99, 144]);

function mesh(name, color, positions, indices) {
  const coords = doc.createAccessor().setType('VEC3').setArray(Float32Array.from(positions)).setBuffer(buffer);
  const faces = doc.createAccessor().setType('SCALAR').setArray(Uint16Array.from(indices)).setBuffer(buffer);
  const primitive = doc.createPrimitive().setAttribute('POSITION', coords).setIndices(faces).setMaterial(color);
  return doc.createMesh(name).addPrimitive(primitive);
}

// Radius as a function of position along X, with simple flat end caps.
function turned(name, color, rings, sides = 20) {
  const positions = [], indices = [];
  for (const [x, r] of rings) {
    for (let j = 0; j < sides; j++) {
      const theta = 2 * Math.PI * j / sides;
      positions.push(x, r * Math.cos(theta), r * Math.sin(theta));
    }
  }
  for (let i = 1; i < rings.length; i++) {
    for (let j = 0; j < sides; j++) {
      const a = (i - 1) * sides + j, b = (i - 1) * sides + (j + 1) % sides;
      indices.push(a, b, b + sides, a, b + sides, a + sides);
    }
  }
  const last = (rings.length - 1) * sides;
  for (let j = 1; j < sides - 1; j++) indices.push(0, j + 1, j, last, last + j, last + j + 1);
  return mesh(name, color, positions, indices);
}

function unitBox(name, color) {
  const p = [-1,-1,-1, 1,-1,-1, 1,1,-1, -1,1,-1, -1,-1,1, 1,-1,1, 1,1,1, -1,1,1];
  const indices = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,4,7, 0,7,3, 1,2,6, 1,6,5, 3,7,6, 3,6,2, 0,1,5, 0,5,4];
  return mesh(name, color, p.map(v => v / 2), indices);
}

function add(parent, mesh, position = [0,0,0], scale = [1,1,1], rotation) {
  const n = doc.createNode().setMesh(mesh).setTranslation(position).setScale(scale);
  if (rotation) n.setRotation(rotation);
  parent.addChild(n);
}

function part(id) {
  const n = doc.createNode('part:' + id);
  scene.addChild(n);
  return n;
}

const girder = unitBox('Structural beam', rim);
const tile = unitBox('Solar-array segment', photovoltaic);
const collar = turned('Docking collar', rim, [[-0.1,0.83],[-0.07,1],[0.07,1],[0.1,0.83]]);
const ninety = Math.SQRT1_2;
const alongZ = [0, -ninety, 0, ninety];
const alongY = [0, 0, ninety, ninety];

function solarWings(parent, x, width, baySize, bays) {
  const span = 1.2 + bays * baySize;
  add(parent, girder, [x,0,0], [0.14,span*2,0.13]);
  for (const sign of [-1,1]) {
    for (let i = 0; i < bays; i++) {
      const y = sign * (1.2 + (i + 0.5) * baySize);
      for (const side of [-1,1]) {
        add(parent, tile, [x + side * width * 0.26,y,0], [width*0.48,baySize*0.94,0.085]);
      }
    }
  }
}

// Nauka's stepped hull and short pair of solar wings.
const nauka = part('nauka');
add(nauka, turned('Laboratory hull', ceramic, [
  [-7.6,0.54],[-7.35,0.81],[-6.96,0.94],[-5.75,0.94],[-5.42,1.14],
  [-3.06,1.14],[-2.73,0.85],[-2.02,0.81],[-1.70,0.54],[-1.39,0.54],
]));
for (const [x, r] of [[-7.44,0.77],[-6.0,0.99],[-5.35,1.19],[-3.15,1.19],[-1.49,0.65]]) {
  add(nauka, collar, [x,0,0], [0.85,r,r]);
}
solarWings(nauka, -6.36, 1.55, 0.85, 4);

// The ochre hub is the visual centre and the common docking junction.
const node = part('node');
add(node, turned('Universal node', copper, [
  [-1.30,0.48],[-0.91,0.67],[-0.62,1.02],[-0.24,1.18],[0.24,1.18],
  [0.62,1.02],[0.91,0.67],[1.30,0.48],
]));
const port = turned('Port neck', copper, [[-0.31,0.48],[-0.15,0.56],[0.31,0.54]]);
for (const sign of [-1,1]) {
  add(node, collar, [sign*1.32,0,0], [1,0.65,0.65]);
  add(node, port, [0,sign*1.12,0], [1,1,1], alongY);
  add(node, collar, [0,sign*1.40,0], [1,0.64,0.64], alongY);
  add(node, port, [0,0,sign*1.12], [1,1,1], alongZ);
  add(node, collar, [0,0,sign*1.40], [1,0.64,0.64], alongZ);
}

// NEM has a long equipment section and the largest solar span.
const nem = part('nem');
add(nem, turned('Science and power hull', steel, [
  [1.39,0.53],[1.77,0.53],[2.10,0.94],[2.48,1.10],[4.88,1.10],
  [5.22,0.93],[6.77,0.93],[7.04,0.74],[7.41,0.74],
]));
for (const [x, r] of [[1.51,0.65],[2.53,1.15],[4.80,1.15],[5.27,0.98],[6.74,0.98]]) {
  add(nem, collar, [x,0,0], [0.85,r,r]);
}
solarWings(nem, 6.22, 2.72, 1.27, 5);

// Shorter transverse module, with a distinct outer hatch.
const airlock = part('airlock');
add(airlock, turned('Airlock hull', green, [
  [1.48,0.51],[1.88,0.51],[2.12,0.76],[2.42,0.82],[3.74,0.82],
  [3.93,0.68],[4.38,0.68],[4.51,0.56],
]), [0,0,0], [1,1,1], alongZ);
for (const [z, r] of [[1.58,0.62],[2.38,0.86],[3.68,0.86],[4.5,0.61]]) {
  add(airlock, collar, [0,0,z], [1,r,r], alongZ);
}

await new NodeIO().write(output, doc);
