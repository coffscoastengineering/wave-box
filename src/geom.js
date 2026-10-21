import ClipperLib from 'clipper-lib';

export const S = 1000;
const { Clipper, ClipperOffset, ClipType, PolyType, PolyFillType, JoinType, EndType } = ClipperLib;
const BIG = 1e6;

export function toPaths(loops) {
  return loops.map((l) => l.map(([z, y]) => ({ X: Math.round(z * S), Y: Math.round(y * S) })));
}

const signedArea = (l) => {
  let a = 0;
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a / 2;
};

// Outer loops (CCW) first, largest first; holes (CW) after.
export function fromPaths(paths) {
  const loops = paths.filter((p) => p.length >= 3).map((p) => p.map((q) => [q.X / S, q.Y / S]));
  return loops.sort((a, b) => {
    const sa = signedArea(a), sb = signedArea(b);
    if ((sa > 0) !== (sb > 0)) return sa > 0 ? -1 : 1;
    return Math.abs(sb) - Math.abs(sa);
  });
}

export const outerCount = (paths) => paths.filter((p) => Clipper.Area(p) > 0).length;

function exec(a, b, type) {
  const c = new Clipper();
  const out = [];
  c.AddPaths(a, PolyType.ptSubject, true);
  if (b.length) c.AddPaths(b, PolyType.ptClip, true);
  c.Execute(type, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}

export const union = (...ps) => exec(ps.flat(), [], ClipType.ctUnion);
export const diff = (a, b) => exec(a, b, ClipType.ctDifference);
export const inter = (a, b) => exec(a, b, ClipType.ctIntersection);

export function offset(paths, dmm) {
  const co = new ClipperOffset(2, 0.02 * S);
  const out = [];
  co.AddPaths(paths, JoinType.jtRound, EndType.etClosedPolygon);
  co.Execute(out, dmm * S);
  return out;
}

export function rect(z0, y0, z1, y1) {
  if (z1 <= z0 || y1 <= y0) return [];
  const c = (v) => Math.round(Math.max(-BIG, Math.min(BIG, v)) * S);
  return [[{ X: c(z0), Y: c(y0) }, { X: c(z1), Y: c(y0) }, { X: c(z1), Y: c(y1) }, { X: c(z0), Y: c(y1) }]];
}

export const scaleLoop = (loop, sz, sy) => loop.map(([z, y]) => [z * sz, y * sy]);

export const areaOf = (paths) => paths.reduce((a, p) => a + Clipper.Area(p), 0) / S / S;

export function bboxOf(loops) {
  let z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of loops) for (const [z, y] of l) {
    if (z < z0) z0 = z; if (z > z1) z1 = z; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { z0, z1, y0, y1 };
}

function densify(loop, step) {
  const out = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    const n = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / step));
    for (let k = 0; k < n; k++) out.push([p[0] + ((q[0] - p[0]) * k) / n, p[1] + ((q[1] - p[1]) * k) / n]);
  }
  return out;
}

function segDist(p, a, b) {
  const dz = b[0] - a[0], dy = b[1] - a[1];
  const L = dz * dz + dy * dy;
  let t = L ? ((p[0] - a[0]) * dz + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dz, p[1] - a[1] - t * dy);
}

function directed(A, B) {
  let worst = 0;
  for (const p of densify(A, 0.5)) {
    let best = Infinity;
    for (let i = 0; i < B.length; i++) {
      const d = segDist(p, B[i], B[(i + 1) % B.length]);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
  }
  return worst;
}

export const hausdorff = (A, B) => Math.max(directed(A, B), directed(B, A));

export function simplify(loop, tol) {
  const dp = (pts) => {
    if (pts.length < 3) return pts;
    let idx = 0, max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = segDist(pts[i], pts[0], pts[pts.length - 1]);
      if (d > max) { max = d; idx = i; }
    }
    if (max <= tol) return [pts[0], pts[pts.length - 1]];
    return dp(pts.slice(0, idx + 1)).slice(0, -1).concat(dp(pts.slice(idx)));
  };
  const closed = dp([...loop, loop[0]]);
  return closed.slice(0, -1);
}

export { signedArea };
