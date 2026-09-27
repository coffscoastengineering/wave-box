import fs from 'node:fs';
import { buildBox } from '../src/parts.js';
import { validate } from '../src/params.js';
import { MASTER } from '../src/master-data.js';
import { bboxOf } from '../src/geom.js';
const sections = JSON.parse(fs.readFileSync('reference/fusion-sections.json'));
const ref = (r) => { const [p, b = 'Body1'] = r.split('#'); return sections.find((q) => q.path === p && q.body === b).loops[0].pts.map(([z, y]) => [z + MASTER.zShift, y]); };
function worst(A, B) { // point of A farthest from B
  let w = 0, at = null;
  for (const p of A) { let best = Infinity; for (let i = 0; i < B.length; i++) { const a = B[i], b = B[(i + 1) % B.length]; const dz = b[0] - a[0], dy = b[1] - a[1], L = dz * dz + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dz + (p[1] - a[1]) * dy) / L)) : 0; best = Math.min(best, Math.hypot(p[0] - a[0] - t * dz, p[1] - a[1] - t * dy)); } if (best > w) { w = best; at = p; } }
  return [w.toFixed(2), at?.map((v) => v.toFixed(1))];
}
const f = (b) => `z${b.z0.toFixed(1)}..${b.z1.toFixed(1)} y${b.y0.toFixed(1)}..${b.y1.toFixed(1)}`;
const { parts } = buildBox(validate({ H: 299.8, D: 375, W: 300 }).params);
for (const p of parts.filter((q) => q.ref && /drawer|lid/.test(q.id))) {
  const R = ref(p.ref);
  console.log(p.id, 'gen', f(bboxOf([p.loops[0]])), 'ref', f(bboxOf([R])), 'gen-far', worst(p.loops[0], R), 'ref-far', worst(R, p.loops[0]));
}
