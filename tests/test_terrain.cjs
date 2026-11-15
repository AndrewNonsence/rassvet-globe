// Preserve the exact geometry and tile selection captured from version 1.14.0.
const assert = require('node:assert/strict');
const path = require('node:path');
const perf = require('../scripts/perf/terrain.cjs');
const reference = require('./fixtures/terrain-1.14.0.json');
const page = process.argv[2] || path.join(__dirname,'../web/template/rassvet-tracker.html');
const context = perf.load(page), actual = perf.signatures(context);
assert.deepEqual(actual.meshes,reference.meshes,
  'Positions, normals, UVs, skirts and triangle indices must remain byte-identical');
assert.deepEqual(actual.selections.map(s=>s.keys),reference.selections.map(s=>s.keys),
  'Selected tile keys and order must remain identical, including poles and the date line');
assert.ok(actual.selections[0].projections <= 400,
  `Shared corners must not be projected repeatedly (${actual.selections[0].projections} calls)`);
// Each viewport must get fresh projections; no cross-camera cache may change selection.
assert.deepEqual(perf.selection(context,perf.viewCases[0]).keys,reference.selections[0].keys);
console.log('Terrain bytes, tile selection and projection budget passed');
