const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

const html = fs.readFileSync(process.argv[2] || 'web/template/rassvet-tracker.html', 'utf8');
function source(from, to) {
  const start = html.indexOf(from);
  const end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, from);
  return html.slice(start, end);
}

test('early script hints match the URLs and credentials used by the loader', () => {
  const tags = [...html.matchAll(/<link rel="preload" as="script" crossorigin="anonymous" href="([^"]+)">/g)];
  const libs = [...source('const LIBS=[', 'const box=').matchAll(/'(vendor\/[^']+\.js)'/g)];
  assert.deepEqual(tags.map(m => m[1]), libs.map(m => m[1]));
  assert.equal(libs.length, 3);
  assert.match(source('const load=(l,url,ms)', 'const to=setTimeout'), /crossOrigin='anonymous'/);
});

test('focusing or clearing an empty search stays local, and typing consults the deferred catalogue', () => {
  const handlers = {}, field = {value: '', addEventListener(name, fn) { handlers[name] = fn; }};
  const calls = [];
  const context = vm.createContext({
    $: () => field, window: {addEventListener(name, fn) { handlers[name] = fn; }},
    systems: [{loadFailed: false}], loadDeferredSystems: (...args) => calls.push(args), runSearch() {}
  });
  vm.runInContext(source("const sq=$('#sq');", "sq.addEventListener('blur'"), context);
  handlers.focus();
  field.value = '  '; handlers.input();
  assert.deepEqual(calls, []);
  field.value = '44714'; handlers.input();
  assert.deepEqual(calls, [[true]]);
  context.systems[0].loadFailed = true;
  handlers.online();
  assert.deepEqual(calls, [[true], [true, true]]);
});

test('a deferred catalogue remains retryable, and concurrent consumers share one request', async () => {
  const sys = {cfg: {id: 'starlink'}, enabled: false, pendingSrc: 'data-starlink.abc.json', sats: []};
  let calls = 0;
  const context = vm.createContext({
    systems: [sys], sats: [], pos: new Float64Array(), valid: new Uint8Array(),
    location: {hash: '#v=g&s=44714'}, URLSearchParams, readHash: () => { context.selectedFromHash = true; },
    fetch: async () => (++calls === 1 ? {ok: false, status: 503} : {ok: true, json: async () => ({rows: [[44714]]})}),
    whenIdle: fn => fn(), addCatalog: (group, block) => {
      const sat = {norad: block.rows[0][0]}; group.sats.push(sat); context.sats.push(sat);
    },
    console: {warn() {}, info() {}}, $: () => ({hidden: true}),
    renderSystems() {}, renderGrowth() {}, assignColors() {}, refreshCharset() {}, filtersChanged() {}, updateBanner() {}
  });
  vm.runInContext(source('async function loadDeferredSystems(', '/* видимость:'), context);
  await context.loadDeferredSystems();
  assert.equal(calls, 0);
  await context.loadDeferredSystems(true);
  assert.equal(sys.loadFailed, true);
  assert.equal(sys.pendingSrc, 'data-starlink.abc.json');
  await context.loadDeferredSystems(true);
  assert.equal(calls, 1);
  sys.enabled = true;
  await Promise.all([context.loadDeferredSystems(false, true), context.loadDeferredSystems(true)]);
  assert.equal(calls, 2);
  assert.equal(sys.sats.length, 1);
  assert.equal(sys.pendingSrc, null);
  assert.equal(sys.loadFailed, false);
  assert.equal(context.selectedFromHash, true);
});

test('light catalogue keeps the epoch distinct from publication and supports an offline retry', async () => {
  class Element {
    constructor() { this.children = []; this.value = ''; this.dataset = {}; this.classList = {remove() {}}; }
    add(item) { this.children.push(item); }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); return item; }
    replaceChildren(fragment) { this.children = fragment.children; }
    setAttribute(name, value) { this[name] = value; }
    querySelector(name) { return get(name); }
  }
  const nodes = new Map();
  function get(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }
  const cfg = {id: 'stations', name: {en: 'Stations', ru: 'Станции'}, format: 'catalog', dataKey: 'data-stations'};
  const published = '2026-11-15T16:43:32Z';
  get('registry').textContent = JSON.stringify({systems: [cfg]});
  get('data-meta').textContent = JSON.stringify({generatedAt: published});
  get('data-stations').textContent = JSON.stringify({src: 'stations.json'});
  const raw = html.match(/<script type="application\/json" id="data-stations">([\s\S]*?)<\/script>/)[1];
  const iss = JSON.parse(raw).rows.find(r => r[0] === 25544);
  const old = [...iss]; old[0] = 99; old[9] = '2000-01-01T00:00:00Z';
  const unknown = [...iss]; unknown[0] = 100; unknown[9] = null;
  let network = false;
  const context = vm.createContext({
    document: {documentElement: {lang: 'en', dataset: {}}, getElementById: get,
      createElement: () => new Element(), createDocumentFragment: () => new Element()},
    Option: class {}, window: {addEventListener() {}}, location: {hash: ''}, URLSearchParams,
    requestAnimationFrame: fn => setImmediate(fn),
    fetch: async () => ({ok: network, status: 503, json: async () => ({rows: [iss, old, unknown]})})
  });
  vm.runInContext(source('function startLiteCatalog()', '/* Загрузчик библиотек:'), context);
  context.startLiteCatalog();
  const paint = async () => { await new Promise(setImmediate); await new Promise(setImmediate); };
  await paint();
  assert.equal(get('liteRetry').hidden, false);
  network = true;
  get('liteRetry').onclick(); await paint();
  assert.equal(get('liteRetry').hidden, true);
  assert.equal(get('liteRows').children.length, 3);
  const details = get('liteRows').children.map(n => n.children[0]);
  assert.match(details[0].children[0].textContent, /ISS.*25544/);
  assert.ok(details[0].children[2].textContent.includes(new Date(iss[9]).toISOString().slice(0, 19).replace('T', ' ')+' UTC'));
  assert.match(details[1].children[2].textContent, /too old for the map/);
  assert.match(details[2].children[2].textContent, /unknown$/);
  assert.match(get('liteInfo').textContent, /Catalogue published/);
  get('liteSearch').value = '25544'; get('liteSearch').oninput();
  assert.equal(get('liteRows').children.length, 1);
  assert.equal(get('liteRows').children[0].children[0].open, true);
});
