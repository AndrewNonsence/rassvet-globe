// Original functional schematic inspired by the CNSA/Roscosmos ILRS partnership guide.
// Generate the source GLB, then run moon-prepare.mjs to fit the catalog camera.
import { Document, NodeIO } from '@gltf-transform/core';
import { normals, flatten, join, weld } from '@gltf-transform/functions';

const doc = new Document(), scene = doc.createScene('ILRS · concept study');
const buffer = doc.createBuffer();
function material(name, color, metallic = 0.3) {
  return doc.createMaterial(name).setBaseColorFactor([...color,1])
    .setMetallicFactor(metallic).setRoughnessFactor(0.54).setDoubleSided(true);
}
const ceramic = material('Instrument housings', [0.73,0.72,0.62]);
const foil = material('Thermal blankets', [0.71,0.39,0.10],0.5);
const alloy = material('Structural alloy', [0.32,0.38,0.41]);
const rubber = material('Composite', [0.075,0.079,0.088]);
const cells = material('Solar cells', [0.042,0.115,0.26],0.28);

function mesh(name, color, coords, faces) {
  const attr = (type, array) => doc.createAccessor().setType(type).setBuffer(buffer).setArray(array);
  return doc.createMesh(name).addPrimitive(doc.createPrimitive()
    .setAttribute('POSITION',attr('VEC3',new Float32Array(coords)))
    .setIndices(attr('SCALAR',new Uint16Array(faces))).setMaterial(color));
}
function box(name,color) {
  return mesh(name,color,[-.5,-.5,-.5, .5,-.5,-.5, .5,.5,-.5, -.5,.5,-.5, -.5,-.5,.5, .5,-.5,.5, .5,.5,.5, -.5,.5,.5],
    [0,2,1,0,3,2,4,5,6,4,6,7,0,4,7,0,7,3,1,2,6,1,6,5,3,7,6,3,6,2,0,1,5,0,5,4]);
}
// Cross section [height,radius]. The profile can describe hulls, collars, or a concave reflector.
function lathe(name, color, profile, sides = 32) {
  const coords=[], faces=[];
  for (const [height,radius] of profile) {
    for (let i=0;i<sides;i++) {
      const angle=2*Math.PI*i/sides;
      coords.push(radius*Math.cos(angle),height,radius*Math.sin(angle));
    }
  }
  for (let level=0;level+1<profile.length;level++) {
    for (let i=0;i<sides;i++) {
      const a=level*sides+i,b=level*sides+(i+1)%sides;
      faces.push(a,a+sides,b, b,a+sides,b+sides);
    }
  }
  for(let i=1;i<sides-1;i++) {
    const last=(profile.length-1)*sides;
    faces.push(0,i,i+1,last,last+i+1,last+i);
  }
  return mesh(name,color,coords,faces);
}
const identity=[0,0,0,1];
const tiltX = radians => [Math.sin(radians/2),0,0,Math.cos(radians/2)];
const tiltZ = radians => [0,0,Math.sin(radians/2),Math.cos(radians/2)];
function mount(parent, shape, pos, size=[1,1,1], rotation=identity) {
  const n=doc.createNode(shape.getName()).setMesh(shape).setTranslation(pos).setScale(size).setRotation(rotation);
  parent.addChild(n);
  return n;
}
function group(name,pos,rotation=identity) {
  const n=doc.createNode(name).setTranslation(pos).setRotation(rotation); scene.addChild(n); return n;
}
const frame=box('Support',alloy), electronics=box('Science package',foil), panel=box('Photovoltaic cell',cells);
const cylinder=lathe('Column',alloy,[[-.5,.5],[.5,.5]]);
const feet=lathe('Foot pad',ceramic,[[0,.5],[.10,.5],[.16,.34]]);
const hull=lathe('Science module',ceramic,[[-.5,.52],[-.43,.86],[-.32,1],[.32,1],[.43,.86],[.5,.52]]);
const band=lathe('Module flange',alloy,[[-.5,.97],[-.4,1],[.4,1],[.5,.97]]);
for (const [x,z,len] of [[0,0,5],[-1.2,3,3.8]]) {
  const station=group('Surface science and operations',[x,0,z]);
  mount(station,hull,[0,1.45,0],[1,len,1],tiltZ(Math.PI/2));
  for(const offset of [-.32,.32]) {
    mount(station,band,[offset*len,1.45,0],[1.03,.12,1.03],tiltZ(Math.PI/2));
    for(const side of [-.64,.64]) mount(station,feet,[offset*len,0,side]);
    mount(station,frame,[offset*len,.35,0],[.27,.40,1.55]);
  }
  mount(station,electronics,[0,2.48,0],[1.4,.28,.65]);
}
mount(scene,cylinder,[-.9,1.4,1.55],[.96,2.0,.96],tiltX(Math.PI/2));
for(const [x,z] of [[-4.5,-2],[0,-3.4],[4.3,-2.5]]) {
  const field=group('Surface power array',[x,0,z]);
  mount(field,feet,[0,0,0],[1.65,1,1.65]);
  mount(field,cylinder,[0,1.02,0],[.16,1.85,.16]);
  const rack=doc.createNode('Inclined array frame').setTranslation([0,1.9,0]).setRotation(tiltX(-.7));
  field.addChild(rack);
  mount(rack,frame,[0,0,0],[3.5,.13,1.72]);
  for(let col=0;col<6;col++) for(let row=0;row<3;row++)
    mount(rack,panel,[(col-2.5)*.56,.085,(row-1)*.53],[.53,.05,.505]);
}
const dish=lathe('Communications reflector',ceramic,[[0,.09],[.04,.4],[.12,.69],[.28,1],[.32,1],[.17,.69],[.09,.4],[.05,.09]]);
for(const [x,z,size] of [[4.6,1.8,1], [3.6,3.7,.65]]) {
  const tower=group('Communications antenna',[x,0,z]);
  mount(tower,feet,[0,0,0],[1.4,1,1.4]);
  mount(tower,cylinder,[0,.82*size,0],[.24,1.6*size,.24]);
  const axis=doc.createNode('Antenna elevation').setTranslation([0,1.55*size,0])
    .setScale([size,size,size]).setRotation(tiltZ(-.78));
  tower.addChild(axis); mount(axis,dish,[0,0,0]); mount(axis,cylinder,[0,.36,0],[.047,.62,.047]);
  mount(axis,electronics,[0,.70,0],[.14,.18,.14]);
}
const rover=group('Mobile science',[.9,0,4.35]);
mount(rover,electronics,[0,.46,0],[1.05,.48,.69]);
const tire=lathe('Rover wheel',rubber,[[-.5,.40],[-.35,.5],[.35,.5],[.5,.40]]);
for(const x of [-.47,0,.47]) for(const z of [-.42,.42]) {
  mount(rover,tire,[x,.20,z],[.42,.15,.42],tiltX(Math.PI/2));
}
mount(rover,cylinder,[.27,.95,0],[.055,.55,.055]);
mount(rover,frame,[.27,1.23,0],[.13,.12,.31]);
await doc.transform(flatten(),join(),normals(),weld());
await new NodeIO().write(process.argv[2],doc);
