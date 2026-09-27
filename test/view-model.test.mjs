import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { partOptions, selectParts } from '../src/ui/view-model.js';

const { parts } = buildBox(validate({}).params);

test('partOptions lists every drawable part once, dowel excluded', () => {
  const opts = partOptions(parts);
  const drawable = parts.filter((p) => p.loops.length);
  assert.equal(opts.length, drawable.length);
  assert.ok(!opts.some((o) => o.id === 'dowel'));
  assert.ok(opts.every((o) => o.label.includes(o.id === 'sides.walnut' ? 'Walnut' : '')));
});

test('partOptions labels show quantity for parts cut more than once', () => {
  const opts = partOptions(parts);
  const walnut = opts.find((o) => o.id === 'sides.walnut');
  assert.match(walnut.label, /×2/);
  const floor = opts.find((o) => o.id === 'bottom.floor');
  assert.doesNotMatch(floor.label, /×/);
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

test('selectParts with an id no longer present falls back to the full assembly', () => {
  const sel = selectParts(parts, 'not.a.real.part');
  assert.equal(sel.length, parts.filter((p) => p.loops.length).length);
});
