import { layout, placePoint } from './layout.js';
import { estimateLabelWidth, labelLines } from './labels.js';

const clean = (s) => String(s).replace(/[\r\n]/g, ' ');

function polyline(out, loop, item) {
  out.push('0', 'POLYLINE', '8', 'CUT', '66', '1', '70', '1');
  for (const p of loop) {
    const [x, y] = placePoint(p, item);
    out.push('0', 'VERTEX', '8', 'CUT', '10', x.toFixed(3), '20', (-y).toFixed(3), '30', '0');
  }
  out.push('0', 'SEQEND');
}

function circle(out, hole, item) {
  const [x, y] = placePoint([hole.z, hole.y], item);
  out.push('0', 'CIRCLE', '8', 'HOLES', '10', x.toFixed(3), '20', (-y).toFixed(3), '30', '0', '40', (hole.d / 2).toFixed(3));
}

function text(out, value, x, y, size = 4) {
  out.push('0', 'TEXT', '8', 'LABELS', '10', x.toFixed(3), '20', (-y).toFixed(3), '30', '0', '40', String(size), '1', clean(value));
}

export function toDXF(parts, { maxWidth = 600 } = {}) {
  const drawable = parts.filter((p) => p.loops.length);
  const labelW = (part) => estimateLabelWidth(part, 2.4);
  const L = layout(drawable, { gap: 15, maxWidth, labelH: 20, labelW });
  const out = [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES',
    '0', 'TABLE', '2', 'LAYER', '70', '3',
    '0', 'LAYER', '2', 'CUT', '70', '0', '62', '7', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'HOLES', '70', '0', '62', '1', '6', 'CONTINUOUS',
    '0', 'LAYER', '2', 'LABELS', '70', '0', '62', '8', '6', 'CONTINUOUS',
    '0', 'ENDTAB',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
  ];

  for (const it of L.items) {
    for (const loop of it.part.loops) polyline(out, loop, it);
    for (const h of it.part.holes) circle(out, h, it);
    labelLines(it.part).forEach((line, i) => text(out, line, it.dz, it.dy + 4 + i * 4));
  }

  out.push('0', 'ENDSEC', '0', 'EOF');
  return out.join('\n');
}
