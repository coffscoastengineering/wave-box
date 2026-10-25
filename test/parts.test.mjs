import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { MASTER } from '../src/master-data.js';
import { hausdorff, toPaths, inter, offset, areaOf } from '../src/geom.js';
import { cutList } from '../src/cutlist.js';

const sections = JSON.parse(fs.readFileSync(new URL('../reference/fusion-sections.json', import.meta.url)));
const refLoop = (ref) => {
  const [path, body = 'Body1'] = ref.split('#');
  const s = sections.find((q) => q.path === path && q.body === body);
  assert.ok(s, `no reference section ${ref}`);
  return s.loops[0].pts.map(([z, y]) => [z + MASTER.zShift, y]);
};
const design = () => buildBox(validate({ H: 299.8, D: 375, W: 300 }).params);

test('design size: every part matches its Fusion section', () => {
  const { parts } = design();
  const withRef = parts.filter((p) => p.ref);
  assert.ok(withRef.length >= 20, `only ${withRef.length} parts carry refs`);
  const bad = [];
  for (const p of withRef) {
    const d = hausdorff(p.loops[0], refLoop(p.ref));
    if (d > 0.5) bad.push(`${p.id}: ${d.toFixed(2)} mm`);
  }
  assert.deepEqual(bad, []);
});

test('design size: part lengths along width', () => {
  const byId = Object.fromEntries(design().parts.map((p) => [p.id, p]));
  assert.equal(byId['bottom.floor'].length, 288);
  assert.equal(byId['bottom.wall'].length, 288);
  assert.equal(byId['bottom.drawerFront'].length, 285);
  assert.equal(byId['top.lid'].length, 285);
  assert.equal(byId['bottom.drawerBack'].length, 275);
  assert.equal(byId['bottom.drawerBottom'].length, 275);
  assert.equal(byId['bottom.drawerSide'].qty, 2);
  assert.equal(byId['sides.walnut'].qty, 2);
  assert.equal(byId['dowel'].length, 16);
  assert.equal(byId['dowel'].qty, 10);
  assert.equal(byId['interTierDowel'].length, 14);
});

function overlaps(parts) {
  // kind:'plan' parts are printable drilling-guide diagrams, not real 3D geometry — they
  // reuse the board's own x-range/coordinates on purpose and are never physically present.
  const solid = parts.filter((p) => p.loops.length && p.kind !== 'plan');
  const hits = [];
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    const xo = Math.min(a.x[1], b.x[1]) - Math.max(a.x[0], b.x[0]);
    if (xo <= 0.01) continue;
    const ov = areaOf(inter(toPaths(a.loops), toPaths(b.loops)));
    if (ov > 1) hits.push(`${a.id} x ${b.id}: ${ov.toFixed(1)} mm²`);
  }
  return hits;
}

// The model's own lid nose dips 24 mm² into the top floor's front corner (Fusion confirms a
// 6.9 cm³ interference), and the design-size lid is the model's exact outline, so allow just that.
test('design size: no parts collide (except the model lid nose into the top floor)', () => {
  const hits = overlaps(design().parts).filter((h) => !(h.startsWith('top.floor x top.lid:') && parseFloat(h.split(': ')[1]) <= 25));
  assert.deepEqual(hits, []);
});

test('overall size reflects the real box, not the drilling guides\' length/depth coordinates', () => {
  for (const [H, D] of [[150, 190], [600, 750], [300, 375], [220, 300]]) {
    const { overall } = buildBox(validate({ H, D }).params);
    assert.ok(Math.abs(overall.H - H) < 5, `H${H} D${D}: overall.H ${overall.H.toFixed(1)} far from ${H}`);
    assert.ok(Math.abs(overall.D - D) < 5, `H${H} D${D}: overall.D ${overall.D.toFixed(1)} far from ${D}`);
  }
});

const measuredThickness = (p, t) => {
  const P = toPaths(p.loops);
  return offset(P, -(t / 2 - 0.1)).length > 0 && offset(P, -(t / 2 + 0.1)).length === 0;
};

const SIZES = [[180, 225], [450, 560], [300, 600], [450, 250]];
const THK = [{ walnut: 4, carcass: 4, drawer: 3 }, { walnut: 12, carcass: 12, drawer: 8 }];
for (const [H, D] of SIZES) for (const t of THK) {
  test(`fit H${H} D${D} carcass ${t.carcass} drawer ${t.drawer}`, () => {
    const { parts, warnings } = buildBox(validate({ H, D, W: 300, ...t }).params);
    assert.ok(Array.isArray(warnings) && warnings.every((w) => typeof w === 'string'));
    for (const p of parts) for (const l of p.loops) for (const [z, y] of l) assert.ok(Number.isFinite(z) && Number.isFinite(y), p.id);
    assert.deepEqual(overlaps(parts), []);
    for (const p of parts.filter((q) => ['wall', 'floor', 'top'].some((k) => q.id.endsWith('.' + k)))) {
      assert.ok(measuredThickness(p, t.carcass), `${p.id} not ${t.carcass} thick`);
    }
    for (const p of parts.filter((q) => /drawer(Front|Back|Bottom)$|lid$/.test(q.id))) {
      assert.ok(measuredThickness(p, t.drawer), `${p.id} not ${t.drawer} thick`);
    }
  });
}

test('drawer that cannot fit is dropped with a warning, no throw', () => {
  const { parts, warnings } = buildBox(validate({ H: 150, D: 750, carcass: 25, drawer: 25 }).params);
  assert.ok(warnings.length > 0);
  assert.ok(!parts.some((p) => p.id.startsWith('bottom.drawer')), 'bottom drawer should be absent');
});

test('dowel near an edge warns', () => {
  const { warnings } = buildBox(validate({ H: 150, D: 190 }).params);
  assert.ok(warnings.some((w) => /dowel/i.test(w)), warnings.join('\n'));
});

test('carcass too thick for a short tier: no overlapping boards, clear warning', () => {
  for (const D of [190, 375, 750]) {
    const { parts, warnings } = buildBox(validate({ H: 150, D, carcass: 25, drawer: 25 }).params);
    assert.deepEqual(overlaps(parts), [], `D${D}`);
    assert.ok(warnings.some((w) => /too short/i.test(w)), warnings.join('\n'));
  }
});

test('normal thick timber does not produce slivers or split warnings', () => {
  for (const carcass of [6, 12]) {
    const { parts, warnings } = buildBox(validate({ carcass }).params);
    assert.ok(!warnings.some((w) => /splits/.test(w)), warnings.join('\n'));
    assert.equal(parts.find((p) => p.id === 'top.wall').loops.length, 1, `carcass ${carcass}`);
  }
  const { warnings } = buildBox(validate({ H: 150, D: 375 }).params);
  assert.ok(!warnings.some((w) => /splits/.test(w)), warnings.join('\n'));
});

test('design size: inter-tier drill marks are on the 4 receiving boards, no separate guides', () => {
  const { parts, warnings } = design();
  assert.ok(!parts.some((p) => p.kind === 'plan'), 'separate drill-guide template should not be emitted');
  const ids = ['bottom.top', 'middle.floor', 'middle.top', 'top.floor'];
  for (const id of ids) {
    const p = parts.find((q) => q.id === id);
    assert.ok(p, `${id} missing`);
    const holes = p.holes.filter((h) => h.face === 'plan');
    assert.equal(holes.length, 4, id);
    for (const h of holes) {
      assert.equal(h.d, 20, id);
      assert.equal(h.label, 'Inter-tier dowel');
    }
  }
  assert.ok(!warnings.some((w) => /drill/i.test(w)), warnings.join('\n'));
});

test('inter-tier drill marks stay within the board at every fit-tested size', () => {
  for (const [H, D] of [[180, 225], [450, 560], [300, 600], [450, 250]]) {
    for (const t of [{ carcass: 4 }, { carcass: 12 }]) {
      const { parts } = buildBox(validate({ H, D, ...t }).params);
      for (const id of ['bottom.top', 'middle.floor', 'middle.top', 'top.floor']) {
        const p = parts.find((q) => q.id === id);
        assert.ok(p, `${id} missing at H${H} D${D} carcass${t.carcass}`);
        const holes = p.holes.filter((h) => h.face === 'plan');
        for (const h of holes) {
          assert.ok(h.z >= -1e-6 && h.z <= p.length + 1e-6, `${id} hole x out of board at H${H} D${D}`);
          assert.ok(h.y >= -1e-6 && h.y <= D + 1e-6, `${id} hole depth out of board at H${H} D${D}`);
        }
      }
    }
  }
});

test('cut list no longer includes separate drill-guide rows', () => {
  const { parts } = design();
  const rows = cutList(parts);
  assert.ok(!rows.some((r) => /drill guide/i.test(r.name) || /drilling guide/i.test(r.notes)));
});

test('dowel hardware counts: 10 side dowels (5 positions x 2 sides) + 8 inter-tier (4 per seam x 2 seams) = 18', () => {
  const { parts } = design();
  const side = parts.find((p) => p.id === 'dowel');
  assert.equal(side.qty, 10, 'side dowel hardware qty');
  const inter = parts.find((p) => p.id === 'interTierDowel');
  assert.ok(inter, 'interTierDowel hardware part missing');
  assert.equal(inter.kind, 'dowel');
  assert.equal(inter.qty, 8, 'inter-tier dowel hardware qty');
  assert.equal(inter.thickness, 20);
  const rows = cutList(parts);
  const totalDowels = rows.filter((r) => r.id === 'dowel' || r.id === 'interTierDowel').reduce((n, r) => n + r.qty, 0);
  assert.equal(totalDowels, 18);
});

test('design size: drawers and lid match the model outlines (reference/fusion-sections.json) within 0.05 mm', () => {
  const ref = JSON.parse(fs.readFileSync(new URL('../reference/fusion-sections.json', import.meta.url)));
  const OFF = MASTER.zShift;
  const segs = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const dist = (p, S) => S.reduce((m, [a, b]) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const k = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0;
    return Math.min(m, Math.hypot(p[0] - a[0] - k * dx, p[1] - a[1] - k * dy));
  }, Infinity);
  for (const p of design().parts.filter((q) => /drawer(Front|Side|Bottom|Back)$|lid$/.test(q.id))) {
    const [path, body] = p.ref.split('#');
    const R = ref.find((s) => s.path === path && (!body || s.body === body)).loops[0].pts;
    const G = p.loops[0].map(([z, y]) => [z - OFF, y]);
    const worst = Math.max(...G.map((q) => dist(q, segs(R))), ...R.map((q) => dist(q, segs(G))));
    assert.ok(worst < 0.05, `${p.id} deviates ${worst.toFixed(3)} mm`);
  }
});
