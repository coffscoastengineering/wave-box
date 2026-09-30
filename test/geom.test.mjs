import test from 'node:test';
import assert from 'node:assert/strict';
import { rect, offset, areaOf, scaleLoop, bboxOf, hausdorff, toPaths, fromPaths, inter } from '../src/geom.js';
import { MASTER } from '../src/master-data.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ±${tol}, got ${a}`);
const square = (s, dz = 0) => [[dz, 0], [dz + s, 0], [dz + s, s], [dz, s]];

test('rect area', () => close(areaOf(rect(0, 0, 100, 50)), 5000, 0.01));

test('negative offset shrinks square', () => close(areaOf(offset(toPaths([square(100)]), -10)), 6400, 1));

test('scaleLoop scales bbox independently', () => {
  const b = bboxOf([scaleLoop(square(1), 2, 3)]);
  close(b.z1 - b.z0, 2, 1e-9); close(b.y1 - b.y0, 3, 1e-9);
});

test('hausdorff identical is zero, shifted is shift', () => {
  close(hausdorff(square(50), square(50)), 0, 1e-6);
  close(hausdorff(square(50), square(50, 1)), 1, 0.01);
});

test('fromPaths returns outer loop first and round-trips area', () => {
  const holed = toPaths([square(100)]).concat(toPaths([[[20, 20], [20, 40], [40, 40], [40, 20]]]));
  const loops = fromPaths(inter(holed, rect(-1, -1, 101, 101)));
  close(areaOf(toPaths([loops[0]])), 10000, 0.1);
});

test('master walnut is design size', () => {
  const b = bboxOf([MASTER.walnut]);
  close(b.z0, 0, 0.01); close(b.z1 - b.z0, 375, 0.1); close(b.y1 - b.y0, 299.8, 0.1);
});

test('master tiers have envelopes and bands', () => {
  for (const [k, y0, y1] of [['bottom', 0, 90], ['middle', 100, 190], ['top', 200, 299.8]]) {
    const t = MASTER.tiers[k];
    close(t.y0, y0, 0.01, k); close(t.y1, y1, 0.01, k);
    const b = bboxOf([t.env]);
    close(b.y0, y0, 0.01, k); close(b.y1, y1, 0.01, k);
  }
});

test('every dowel lies inside the walnut outline', () => {
  assert.equal(MASTER.dowels.length, 5);
  for (const d of MASTER.dowels) {
    const tiny = rect(d.z - 0.1, d.y - 0.1, d.z + 0.1, d.y + 0.1);
    close(areaOf(inter(tiny, toPaths([MASTER.walnut]))), 0.04, 0.001, `dowel ${d.z},${d.y}`);
  }
});
