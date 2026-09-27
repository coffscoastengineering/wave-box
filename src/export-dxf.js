import { layout, placePoint } from './layout.js';
import { labelLines, estimateLabelWidth } from './labels.js';

const n = (v) => Number(v.toFixed(4));

export function byTimber(parts) {
  const g = {};
  for (const p of parts.filter((q) => q.loops.length)) (g[p.timber] ??= []).push(p);
  return g;
}

// AutoCAD R12 ASCII DXF, millimetres. Sheet y is flipped so the drawing reads the same way up as the SVG/PDF.
export function toDXF(parts) {
  const labelH = 16;
  const L = layout(parts, { gap: 12, maxWidth: 800, labelH, labelW: (p) => estimateLabelWidth(p, 3) });
  const out = [];
  const w = (...pairs) => { for (let i = 0; i < pairs.length; i += 2) out.push(String(pairs[i]), String(pairs[i + 1])); };

  w(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC');
  w(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 70, 3);
  for (const [name, color] of [['CUT', 7], ['HOLES', 1], ['LABELS', 5]]) {
    w(0, 'LAYER', 2, name, 70, 0, 62, color, 6, 'CONTINUOUS');
  }
  w(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');

  for (const it of L.items) {
    const at = (p) => { const [x, y] = placePoint(p, it); return [n(x), n(-y)]; };
    for (const loop of it.part.loops) {
      w(0, 'POLYLINE', 8, 'CUT', 66, 1, 70, 1, 10, 0, 20, 0, 30, 0);
      for (const p of loop) { const [x, y] = at(p); w(0, 'VERTEX', 8, 'CUT', 10, x, 20, y, 30, 0); }
      w(0, 'SEQEND', 8, 'CUT');
    }
    for (const h of it.part.holes) {
      const [x, y] = at([h.z, h.y]);
      w(0, 'CIRCLE', 8, 'HOLES', 10, x, 20, y, 30, 0, 40, n(h.d / 2));
    }
    labelLines(it.part).forEach((line, i) => {
      w(0, 'TEXT', 8, 'LABELS', 10, n(it.dz), 20, n(-(it.dy + 4 + i * 5)), 30, 0, 40, 3.5, 1, line.replace(/[—]/g, '-'));
    });
  }
  w(0, 'ENDSEC', 0, 'EOF');
  return out.join('\n') + '\n';
}
