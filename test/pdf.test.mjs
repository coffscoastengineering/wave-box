import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { cutList, assemblySteps } from '../src/cutlist.js';
import { instructionsPDF, printableTemplateParts, templatePageCount, toPDF } from '../src/export-pdf.js';
import { templateLabelLines, partCode as partCodeOf } from '../src/labels.js';

const make = (raw = {}) => {
  const { params } = validate(raw);
  return { params, result: buildBox(params) };
};

test('cut list has a row for every part with its quantity', () => {
  const { result } = make();
  const rows = cutList(result.parts);
  assert.deepEqual(rows.map((r) => r.id).sort(), result.parts.map((p) => p.id).sort());
  assert.equal(rows.find((r) => r.id === 'sides.walnut').qty, 2);
  assert.equal(rows.find((r) => r.id === 'dowel').qty, 10);
});

test('curved parts get a block size with allowance', () => {
  const { result } = make();
  const wall = cutList(result.parts).find((r) => r.id === 'bottom.wall');
  assert.ok(wall.block && /^288 × [\d.]+ × [\d.]+ mm$/.test(wall.block), wall.block);
});

test('cut list sizes are all in millimetres (drilling guides have no finished size)', () => {
  const { result } = make();
  const rows = cutList(result.parts);
  assert.ok(rows.every((r) => r.finished === '—' || (/ mm$/.test(r.finished) && !r.finished.includes('"'))), rows.map((r) => r.finished).join(' | '));
  assert.ok(rows.every((r) => r.finished !== '—' || r.notes.includes('Drilling guide')));
});

test('assembly steps mention the stand-off gap', () => {
  const { params } = make({ gap: 12 });
  assert.ok(assemblySteps(params).some((s) => s.includes('12 mm')));
});

const pageMM = (doc, i) => {
  doc.setPage(i);
  return [doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight()];
};

test('A4 template pdf pages are exactly A4 and contain only template sheets', () => {
  const { params, result } = make({ paper: 'A4' });
  const doc = toPDF(result, params, { compress: false });
  const text = doc.output();
  const n = doc.getNumberOfPages();
  assert.ok(n >= 3, `pages ${n}`);
  for (let i = 1; i <= n; i++) {
    const [w, h] = pageMM(doc, i);
    assert.ok(Math.abs(w - 210) < 0.01 && Math.abs(h - 297) < 0.01, `page ${i}: ${w}×${h}`);
  }
  assert.ok(text.includes('A1'));
  assert.ok(!text.includes('cutting templates'));
  assert.ok(!text.includes('100 mm'));
});

test('A3 and A2 pages are the right size, and Letter/unknown paper falls back to A4', () => {
  const { result } = make();
  const sizes = { A3: [297, 420], A2: [420, 594], A4: [210, 297] };
  for (const [paper, [w, h]] of Object.entries(sizes)) {
    const { params } = validate({ paper });
    const [pw, ph] = pageMM(toPDF(result, params, { compress: false }), 1);
    assert.ok(Math.abs(pw - w) < 0.01 && Math.abs(ph - h) < 0.01, `${paper}: ${pw}×${ph}`);
  }
  assert.equal(validate({ paper: 'Tabloid' }).params.paper, 'A4');
});

test('explicit landscape uses landscape page size, auto chooses the smallest count', () => {
  const { result } = make();
  const landscape = toPDF(result, validate({ paper: 'A4', orientation: 'landscape' }).params, { compress: false });
  const [lw, lh] = pageMM(landscape, 1);
  assert.ok(lw > lh, `landscape page should be wider than tall: ${lw}Ã—${lh}`);

  for (const paper of ['A4', 'A3', 'A2']) {
    const auto = toPDF(result, validate({ paper, orientation: 'auto' }).params, { compress: false }).getNumberOfPages();
    const portrait = toPDF(result, validate({ paper, orientation: 'portrait' }).params, { compress: false }).getNumberOfPages();
    const land = toPDF(result, validate({ paper, orientation: 'landscape' }).params, { compress: false }).getNumberOfPages();
    assert.equal(auto, Math.min(portrait, land), `${paper}: auto ${auto}, portrait ${portrait}, landscape ${land}`);
  }
});

test('template pages include in-part codes and inter-tier drill labels', () => {
  const { result } = make();
  const text = toPDF(result, validate({ paper: 'A4', orientation: 'portrait' }).params, { compress: false }).output();
  assert.ok(text.includes('B-END'));
  assert.ok(text.includes('INTER-TIER'));
  assert.ok(text.includes('qty 2'));
  assert.ok(text.includes('5 mm overlap'));
  assert.ok(!text.includes('Assembly'));
  assert.ok(!text.includes('Cut list'));
});

test('instructions-only pdf contains assembly steps without template pages', () => {
  const { params, result } = make();
  const doc = instructionsPDF(result, params, { compress: false });
  const text = doc.output();
  assert.ok(text.includes('instructions'));
  assert.ok(text.includes('Cut list'));
  assert.ok(text.includes('INTER-TIER'));
  assert.ok(!text.includes('Template page A1'));
  assert.ok(doc.getNumberOfPages() >= 1);
});

test('printable templates collapse physically identical parts and sum their quantity', () => {
  const { result } = make();
  const floor = result.parts.find((p) => p.id === 'bottom.floor');
  const duplicate = {
    ...floor,
    id: 'copy.floor',
    name: 'Copy floor',
    loops: floor.loops.map((loop) => loop.map(([z, y]) => [z + 100, y + 200])),
    holes: floor.holes.map((h) => ({ ...h, z: h.z + 100, y: h.y + 200 })),
  };
  const templates = printableTemplateParts([floor, duplicate]);
  assert.equal(templates.length, 1);
  assert.equal(templates[0].qty, 2);
  assert.match(templateLabelLines(templates[0]).join(' '), /qty 2/);
});

test('template labels only show qty when an identical template represents more than one part', () => {
  const { result } = make();
  const lid = printableTemplateParts(result.parts).find((p) => p.id === 'top.lid');
  assert.ok(lid);
  assert.ok(!templateLabelLines(lid).join(' ').includes('qty 1'));
});

test('A2 needs fewer template pages than A4 for the same box', () => {
  const { result } = make();
  const a4 = toPDF(result, validate({ paper: 'A4' }).params, { compress: false }).getNumberOfPages();
  const a2 = toPDF(result, validate({ paper: 'A2' }).params, { compress: false }).getNumberOfPages();
  assert.ok(a2 < a4, `A2 pages ${a2} should be fewer than A4 pages ${a4}`);
});

test('the optimized template packer stays within the expected page counts', () => {
  const { result } = make();
  const expected = { A4: 11, A3: 6, A2: 3 };
  for (const [paper, shelfPages] of Object.entries(expected)) {
    const pages = toPDF(result, validate({ paper }).params, { compress: false }).getNumberOfPages();
    assert.ok(pages <= shelfPages, `${paper}: ${pages} pages exceeds optimized target (${shelfPages})`);
  }
  const a3 = toPDF(result, validate({ paper: 'A3' }).params, { compress: false }).getNumberOfPages();
  assert.ok(a3 < 14, `expected A3 to improve on the row-shelf baseline (14), got ${a3}`);
});

test('pdf is compressed by default', () => {
  const { params, result } = make();
  const small = toPDF(result, params).output('arraybuffer').byteLength;
  const big = toPDF(result, params, { compress: false }).output('arraybuffer').byteLength;
  assert.ok(small < big / 2, `compressed ${small} vs raw ${big}`);
});

test('template pdf omits warnings and stays template-only', () => {
  const { params, result } = make({ H: 150, D: 750, carcass: 25, drawer: 25 });
  assert.ok(result.warnings.length);
  const text = toPDF(result, params, { compress: false }).output();
  assert.ok(!text.includes(result.warnings[0].slice(0, 30)), result.warnings[0]);
  assert.ok(text.includes('A1'));
});

test("templatePageCount matches the pages toPDF actually produces", () => {
  const { params, result } = make();
  for (const paper of ["A4", "A3", "A2"]) for (const orientation of ["auto", "portrait", "landscape"]) {
    const p = { ...params, paper, orientation };
    assert.equal(templatePageCount(result, p), toPDF(result, p, { compress: false }).getNumberOfPages(), paper + " " + orientation);
  }
});

test("instructions pdf lists generator warnings; clean boxes have none", () => {
  const risky = make({ H: 150, D: 190, W: 120 });
  assert.ok(risky.result.warnings.length > 0);
  assert.ok(instructionsPDF(risky.result, risky.params, { compress: false }).output().includes("Check before cutting"));
  const clean = make();
  assert.ok(!instructionsPDF(clean.result, clean.params, { compress: false }).output().includes("Check before cutting"));
});

test("every printable template carries a part code somewhere in the pdf", () => {
  for (const raw of [{}, { H: 200, D: 250, W: 150 }]) {
    const { params, result } = make(raw);
    const text = toPDF(result, params, { compress: false }).output();
    const missing = printableTemplateParts(result.parts).map(partCodeOf).filter((code) => !text.includes("(" + code));
    assert.deepEqual(missing, [], JSON.stringify(raw));
  }
});

test('lid cut-list row flags the modelled nose overlap at design size only', () => {
  const lidNotes = (raw) => { const { result } = make(raw); return cutList(result.parts).find((r) => r.id === 'top.lid').notes; };
  assert.match(lidNotes({ H: 299.8 }), /lid nose dips into the top floor/);
  assert.doesNotMatch(lidNotes({ H: 450, D: 560 }), /lid nose/);
});

test('every dowel hole carries a pocket depth that adds up to the hardware length', () => {
  const { result } = make({ H: 299.8 });
  const byId = Object.fromEntries(result.parts.map((p) => [p.id, p]));
  const depths = (p) => [...new Set(p.holes.map((h) => h.depth))];
  assert.deepEqual(depths(byId['sides.walnut']), [4]);
  assert.deepEqual(depths(byId['bottom.ends']), [2]);
  for (const id of ['bottom.top', 'middle.floor', 'middle.top', 'top.floor']) assert.deepEqual(depths(byId[id]), [2], id);
  const gap = 10;
  assert.equal(2 + gap + 4, byId.dowel.length);
  assert.equal(2 + gap + 2, byId.interTierDowel.length);
  const rows = cutList(result.parts);
  assert.match(rows.find((r) => r.id === 'sides.walnut').notes, /Recess 5× Ø20 × 4 mm deep/);
  assert.match(rows.find((r) => r.id === 'middle.floor').notes, /Recess 4× Ø20 × 2 mm deep/);
});

test('generated (non-model) drawer outlines are flagged in the cut list; exact ones are not', () => {
  const note = (raw, id) => { const { result } = make(raw); return cutList(result.parts).find((r) => r.id === id).notes; };
  assert.doesNotMatch(note({ H: 299.8 }, 'middle.drawerSide'), /Generated outline/);
  assert.match(note({ H: 450, D: 560 }, 'middle.drawerSide'), /Generated outline/);
  assert.match(note({ H: 450, D: 560 }, 'top.lid'), /Generated outline/);
});
