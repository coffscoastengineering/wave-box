import fs from 'node:fs';
import ClipperLib from 'clipper-lib';

const S = 1000;
const parts = JSON.parse(fs.readFileSync(new URL('../reference/fusion-sections.json', import.meta.url)));
const toC = (pts) => pts.map(([z, y]) => ({ X: Math.round(z * S), Y: Math.round(y * S) }));
const area = (paths) => paths.reduce((a, p) => a + ClipperLib.Clipper.Area(p), 0) / S / S;
const perim = (pts) => pts.reduce((a, p, i) => { const q = pts[(i + 1) % pts.length]; return a + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
function clip(a, b, type) {
  const c = new ClipperLib.Clipper(); const out = new ClipperLib.Paths();
  c.AddPaths(a, ClipperLib.PolyType.ptSubject, true); c.AddPaths(b, ClipperLib.PolyType.ptClip, true);
  c.Execute(type, out, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero); return out;
}
function offset(paths, d) {
  const co = new ClipperLib.ClipperOffset(2, 0.25); const out = new ClipperLib.Paths();
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon); co.Execute(out, d * S); return out;
}
const bb = (pts) => { const zs = pts.map(p => p[0]), ys = pts.map(p => p[1]); return [Math.min(...zs), Math.max(...zs), Math.min(...ys), Math.max(...ys)].map(v => +v.toFixed(2)); };

parts.forEach((p, i) => { p.i = i; p.pts = p.loops[0].pts; p.C = [toC(p.pts)]; p.bb = bb(p.pts); });
const tiers = { Bottom: 21, Middle: 7, Top: 23 };
for (const [tier, ei] of Object.entries(tiers)) {
  const E = parts[ei];
  console.log(`\n== ${tier} envelope #${ei} bb z${E.bb[0]}..${E.bb[1]} y${E.bb[2]}..${E.bb[3]} area ${area(E.C).toFixed(0)}`);
  const inT = parts.filter(p => p.path.startsWith(tier) || (tier === 'Top' && p.path.startsWith('Top')));
  for (const p of inT) {
    const a = Math.abs(area(p.C)); const t = a / (perim(p.pts) / 2);
    const outside = Math.abs(area(clip(p.C, E.C, ClipperLib.ClipType.ctDifference)));
    console.log(`#${p.i} ${p.path.split('+').slice(-1)[0]}/${p.body} x${p.x0}..${p.x1} bb z${p.bb[0]}..${p.bb[1]} y${p.bb[2]}..${p.bb[3]} area ${a.toFixed(0)} thk~${t.toFixed(2)} outsideE ${outside.toFixed(1)}`);
  }
  // overlaps between parts of this tier that share x ranges
  const inner = inT.filter(p => p.i !== ei && Math.abs(p.x1 - p.x0) > 50);
  for (let a = 0; a < inner.length; a++) for (let b = a + 1; b < inner.length; b++) {
    const ov = Math.abs(area(clip(inner[a].C, inner[b].C, ClipperLib.ClipType.ctIntersection)));
    if (ov > 0.5) console.log(`  overlap #${inner[a].i} x #${inner[b].i}: ${ov.toFixed(1)}`);
  }
}
const w = parts[1];
console.log('\nwalnut bb', w.bb, 'area', Math.abs(area(w.C)).toFixed(0));
