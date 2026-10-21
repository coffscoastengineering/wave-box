import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { partOptions, groupedPartOptions, selectParts, TIERS } from '../src/ui/view-model.js';

const { parts } = buildBox(validate({}).params);

test('partOptions lists every drawable part once, dowel excluded', () => {
  const opts = partOptions(parts);
  const drawable = parts.filter((p) => p.loops.length);
  assert.equal(opts.length, drawable.length);
  assert.ok(!opts.some((o) => o.id === 'dowel'));
  assert.ok(opts.every((o) => o.label.includes(o.id === 'sides.walnut' ? 'Side' : '')));
});

test('partOptions labels show quantity for parts cut more than once', () => {
  const opts = partOptions(parts);
  const walnut = opts.find((o) => o.id === 'sides.walnut');
  assert.match(walnut.label, /×2/);
  const floor = opts.find((o) => o.id === 'bottom.floor');
  assert.doesNotMatch(floor.label, /×/);
});

test('groupedPartOptions groups by tier in box order, sides last', () => {
  const groups = groupedPartOptions(parts);
  assert.deepEqual(groups.map((g) => g.group), ['Bottom tier', 'Middle tier', 'Top tier', 'Outer sides']);
  assert.deepEqual(groups.map((g) => g.tier), ['bottom', 'middle', 'top', 'sides']);
  const total = groups.reduce((n, g) => n + g.options.length, 0);
  assert.equal(total, partOptions(parts).length);
});

test('TIERS lists tabs in box order with labels matching groupedPartOptions', () => {
  assert.deepEqual(TIERS.map((t) => t.tier), ['bottom', 'middle', 'top', 'sides']);
  const labelByTier = Object.fromEntries(groupedPartOptions(parts).map((g) => [g.tier, g.group]));
  for (const t of TIERS) assert.equal(t.label, labelByTier[t.tier]);
});

test('groupedPartOptions options match partOptions labels for that part', () => {
  const flat = Object.fromEntries(partOptions(parts).map((o) => [o.id, o.label]));
  for (const g of groupedPartOptions(parts)) for (const o of g.options) assert.equal(o.label, flat[o.id]);
});

test('selectParts with empty id returns every drawable part', () => {
  const sel = selectParts(parts, '');
  assert.equal(sel.length, parts.filter((p) => p.loops.length).length);
});

test('selectParts with an id returns only that part', () => {
  const sel = selectParts(parts, 'bottom.wall');
  assert.equal(sel.length, 1);
  assert.equal(sel[0].id, 'bottom.wall');
});

const assemblyCount = parts.filter((p) => p.loops.length).length;

test('selectParts with an id no longer present falls back to the full assembly', () => {
  const sel = selectParts(parts, 'not.a.real.part');
  assert.equal(sel.length, assemblyCount);
});

test('selectParts with a tier: key returns only that tier\'s parts', () => {
  const sel = selectParts(parts, 'tier:bottom');
  assert.ok(sel.length > 1);
  assert.ok(sel.every((p) => p.tier === 'bottom'));
});

test('selectParts with an unknown tier: key falls back to the full assembly', () => {
  const sel = selectParts(parts, 'tier:nonexistent');
  assert.equal(sel.length, assemblyCount);
});

test('no separate drilling-guide plan parts are exposed in the preview selector', () => {
  assert.ok(!parts.some((p) => p.kind === 'plan'));
});
