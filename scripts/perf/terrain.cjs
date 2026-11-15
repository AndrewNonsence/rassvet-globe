#!/usr/bin/env node
// CPU-only benchmark of the actual page functions. Does not launch a browser.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const {performance} = require('node:perf_hooks');
const root = path.resolve(__dirname, '../..');
const deck = require(path.join(root, 'vendor/deck.gl@9.4.0/dist.min.js'));

function load(file) {
  const html = fs.readFileSync(file, 'utf8');
  const part = (start, end) => {
    const a = html.indexOf(start), b = html.indexOf(end, a);
    if (a < 0 || b < 0) throw new Error('Page function not found: ' + start);
    return html.slice(a, b);
  };
  const context = {deck, Math, Number, Map, Set, Float32Array, Uint32Array,
    D2R: Math.PI / 180, R2D: 180 / Math.PI, EARTH_RM: 6370972, RELIEF_EXAG: 1.6,
    mobile: false};
  vm.createContext(context);
  vm.runInContext('function isMobileGPU(){return mobile;}\n' +
    part('function unitFromLngLat(', '\nfunction earthLayers(').split('\n')[0] + '\n' +
    part('function terrainMesh(', '\n/* Загрузка тайлов') + '\n' +
    part('class NearTileset ', '\nconst NEAR_SUB=') + '\nthis.NearTileset=NearTileset;', context);
  return context;
}

function pixels(size = 256) {
  const px = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    // Deterministic rough slopes, shorelines, sub-sea samples and fractional heights.
    const height = Math.sin(x / 13) * 1900 + Math.cos(y / 19) * 1400 + x * 5 - 600;
    const encoded = Math.floor((height + 32768) * 256), i = (y * size + x) * 4;
    px[i] = encoded >>> 16; px[i + 1] = (encoded >>> 8) & 255;
    px[i + 2] = encoded & 255; px[i + 3] = 255;
  }
  return px;
}
function digest(mesh) {
  const h = crypto.createHash('sha256');
  h.update(JSON.stringify([mesh.header, mesh.mode, mesh.topology]));
  for (const a of [mesh.indices, ...Object.values(mesh.attributes)]) {
    h.update(JSON.stringify(a.size));
    h.update(Buffer.from(a.value.buffer, a.value.byteOffset, a.value.byteLength));
  }
  return h.digest('hex');
}
const meshCases = [
  {idx:{x:1265,y:750,z:11},grid:128,sink:0},
  {idx:{x:316,y:187,z:9},grid:64,sink:0},
  {idx:{x:2991,y:1294,z:12},grid:32,sink:0},
  {idx:{x:0,y:0,z:3},grid:16,sink:1500},
  {idx:{x:7,y:7,z:3},grid:32,sink:1500},
  {idx:{x:0,y:1,z:9},grid:128,sink:0},
];
const viewCases = [
  {width:1600,height:1000,longitude:42.5,latitude:43.2,zoom:9.5,pitch:55,bearing:30},
  {width:1600,height:1000,longitude:42.5,latitude:43.2,zoom:9.5,pitch:0,bearing:30},
  {width:1600,height:1000,longitude:37.6,latitude:55.75,zoom:7.5,pitch:0,bearing:0},
  {width:390,height:844,longitude:42.5,latitude:43.2,zoom:9.5,pitch:55,bearing:30,mobile:true},
  {width:1600,height:1000,longitude:179.9,latitude:71,zoom:6.5,pitch:60,bearing:-45},
];
function selection(context, config) {
  context.mobile = !!config.mobile;
  const viewport = new deck._GlobeViewport(config);
  let projections = 0;
  const project = viewport.project.bind(viewport);
  viewport.project = (...args) => { projections++; return project(...args); };
  const options = {minZoom:3,maxZoom:13,tileSize:256,zoomOffset:0};
  const tileset = new context.NearTileset(options);
  const tiles = tileset.getTileIndices({...options,viewport});
  return {keys:Array.from(tiles, t=>t.z+'/'+t.x+'/'+t.y), projections};
}
function signatures(context) {
  const px = pixels();
  return {meshes:meshCases.map(c=>digest(context.terrainMesh(px,256,c.idx,c.grid,c.sink))),
    selections:viewCases.map(c=>selection(context,c))};
}
function benchmark(context, rounds = 12) {
  const px = pixels(), c = meshCases[0], times = [];
  for (let i = 0; i < 5 + rounds; i++) {
    const start = performance.now(); context.terrainMesh(px,256,c.idx,c.grid,c.sink);
    if (i >= 5) times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);
  const start = performance.now();
  for(let k=0;k<30;k++) selection(context,viewCases[0]);
  return {mesh128MedianMs:+times[Math.floor(times.length/2)].toFixed(3),
    selectionMeanMs:+((performance.now()-start)/30).toFixed(3)};
}
module.exports = {load,pixels,digest,meshCases,viewCases,selection,signatures,benchmark};
if (require.main === module) {
  const file = process.argv[2] || path.join(root,'web/template/rassvet-tracker.html');
  const context = load(file);
  console.log(JSON.stringify({file,...benchmark(context),signatures:signatures(context)},null,2));
}
