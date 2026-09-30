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
  const rows = cutList(result.parts);
  assert.deepEqual(rows.map((r) => r.id).sort(), result.parts.map((p) => p.id).sort());
  assert.equal(rows.find((r) => r.id === 'sides.walnut').qty, 2);
  assert.equal(rows.find((r) => r.id === 'dowel').qty, 5);
});

test('curved parts get a block size with allowance', () => {
  const { result } = make();
  const wall = cutList(result.parts).find((r) => r.id === 'bottom.wall');
  assert.ok(wall.block && /^288 × [\d.]+ × [\d.]+ mm$/.test(wall.block), wall.block);
});

test('cut list sizes are all in millimetres', () => {
  const { result } = make();
  const rows = cutList(result.parts);
  assert.ok(rows.every((r) => / mm$/.test(r.finished) && !r.finished.includes('"')), rows.map((r) => r.finished).join(' | '));
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

test('A3 and A2 pages are the right size, and Letter/unknown paper falls back to A4', () => {
  const { result } = make();
  const sizes = { A3: [297, 420], A2: [420, 594], A4: [210, 297], Letter: [210, 297], Tabloid: [210, 297] };
  for (const [paper, [w, h]] of Object.entries(sizes)) {
    const { params } = validate({ paper });
    const [pw, ph] = pageMM(toPDF(result, params, { compress: false }), 1);
    assert.ok(Math.abs(pw - w) < 0.01 && Math.abs(ph - h) < 0.01, `${paper}: ${pw}×${ph}`);
  }
  assert.equal(validate({ paper: 'Tabloid' }).params.paper, 'A4');
});

test('A2 needs fewer template pages than A4 for the same box', () => {
  const { result } = make();
  const a4 = toPDF(result, validate({ paper: 'A4' }).params, { compress: false }).getNumberOfPages();
  const a2 = toPDF(result, validate({ paper: 'A2' }).params, { compress: false }).getNumberOfPages();
  assert.ok(a2 < a4, `A2 pages ${a2} should be fewer than A4 pages ${a4}`);
});

test('the hybrid packer never needs more pages than the old row-shelf packer, and needs fewer for A3/A2', () => {
  const { result } = make();
  // Row-shelf-only page counts at default size, recorded before the hybrid packer existed.
  const baseline = { A4: 18, A3: 9, A2: 8 };
  for (const [paper, shelfPages] of Object.entries(baseline)) {
    const pages = toPDF(result, validate({ paper }).params, { compress: false }).getNumberOfPages();
    assert.ok(pages <= shelfPages, `${paper}: ${pages} pages worse than row-shelf baseline (${shelfPages})`);
  }
  const a3 = toPDF(result, validate({ paper: 'A3' }).params, { compress: false }).getNumberOfPages();
  const a2 = toPDF(result, validate({ paper: 'A2' }).params, { compress: false }).getNumberOfPages();
  assert.ok(a3 < 9, `expected A3 to improve on the row-shelf baseline (9), got ${a3}`);
  assert.ok(a2 < 8, `expected A2 to improve on the row-shelf baseline (8), got ${a2}`);
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
