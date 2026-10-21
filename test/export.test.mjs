import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { toSVG, byTimber } from '../src/export-svg.js';
import { toDXF } from '../src/export-dxf.js';

const { params } = validate({});
const { parts } = buildBox(params);
const drawable = parts.filter((p) => p.loops.length);
const loopCount = drawable.reduce((n, p) => n + p.loops.length, 0);
// Plan-face drill marks use (length, depth) coords and belong to the PDF templates only.
const planHoles = drawable.reduce((n, p) => n + p.holes.filter((h) => h.face === 'plan').length, 0);
const holeCount = drawable.reduce((n, p) => n + p.holes.length, 0) - planHoles;

test('byTimber groups drawable timber and cut-list dowels', () => {
  const g = byTimber(parts);
  assert.equal(g.walnut.length, 1);
  assert.ok(g.carcass.length > 0);
  assert.ok(g.drawer.length > 0);
  assert.equal(g.dowel.length, 2);
});

test('SVG export contains millimetre sheet size, cut paths, holes and labels', () => {
  const svg = toSVG(parts, { title: 'Test templates' });
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /width="[\d.]+mm"/);
  assert.match(svg, /<g id="cut">/);
  assert.equal((svg.match(/<path /g) ?? []).length, loopCount);
  assert.equal((svg.match(/<circle /g) ?? []).length, holeCount);
  assert.match(svg, /Bottom tier/);
});

test('DXF export is R12, millimetre units, closed polylines with circles and labels', () => {
  const dxf = toDXF(parts);
  assert.ok(dxf.startsWith('0\nSECTION'));
  assert.ok(dxf.endsWith('0\nEOF'));
  assert.match(dxf, /\$INSUNITS\n70\n4/);
  assert.equal((dxf.match(/\nPOLYLINE\n/g) ?? []).length, loopCount);
  assert.equal((dxf.match(/\nCIRCLE\n/g) ?? []).length, holeCount);
  assert.equal((dxf.match(/\nTEXT\n/g) ?? []).length >= drawable.length, true);
  for (const block of dxf.split('0\nPOLYLINE\n').slice(1)) {
    assert.match(block.slice(0, 60), /70\n1/);
  }
});

test('SVG and DXF omit plan-face drill marks', () => {
  assert.ok(planHoles > 0);
});
