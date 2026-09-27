import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { cutList, assemblySteps } from '../src/cutlist.js';
import { toPDF } from '../src/export-pdf.js';

const make = (raw = {}) => {
  const { params } = validate(raw);
  return { params, result: buildBox(params) };
};

test('cut list has a row for every part with its quantity', () => {
  const { result } = make();
  const rows = cutList(result.parts, 'mm');
  assert.deepEqual(rows.map((r) => r.id).sort(), result.parts.map((p) => p.id).sort());
  assert.equal(rows.find((r) => r.id === 'sides.walnut').qty, 2);
  assert.equal(rows.find((r) => r.id === 'dowel').qty, 3);
});

test('curved parts get a block size with allowance', () => {
  const { result } = make();
  const wall = cutList(result.parts, 'mm').find((r) => r.id === 'bottom.wall');
  assert.ok(wall.block && /^288 × [\d.]+ × [\d.]+ mm$/.test(wall.block), wall.block);
});

test('cut list in inches uses inch marks', () => {
  const { result } = make({ units: 'in' });
  const rows = cutList(result.parts, 'in');
  assert.ok(rows.every((r) => r.finished.includes('"')), rows.map((r) => r.finished).join(' | '));
});

test('assembly steps mention the stand-off gap', () => {
  const { params } = make({ gap: 12 });
  assert.ok(assemblySteps(params).some((s) => s.includes('12 mm')));
});

const pageMM = (doc, i) => {
  doc.setPage(i);
  return [doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()];
};

test('A4 pdf pages are exactly A4 and there is a 100 mm scale square', () => {
  const { params, result } = make();
  const doc = toPDF(result, params, { compress: false });
  const n = doc.getNumberOfPages();
  assert.ok(n >= 3, `pages ${n}`);
  for (let i = 1; i <= n; i++) {
    const [w, h] = pageMM(doc, i);
    assert.ok(Math.abs(w - 210) < 0.01 && Math.abs(h - 297) < 0.01, `page ${i}: ${w}×${h}`);
  }
  assert.match(doc.output(), / 283\.4645\d* -283\.4645\d* re/);
});

test('Letter pdf uses letter pages and a 4 inch square in inch mode', () => {
  const { params, result } = make({ paper: 'Letter', units: 'in' });
  const doc = toPDF(result, params, { compress: false });
  const [w, h] = pageMM(doc, 1);
  assert.ok(Math.abs(w - 215.9) < 0.01 && Math.abs(h - 279.4) < 0.01);
  assert.match(doc.output(), / 288(\.0*)? -288(\.0*)? re/);
});

test('pdf is compressed by default', () => {
  const { params, result } = make();
  const small = toPDF(result, params).output('arraybuffer').byteLength;
  const big = toPDF(result, params, { compress: false }).output('arraybuffer').byteLength;
  assert.ok(small < big / 2, `compressed ${small} vs raw ${big}`);
});

test('warnings appear in the pdf', () => {
  const { params, result } = make({ H: 150, D: 750, carcass: 25, drawer: 25 });
  assert.ok(result.warnings.length);
  const text = toPDF(result, params, { compress: false }).output();
  assert.ok(text.includes(result.warnings[0].slice(0, 30)), result.warnings[0]);
});
