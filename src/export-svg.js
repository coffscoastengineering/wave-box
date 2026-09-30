import { layout, placePoint } from './layout.js';
import { estimateLabelWidth, labelLines } from './labels.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

const pathD = (loop, item) => {
  const pts = loop.map((p) => placePoint(p, item));
  return `M ${pts.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join(' L ')} Z`;
};

export function byTimber(parts) {
  return {
    walnut: parts.filter((p) => p.timber === 'walnut'),
    carcass: parts.filter((p) => p.timber === 'carcass'),
    drawer: parts.filter((p) => p.timber === 'drawer'),
    dowel: parts.filter((p) => p.timber === 'dowel'),
  };
}

export function toSVG(parts, { title = 'Claude Box templates', maxWidth = 600 } = {}) {
  const drawable = parts.filter((p) => p.loops.length);
  const labelW = (part) => estimateLabelWidth(part, 2.4);
  const L = layout(drawable, { gap: 15, maxWidth, labelH: 20, labelW });
  const width = Math.max(1, L.width);
  const height = Math.max(1, L.height);
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width.toFixed(3)}mm" height="${height.toFixed(3)}mm" viewBox="0 0 ${width.toFixed(3)} ${height.toFixed(3)}">`,
    `<title>${esc(title)}</title>`,
    '<desc>Cut paths are in millimetres. Print or import at 100 percent scale.</desc>',
    '<style>.cut{fill:none;stroke:#000;stroke-width:.2}.hole{fill:none;stroke:#a53a26;stroke-width:.2}.label{font:4px sans-serif;fill:#111}.label-main{font-weight:700}</style>',
    '<g id="cut">',
  ];

  for (const it of L.items) {
    for (const loop of it.part.loops) {
      out.push(`<path class="cut" data-part="${esc(it.part.id)}" d="${pathD(loop, it)}"/>`);
    }
  }
  out.push('</g>', '<g id="holes">');
  for (const it of L.items) {
    for (const h of it.part.holes) {
      const [cx, cy] = placePoint([h.z, h.y], it);
      out.push(`<circle class="hole" data-part="${esc(it.part.id)}" cx="${cx.toFixed(3)}" cy="${cy.toFixed(3)}" r="${(h.d / 2).toFixed(3)}"/>`);
    }
  }
  out.push('</g>', '<g id="labels">');
  for (const it of L.items) {
    const x = it.dz;
    const y = it.dy + 4;
    labelLines(it.part).forEach((line, i) => {
      const klass = i === 0 ? 'label label-main' : 'label';
      out.push(`<text class="${klass}" x="${x.toFixed(3)}" y="${(y + i * 4).toFixed(3)}">${esc(line)}</text>`);
    });
  }
  out.push('</g>', '</svg>');
  return out.join('\n');
}
