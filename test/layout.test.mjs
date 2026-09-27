import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { layout, placePoint } from '../src/layout.js';
import { labelLines } from '../src/labels.js';

const { parts } = buildBox(validate({}).params);
const drawable = parts.filter((p) => p.loops.length);

test('walnut part carries dowel holes as circles, not polygon cut-outs', () => {
  const w = parts.find((p) => p.id === 'sides.walnut');
  assert.equal(w.holes.length, 3);
  assert.equal(w.loops.length, 1);
});

test('layout places every drawable part once without overlap', () => {
  const L = layout(drawable, { gap: 15, maxWidth: 600, labelH: 20 });
  assert.equal(L.items.length, drawable.length);
  const boxes = L.items.map((it) => ({ x0: it.dz, y0: it.dy, x1: it.dz + it.w, y1: it.dy + it.h }));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const apart = a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0;
    assert.ok(apart, `${L.items[i].part.id} overlaps ${L.items[j].part.id}`);
  }
  assert.ok(L.width <= 600 + 1e-6);
  for (const it of L.items) for (const l of it.part.loops) for (const p of l) {
    const [x, y] = placePoint(p, it);
    assert.ok(x >= it.dz - 1e-6 && x <= it.dz + it.w + 1e-6 && y >= it.dy + 20 - 1e-6 && y <= it.dy + it.h + 1e-6);
  }
});

test('labels are in millimetres', () => {
  const floor = parts.find((p) => p.id === 'bottom.floor');
  assert.ok(labelLines(floor).join(' ').includes('288 mm'));
  const wall = parts.find((p) => p.id === 'bottom.wall');
  assert.ok(labelLines(wall).join(' ').toLowerCase().includes('block'));
  for (const p of drawable) assert.ok(!/"/.test(labelLines(p).join(' ')), p.id);
});

test('layout reserves label width so labels cannot overprint neighbours', () => {
  const L = layout(drawable, { gap: 15, maxWidth: 600, labelH: 20, labelW: () => 150 });
  for (const it of L.items) assert.ok(it.w >= 150, `${it.part.id} width ${it.w}`);
  for (let i = 0; i < L.items.length; i++) for (let j = i + 1; j < L.items.length; j++) {
    const a = L.items[i], b = L.items[j];
    assert.ok(a.dz + a.w <= b.dz || b.dz + b.w <= a.dz || a.dy + a.h <= b.dy || b.dy + b.h <= a.dy, `${a.part.id} x ${b.part.id}`);
  }
});

test('curved part label is short and carries the block size', () => {
  const wall = parts.find((p) => p.id === 'bottom.wall');
  const text = labelLines(wall).join(' ');
  assert.match(text, /block 288 × [\d.]+ × [\d.]+ mm/i);
  assert.ok(Math.max(...labelLines(wall).map((l) => l.length)) <= 60);
});
