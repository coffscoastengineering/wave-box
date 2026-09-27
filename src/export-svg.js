import { layout, placePoint } from './layout.js';
import { labelLines, estimateLabelWidth } from './labels.js';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const n = (v) => Number(v.toFixed(3));

export function toSVG(parts, { title = 'Claude Box templates' } = {}) {
  const M = 10, labelH = 16;
  const L = layout(parts, { gap: 12, maxWidth: 800, labelH, labelW: (p) => estimateLabelWidth(p, 2) });
  const W = n(L.width + 2 * M), H = n(L.height + 2 * M);
  const cut = [], holes = [], labels = [];
  for (const it of L.items) {
    const at = (p) => placePoint(p, it).map((v, i) => n(v + M));
    for (const loop of it.part.loops) {
      cut.push(`<path d="M${loop.map((p) => at(p).join(' ')).join('L')}Z"/>`);
    }
    for (const h of it.part.holes) {
      const [cx, cy] = at([h.z, h.y]);
      holes.push(`<circle cx="${cx}" cy="${cy}" r="${n(h.d / 2)}"/>`);
    }
    labelLines(it.part).forEach((line, i) => {
      labels.push(`<text x="${n(it.dz + M)}" y="${n(it.dy + M + 4 + i * 5)}">${esc(line)}</text>`);
    });
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<title>${esc(title)}</title>
<g id="cut" fill="none" stroke="#000" stroke-width="0.2">${cut.join('')}</g>
<g id="holes" fill="none" stroke="#c00" stroke-width="0.2">${holes.join('')}</g>
<g id="labels" font-family="Arial, sans-serif" font-size="3.5" fill="#00c">${labels.join('')}</g>
</svg>
`;
}
