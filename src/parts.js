import { MASTER } from './master-data.js';
import { CLEARANCE, DOWEL_D } from './params.js';
import {
  toPaths, fromPaths, union, diff, inter, offset, rect, scaleLoop, areaOf, bboxOf, outerCount, signedArea,
} from './geom.js';

const FAR = 1e5;
const MIN_DOWEL_MARGIN = 5;
const MIN_DRAWER_HEIGHT = 20;
const MIN_PIECE_AREA = 20;

const REFS = {
  'bottom.ends': 'Bottom:1+Sides (1):1+Component36:1',
  'bottom.floor': 'Bottom:1+Sides (1):1+Component32:1',
  'bottom.top': 'Bottom:1+Sides (1):1+Component33:1',
  'bottom.wall': 'Bottom:1+Sides (1):1+Component34:1',
  'bottom.drawerFront': 'Bottom:1+Draw (1):1+Component48:1#Body8',
  'bottom.drawerSide': 'Bottom:1+Draw (1):1+Component48:1#Body7',
  'bottom.drawerBottom': 'Bottom:1+Draw (1):1+Component48:1#Body6',
  'bottom.drawerBack': 'Bottom:1+Draw (1):1+Component48:1#Body2',
  'middle.ends': 'Middle:1+Sides (2):1+Component26:1',
  'middle.floor': 'Middle:1+Sides (2):1+Component29:1',
  'middle.top': 'Middle:1+Sides (2):1+Component28:1',
  'middle.wall': 'Middle:1+Sides (2):1+Component27:1',
  'middle.drawerFront': 'Middle:1+Draw:1#Body1',
  'middle.drawerSide': 'Middle:1+Draw:1+Component44:1#Body4',
  'middle.drawerBottom': 'Middle:1+Draw:1+Component44:1#Body5',
  'middle.drawerBack': 'Middle:1+Draw:1+Component44:1#Body1',
  'top.ends': 'Top:1+Body:1+Component41:1',
  'top.floor': 'Top:1+Body:1+Component40:1',
  'top.wall': 'Top:1+Body:1+Component37:1',
  'top.lid': 'Top:1+Lid:1',
  'sides.walnut': 'Sides:1+Side 1:1',
};

const TIER_NAME = { bottom: 'Bottom tier', middle: 'Middle tier', top: 'Top tier' };

function centroidZ(loop) {
  let a = 0, cz = 0;
  for (let i = 0; i < loop.length; i++) {
    const [z0, y0] = loop[i], [z1, y1] = loop[(i + 1) % loop.length];
    const c = z0 * y1 - z1 * y0;
    a += c; cz += (z0 + z1) * c;
  }
  return cz / (3 * a);
}

// Distance from point to the boundary of a polygon set (mm).
function edgeDistance(paths, z, y) {
  let best = Infinity;
  for (const l of fromPaths(paths)) {
    for (let i = 0; i < l.length; i++) {
      const a = l[i], b = l[(i + 1) % l.length];
      const dz = b[0] - a[0], dy = b[1] - a[1], L = dz * dz + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((z - a[0]) * dz + (y - a[1]) * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(z - a[0] - t * dz, y - a[1] - t * dy));
    }
  }
  return best;
}

const contains = (paths, z, y) => areaOf(inter(paths, rect(z - 0.01, y - 0.01, z + 0.01, y + 0.01))) > 0.0003;

// End-cut angles of a flat board, degrees from square, [front, back].
function boardBevels(loops) {
  const pts = loops[0];
  const { y0, y1 } = bboxOf([pts]);
  const at = (y) => pts.filter((p) => Math.abs(p[1] - y) < 0.01).map((p) => p[0]);
  const bot = at(y0), top = at(y1);
  if (!bot.length || !top.length) return [0, 0];
  const h = y1 - y0;
  const ang = (dz) => Math.round((Math.atan(Math.abs(dz) / h) * 180) / Math.PI * 2) / 2;
  return [ang(Math.min(...top) - Math.min(...bot)), ang(Math.max(...top) - Math.max(...bot))];
}

export function buildBox(params) {
  const { H, D, W, walnut: tw, carcass: tc, drawer: td, gap } = params;
  const clr = CLEARANCE;
  const sz = D / MASTER.design.D, sy = H / MASTER.design.H;
  const parts = [];
  const warnings = [];

  const xs = {
    end: [W / 2 - tc, W / 2],
    carcass: [-(W / 2 - tc), W / 2 - tc],
    front: [-(W / 2 - tc - clr), W / 2 - tc - clr],
    side: [W / 2 - tc - clr - td, W / 2 - tc - clr],
    inner: [-(W / 2 - tc - clr - td), W / 2 - tc - clr - td],
    walnut: [W / 2 + gap, W / 2 + gap + tw],
  };
  const len = (x) => Math.round((x[1] - x[0]) * 100) / 100;

  const dowels = MASTER.dowels.map((d) => ({ z: d.z * sz, y: d.y * sy, d: DOWEL_D }));
  const walnutPaths = toPaths([scaleLoop(MASTER.walnut, sz, sy)]);

  const add = (id, name, tier, timber, kind, thickness, x, raw, extra = {}) => {
    // Offsets around tight curves leave hair-thin slivers; they are not real pieces.
    const biggest = Math.max(0, ...raw.map((q) => Math.abs(areaOf([q]))));
    const paths = raw.filter((q) => Math.abs(areaOf([q])) >= Math.max(MIN_PIECE_AREA, biggest * 0.02));
    if (!paths.length || areaOf(paths) < 1) return false;
    const n = outerCount(paths);
    if (n > 1) warnings.push(`${name} splits into ${n} pieces at this size — try thinner timber or a larger box.`);
    const loops = fromPaths(paths);
    const part = {
      id, name, tier, timber, kind, thickness, x, qty: 1, length: kind === 'profile' ? thickness : len(x),
      loops, holes: [], bevels: kind === 'board' ? boardBevels(loops) : [], grain: kind === 'profile' ? 'z' : 'x',
      ref: REFS[id] ?? null, ...extra,
    };
    parts.push(part);
    return true;
  };

  for (const tier of ['bottom', 'middle', 'top']) {
    const m = MASTER.tiers[tier];
    const envLoop = scaleLoop(m.env, sz, sy);
    const E = toPaths([envLoop]);
    const y0 = m.y0 * sy, y1 = m.y1 * sy;
    const zc = centroidZ(signedArea(envLoop) > 0 ? envLoop : envLoop.slice().reverse());
    const T = TIER_NAME[tier];
    const back = rect(zc, -FAR, FAR, FAR);
    const front = rect(-FAR, -FAR, zc, FAR);
    const ring = (t) => diff(E, offset(E, -t));

    const endHoles = dowels.filter((d) => contains(E, d.z, d.y));
    add(`${tier}.ends`, `${T} carcass end`, tier, 'carcass', 'profile', tc, xs.end, E, { qty: 2, holes: endHoles });

    const floor = inter(E, rect(-FAR, y0, FAR, y0 + tc));
    add(`${tier}.floor`, `${T} ${tier === 'bottom' ? 'base' : 'floor'}`, tier, 'carcass', 'board', tc, xs.carcass, floor);

    if (tier === 'top') {
      const wallTop = m.wallTop * sy;
      if (wallTop - (y0 + tc) < 1) {
        warnings.push(`${T} is too short for ${tc} mm carcass — the back wall has no room. Use thinner carcass timber or a taller box.`);
      }
      const wall = inter(inter(ring(tc), back), rect(-FAR, y0 + tc, FAR, wallTop));
      add('top.wall', `${T} back wall (curl)`, tier, 'carcass', 'curved', tc, xs.carcass, wall);
      const air = diff(rect(-FAR, y0 + tc, FAR, FAR), E);
      let lid = inter(inter(E, offset(air, td)), rect(-FAR, y0 + tc, FAR, FAR));
      lid = diff(lid, inter(back, rect(-FAR, -FAR, FAR, wallTop + clr)));
      if (!add('top.lid', 'Lid', tier, 'drawer', 'curved', td, xs.front, lid)) {
        warnings.push('Lid does not fit — reduce drawer/lid thickness or increase size.');
      }
      continue;
    }

    if (y1 - y0 < 2 * tc + 1) {
      warnings.push(`${T} is too short for ${tc} mm carcass — its floor and top would overlap. Use thinner carcass timber or a taller box.`);
      continue;
    }
    const top = inter(E, rect(-FAR, y1 - tc, FAR, y1));
    add(`${tier}.top`, `${T} ${tier === 'bottom' ? 'shelf' : 'top'}`, tier, 'carcass', 'board', tc, xs.carcass, top);
    const wall = inter(inter(ring(tc), back), rect(-FAR, y0 + tc, FAR, y1 - tc));
    add(`${tier}.wall`, `${T} back wall`, tier, 'carcass', 'curved', tc, xs.carcass, wall);

    const yd0 = y0 + tc + clr, yd1 = y1 - tc - clr;
    const interior = diff(E, union(floor, top, wall));
    const dOut = diff(inter(interior, rect(-FAR, yd0, FAR, yd1)), offset(wall, clr));
    const airFront = diff(rect(-FAR, y0, zc, y1), E);
    const dFront = inter(dOut, offset(airFront, td));
    const dSide = diff(dOut, dFront);
    const dBottom = inter(dSide, rect(-FAR, yd0, FAR, yd0 + td));
    const dBack = diff(inter(dSide, offset(wall, clr + td)), rect(-FAR, -FAR, FAR, yd0 + td));

    const D_ = `${T} drawer`;
    const fits = yd1 - yd0 >= MIN_DRAWER_HEIGHT
      && [dFront, dSide, dBottom, dBack].every((p) => p.length && areaOf(p) > 1)
      && areaOf(diff(dSide, union(dBottom, dBack))) > 1;
    if (!fits) {
      warnings.push(`${D_} does not fit — reduce carcass/drawer thickness or increase height.`);
      continue;
    }
    add(`${tier}.drawerFront`, `${D_} front`, tier, 'drawer', 'curved', td, xs.front, dFront);
    add(`${tier}.drawerSide`, `${D_} side`, tier, 'drawer', 'profile', td, xs.side, dSide, { qty: 2 });
    add(`${tier}.drawerBottom`, `${D_} bottom`, tier, 'drawer', 'board', td, xs.inner, dBottom);
    add(`${tier}.drawerBack`, `${D_} back`, tier, 'drawer', 'curved', td, xs.inner, dBack);
  }

  add('sides.walnut', 'Side', 'sides', 'walnut', 'profile', tw, xs.walnut, walnutPaths, { qty: 2, holes: dowels });

  const endsUnion = union(...['bottom', 'middle', 'top'].map((t) => toPaths([scaleLoop(MASTER.tiers[t].env, sz, sy)])));
  for (const [i, d] of dowels.entries()) {
    const mw = edgeDistance(walnutPaths, d.z, d.y) - d.d / 2;
    const inEnd = contains(endsUnion, d.z, d.y);
    const me = inEnd ? edgeDistance(endsUnion, d.z, d.y) - d.d / 2 : -Infinity;
    if (mw < MIN_DOWEL_MARGIN || me < MIN_DOWEL_MARGIN) {
      warnings.push(`Dowel ${i + 1} hole is within ${MIN_DOWEL_MARGIN} mm of an edge — it may break out. Increase the size.`);
    }
  }
  parts.push({
    id: 'dowel', name: `Dowel Ø${DOWEL_D}`, tier: 'sides', timber: 'dowel', kind: 'dowel', thickness: DOWEL_D,
    x: [W / 2 - tc, W / 2 + gap + tw], qty: dowels.length, length: tw + gap + tc, loops: [], holes: [], bevels: [], grain: 'x', ref: null,
  });

  const all = bboxOf(parts.flatMap((p) => p.loops));
  return { parts, warnings, overall: { H: all.y1 - all.y0, D: all.z1 - all.z0, W: W + 2 * (gap + tw) } };
}
