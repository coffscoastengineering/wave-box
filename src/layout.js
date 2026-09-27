import { bboxOf } from './geom.js';

// Row-packs parts onto a sheet. Sheet coordinates: x right, y DOWN, mm.
// Each item reserves labelH above the part outline.
export function layout(parts, { gap = 15, maxWidth = 600, labelH = 0 } = {}) {
  const items = parts.filter((p) => p.loops.length).map((part) => {
    const b = bboxOf(part.loops);
    return { part, b, w: b.z1 - b.z0, h: b.y1 - b.y0 + labelH, labelH };
  }).sort((a, c) => c.h - a.h);

  let x = 0, y = 0, rowH = 0, width = 0;
  for (const it of items) {
    if (x > 0 && x + it.w > maxWidth) { y += rowH + gap; x = 0; rowH = 0; }
    it.dz = x; it.dy = y;
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
    width = Math.max(width, it.dz + it.w);
  }
  return { items, width, height: y + rowH };
}

export const placePoint = ([z, y], it) => [it.dz + (z - it.b.z0), it.dy + it.labelH + (it.b.y1 - y)];
