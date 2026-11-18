const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(process.argv[2] || 'web/template/rassvet-tracker.html', 'utf8');
const loadModel = html.match(/async function openPartsModel\(s, om\)\{[\s\S]*?\n\}/)[0];

function modelWindow() {
  let resolve, reject;
  const transfer = new Promise((yes, no) => { resolve = yes; reject = no; });
  const dialog = {open: true};
  const displayed = [];
  const run = vm.runInNewContext('(' + loadModel + ')', {
    m3dShell: () => dialog,
    $: () => ({classList: {add() {}, remove() {}}}),
    loadPartsGlb: () => transfer,
    esc: String, t: String, cfgT: () => '', modelUrl: () => 'test.glb',
    withGeometry: parts => parts,
    startParts: () => displayed.push('model'),
    openModel: () => displayed.push('schematic'),
    console: {warn() {}},
  });
  return {dialog, displayed, resolve, reject, complete: run({}, {})};
}

test('a dismissed model stays closed after a late GLB success or failure', async () => {
  for (const finish of ['resolve', 'reject']) {
    const previous = modelWindow();
    previous.dialog.open = false;
    const reopened = modelWindow();
    previous[finish]([]);
    await previous.complete;
    assert.deepEqual(previous.displayed, []);
    reopened.resolve([]);
    await reopened.complete;
    assert.deepEqual(reopened.displayed, ['model']);
  }
});

test('a GLB failure still offers the schematic in the open dialog', async () => {
  const active = modelWindow();
  active.reject(new Error('offline'));
  await active.complete;
  assert.deepEqual(active.displayed, ['schematic']);
});
