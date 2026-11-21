const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const {createHash} = require('node:crypto');

const html = fs.readFileSync(process.argv[2] || 'web/template/rassvet-tracker.html', 'utf8');
const loadModel = html.match(/async function openPartsModel\(s, om\)\{[\s\S]*?\n\}/)[0];

test('ROS project metadata matches its four named GLB roots and cache revision', () => {
  const source = html.match(/function rosProject\(lang\)\{[\s\S]*?\n\}/)[0];
  const project = vm.runInNewContext('(' + source + ')')('ru');
  const glb = fs.readFileSync(project.file);
  const json = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const roots = json.scenes[json.scene ?? 0].nodes.map(i => json.nodes[i].name);
  assert.deepEqual(roots.sort(), Array.from(project.parts, p => 'part:' + p.id).sort());
  assert.equal(roots.length, 4);
  assert.equal(project.rev, createHash('sha256').update(glb).digest('hex').slice(0, 10));
});

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
