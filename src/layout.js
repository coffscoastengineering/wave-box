import { bboxOf } from './geom.js';

// Two packing strategies computed on the same items, cheapest kept. Neither is
// uniformly better: skyline usually packs tighter, but a single dominant item
// (e.g. a large panel) can leave an awkward leftover column that fragments the
// skyline and ends up worse than plain row-shelving for that input.

// Simple shelf packer: fill a row left-to-right, wrap to a new row when the
// next item would overflow maxWidth.
function packShelf(items, gap, maxWidth) {
  let x = 0, y = 0, rowH = 0, width = 0, height = 0;
  const pos = [];
  for (const it of items) {
    if (x > 0 && x + it.w > maxWidth) { y += rowH + gap; x = 0; rowH = 0; }
    pos.push({ dz: x, dy: y });
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
    width = Math.max(width, x - gap);
    height = Math.max(height, y + rowH);
  }
  return { pos, width, height };
}

// Skyline best-fit: maintain the lowest free y at each x across the sheet
// width, and place each item (tallest first) at the position with the lowest
// resulting y, reusing leftover space beside shorter neighbours.
function packSkyline(items, gap, maxWidth) {
  let skyline = [{ x: 0, width: maxWidth, y: 0 }];

  function findPosition(w) {
    let best = null;
    for (let i = 0; i < skyline.length; i++) {
      const startX = skyline[i].x;
      if (startX + w > maxWidth + 1e-9) continue;
      let landingY = 0, covered = 0, j = i;
      while (covered < w && j < skyline.length) {
        landingY = Math.max(landingY, skyline[j].y);
        covered += skyline[j].width;
        j++;
      }
      if (covered < w) continue;
      if (!best || landingY < best.y - 1e-9 || (Math.abs(landingY - best.y) < 1e-9 && startX < best.x)) {
        best = { x: startX, y: landingY };
      }
    }
    return best ?? { x: 0, y: Math.max(0, ...skyline.map((s) => s.y)) };
  }

  function occupy(x, width, y) {
    const next = [];
    let i = 0;
    while (i < skyline.length && skyline[i].x + skyline[i].width <= x) next.push(skyline[i++]);
    if (i < skyline.length && skyline[i].x < x) next.push({ x: skyline[i].x, width: x - skyline[i].x, y: skyline[i].y });
    next.push({ x, width, y });
    while (i < skyline.length && skyline[i].x + skyline[i].width <= x + width) i++;
    if (i < skyline.length && skyline[i].x < x + width) {
      const seg = skyline[i];
      next.push({ x: x + width, width: seg.x + seg.width - (x + width), y: seg.y });
      i++;
    }
    while (i < skyline.length) next.push(skyline[i++]);
    skyline = next.reduce((merged, seg) => {
      const prev = merged[merged.length - 1];
      if (prev && prev.y === seg.y && Math.abs(prev.x + prev.width - seg.x) < 1e-6) prev.width += seg.width;
      else merged.push({ ...seg });
      return merged;
    }, []);
  }

  let width = 0, height = 0;
  const pos = [];
  for (const it of items) {
    const p = findPosition(it.w + gap);
    pos.push({ dz: p.x, dy: p.y });
    occupy(p.x, it.w + gap, p.y + it.h + gap);
    width = Math.max(width, p.x + it.w);
    height = Math.max(height, p.y + it.h);
  }
  return { pos, width, height };
}

// Sheet coordinates: x right, y DOWN, mm. Each item reserves labelH above the
// part outline. gap is reserved as trailing padding on every item's right and
// bottom edge, so placed items never touch.
export function layout(parts, { gap = 15, maxWidth = 600, labelH = 0, labelW = () => 0 } = {}) {
  const items = parts.filter((p) => p.loops.length).map((part) => {
    const b = bboxOf(part.loops);
    return { part, b, w: Math.max(b.z1 - b.z0, labelW(part)), h: b.y1 - b.y0 + labelH, labelH };
  }).sort((a, c) => c.h - a.h || c.w - a.w);

  const shelf = packShelf(items, gap, maxWidth);
  const skyline = packSkyline(items, gap, maxWidth);
  const chosen = skyline.width * skyline.height <= shelf.width * shelf.height ? skyline : shelf;

  items.forEach((it, i) => { it.dz = chosen.pos[i].dz; it.dy = chosen.pos[i].dy; });
  return { items, width: chosen.width, height: chosen.height };
}

export const placePoint = ([z, y], it) => [it.dz + (z - it.b.z0), it.dy + it.labelH + (it.b.y1 - y)];

// Drill-guide ("plan") holes use (length, depth) coords, so depth runs top-down from b.y1.
export const holePoint = (hole, it) => (
  hole.face === 'plan'
    ? [it.dz + hole.z, it.dy + it.labelH + (it.b.y1 - hole.y)]
    : placePoint([hole.z, hole.y], it)
);
