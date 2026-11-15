// Exercise the real page functions with a short pass between coarse samples.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(process.argv[2] || 'web/template/rassvet-tracker.html', 'utf8');
function source(name) {
  const match = html.match(new RegExp('(?:async )?function ' + name + '\\([^]*?(?=\\n(?:async )?function |\\n/\\*|\\nconst [A-Z_]+|$)'));
  assert.ok(match, name + ' must exist in the page');
  return match[0];
}
const context = {Uint16Array, Date, Number, Math, performance, setTimeout,
  COVER_STEP: 300000, COVER_N: 288,
  lookAt: (s, ms) => ({el: s.visible(ms) ? 40 : 0}),
  satrecOf: s => s.elem ? {} : null,
  STALE_DAYS: 7, DAY: 86400000};
vm.createContext(context);
vm.runInContext(['ageDays', 'setElements', 'coverageSummary', 'sampleCoverage', 'canPredictOrbit', 'findPasses', 'computeCover', 'computeCompare'].map(source).join('\n'), context);
(async () => {
  const list = [{visible: ms => ms >= 300000 && ms < 600000}];
  const a = await context.sampleCoverage(list, 0, {}, 25, () => false);
  const b = await context.sampleCoverage(list, 0, {}, 25, () => false);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.equal(a[1], 1, 'five-minute pass must not disappear between ten-minute samples');
  assert.deepEqual(context.coverageSummary(a, 300000), context.coverageSummary(b, 300000));
  assert.equal(await context.sampleCoverage(list, 0, {}, 25, () => true), null);
  assert.equal(context.canPredictOrbit({elem:{}, epochMs:Date.now()-8*86400000}), false);
  assert.equal(context.findPasses({elem:{},epochMs:Date.now()-8*86400000},Date.now(),{},3).kind,'stale');
  context.PW={w:null}; context.MAX_PLOT_DAYS=30;
  const historical={epoch:new Date(Date.now()-40*86400000).toISOString()}, oldSatellite={};
  context.setElements(oldSatellite,historical);
  assert.equal(oldSatellite.elem,null);
  assert.equal(oldSatellite.lastElements,historical);
  assert.equal(oldSatellite.epochMs,Date.parse(historical.epoch));
  assert.equal(context.canPredictOrbit({elem:{}, epochMs:Date.now()-86400000}), true);
  const recent = {elem:{}, epochMs:Date.now()-86400000, visible:ms => ms%600000<300000};
  context.systems = ['rassvet','oneweb','starlink'].map(id => ({cfg:{id},sats:[recent]}));
  context.CMP_SYS = ['rassvet','oneweb','starlink'];
  context.SKY = {obs:{},cmpTok:0,covTok:0};
  context.S = {time:{sim:Date.now()},elev:25};
  context.rassvetSys = () => context.systems[0];
  context.obsGd = () => ({});
  context.renderCover = context.renderCompare = () => {};
  await context.computeCompare();
  const summary = context.coverageSummary(context.SKY.cover.cnt, context.SKY.cover.step);
  assert.equal(context.SKY.cmp.rows[0].gap, summary.gap, 'both actual UI pipelines must agree');
  assert.equal(context.SKY.cmp.rows[0].any, summary.any);
  assert.equal(context.SKY.cmp.t0, context.SKY.cover.t0);
  assert.equal(context.coverageSummary(new Uint16Array(288),300000).gap,86400000);
  await context.computeCover();
  assert.equal(context.SKY.cmp, null, 'a new forecast must invalidate the old comparison');
  console.log('Coverage, cancellation and ageing checks passed');
})().catch(error => { console.error(error); process.exitCode=1; });
