import { jsPDF } from 'jspdf';
import { layout, placePoint } from './layout.js';
import { labelLines, fmt } from './labels.js';
import { cutList, assemblySteps } from './cutlist.js';
import { bboxOf } from './geom.js';

const MARGIN = 10;
const OVERLAP = 10;
const LABEL_H = 22;
const COLORS = { walnut: [205, 180, 160], carcass: [225, 200, 150], drawer: [160, 195, 230] };
const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pathLoop(doc, pts, style) {
  pts.forEach(([x, y], i) => (i ? doc.lineTo(x, y) : doc.moveTo(x, y)));
  doc.close();
  if (style === 'F') doc.fill(); else if (style === 'FD') doc.fillStroke(); else doc.stroke();
}

function header(doc, title, pageW) {
  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(0);
  doc.text(title, MARGIN, MARGIN + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setDrawColor(180); doc.line(MARGIN, MARGIN + 9, pageW - MARGIN, MARGIN + 9);
}

function coverPage(doc, result, params, pageW, pageH) {
  header(doc, 'Claude Box — cutting templates', pageW);
  let y = MARGIN + 16;
  const line = (t, bold = false, size = 9, color = 0) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...[].concat(color));
    for (const l of doc.splitTextToSize(t, pageW - 2 * MARGIN - 65)) { doc.text(l, MARGIN, y); y += size * 0.45; }
  };
  const o = result.overall;
  line(`Overall ${fmt(o.H)} high × ${fmt(o.D)} deep × ${fmt(o.W)} wide`, true, 11);
  line(`Carcass width ${fmt(params.W)} · walnut ${fmt(params.walnut)} · carcass ${fmt(params.carcass)} · drawers/lid ${fmt(params.drawer)} · stand-off ${fmt(params.gap)}`);
  y += 3;
  line('PRINT AT 100 % ("Actual size"). Do not use "Fit to page". Check the square below with a ruler before cutting anything.', true, 9, [170, 0, 0]);

  const sq = 100;
  y += 3;
  const sy = y;
  doc.setDrawColor(0); doc.setLineWidth(0.3);
  doc.rect(MARGIN, sy, sq, sq);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0);
  doc.text('This square must measure 100 mm × 100 mm', MARGIN + 4, sy + 7);

  y = sy + sq + 7;
  if (result.warnings.length) {
    line('Warnings', true, 11, [170, 0, 0]);
    for (const w of result.warnings) line(`• ${w}`, false, 9, [170, 0, 0]);
    y += 2;
  }

  line('Cut list', true, 11);
  const cols = [MARGIN, MARGIN + 58, MARGIN + 68, MARGIN + 98, MARGIN + 140];
  const heads = ['Part', 'Qty', 'Timber', 'Finished size', 'Block / notes'];
  const row = (cells, bold) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(8); doc.setTextColor(0);
    const wrapped = cells.map((c, i) => doc.splitTextToSize(String(c), (cols[i + 1] ?? pageW - MARGIN) - cols[i] - 2));
    const h = Math.max(...wrapped.map((w) => w.length)) * 3.6 + 1.5;
    if (y + h > pageH - MARGIN) { doc.addPage(); header(doc, 'Cut list (continued)', pageW); y = MARGIN + 16; }
    wrapped.forEach((w, i) => doc.text(w, cols[i], y));
    y += h;
    doc.setDrawColor(225); doc.line(MARGIN, y - 2.5, pageW - MARGIN, y - 2.5);
  };
  row(heads, true);
  for (const r of cutList(result.parts)) {
    row([r.name, r.qty, r.timber, r.finished, [r.block ? `Block ${r.block}` : '', r.notes].filter(Boolean).join('. ')]);
  }
}

function assemblyPage(doc, result, params, pageW, pageH) {
  doc.addPage();
  header(doc, 'Assembly', pageW);
  const box = { x: MARGIN, y: MARGIN + 14, w: pageW - 2 * MARGIN, h: (pageH - 2 * MARGIN) * 0.42 };
  const solid = result.parts.filter((p) => p.loops.length);
  const b = bboxOf(solid.flatMap((p) => p.loops));
  const s = Math.min(box.w / (b.z1 - b.z0), box.h / (b.y1 - b.y0));
  const at = ([z, y]) => [box.x + (z - b.z0) * s, box.y + (b.y1 - y) * s];
  doc.setLineWidth(0.15); doc.setDrawColor(60);
  for (const p of [...solid.filter((q) => q.timber !== 'walnut'), ...solid.filter((q) => q.timber === 'walnut')]) {
    doc.setFillColor(...COLORS[p.timber]);
    if (p.timber === 'walnut') doc.setGState(new doc.GState({ opacity: 0.55 }));
    pathLoop(doc, p.loops[0].map(at), 'FD');
    if (p.timber === 'walnut') doc.setGState(new doc.GState({ opacity: 1 }));
  }
  doc.setFontSize(8); doc.setTextColor(80);
  doc.text('Side view (front of box on the left). Walnut side shown see-through over the carcass (tan) and drawers/lid (blue).', MARGIN, box.y + box.h + 5);
  let y = box.y + box.h + 12;
  doc.setTextColor(0); doc.setFontSize(9.5);
  assemblySteps(params).forEach((t, i) => {
    const lines = doc.splitTextToSize(`${i + 1}. ${t}`, pageW - 2 * MARGIN);
    if (y + lines.length * 4.4 > pageH - MARGIN) { doc.addPage(); header(doc, 'Assembly (continued)', pageW); y = MARGIN + 16; }
    doc.text(lines, MARGIN, y); y += lines.length * 4.4 + 1.5;
  });
}

function grainArrow(doc, x, y, grain) {
  doc.setDrawColor(0, 0, 160); doc.setLineWidth(0.3);
  if (grain === 'z') {
    doc.line(x, y, x + 40, y);
    doc.line(x + 40, y, x + 36, y - 1.8); doc.line(x + 40, y, x + 36, y + 1.8);
    doc.line(x, y, x + 4, y - 1.8); doc.line(x, y, x + 4, y + 1.8);
    doc.setFontSize(7); doc.setTextColor(0, 0, 160); doc.text('grain', x + 42, y + 1);
  }
}

function templatePages(doc, result, params, pageW, pageH) {
  const pw = pageW - 2 * MARGIN, ph = pageH - 2 * MARGIN;
  const labelW = (part) => Math.max(...labelLines(part).map((t, i) => {
    doc.setFont('helvetica', i ? 'normal' : 'bold'); doc.setFontSize(8);
    return doc.getTextWidth(t);
  })) + 2;
  const L = layout(result.parts, { gap: 15, maxWidth: 3 * pw - 2 * OVERLAP, labelH: LABEL_H, labelW });
  const stepX = pw - OVERLAP, stepY = ph - OVERLAP;
  const cols = Math.max(1, Math.ceil((L.width - OVERLAP) / stepX));
  const rows = Math.max(1, Math.ceil((L.height - OVERLAP) / stepY));
  const occupied = (tx, ty) => L.items.some((it) => it.dz < tx + pw && it.dz + it.w > tx && it.dy < ty + ph && it.dy + it.h > ty);

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tx = c * stepX, ty = r * stepY;
    if (!occupied(tx, ty)) continue;
    doc.addPage();
    const tag = `${ROWS[r % 26]}${c + 1}`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(`Template page ${tag}`, MARGIN + 6, MARGIN - 3);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(`Sheet ${rows} rows × ${cols} columns. Overlap strip ${OVERLAP} mm on each joining edge — match crosshairs.`, MARGIN + 40, MARGIN - 3);
    doc.text('Print at 100 %', pageW - MARGIN, pageH - MARGIN + 6, { align: 'right' });

    doc.setDrawColor(150); doc.setLineWidth(0.1);
    doc.setLineDashPattern([1, 1], 0);
    if (c > 0) doc.line(MARGIN + OVERLAP, MARGIN, MARGIN + OVERLAP, MARGIN + ph);
    if (r > 0) doc.line(MARGIN, MARGIN + OVERLAP, MARGIN + pw, MARGIN + OVERLAP);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    for (const [x, y] of [[MARGIN, MARGIN], [MARGIN + pw, MARGIN], [MARGIN, MARGIN + ph], [MARGIN + pw, MARGIN + ph],
      [MARGIN + OVERLAP, MARGIN + OVERLAP], [MARGIN + pw - OVERLAP, MARGIN + OVERLAP],
      [MARGIN + OVERLAP, MARGIN + ph - OVERLAP], [MARGIN + pw - OVERLAP, MARGIN + ph - OVERLAP]]) {
      doc.line(x - 3, y, x + 3, y); doc.line(x, y - 3, x, y + 3);
    }

    doc.saveGraphicsState();
    doc.rect(MARGIN, MARGIN, pw, ph, null); doc.clip(); doc.discardPath();
    const toPage = ([x, y]) => [MARGIN + x - tx, MARGIN + y - ty];
    for (const it of L.items) {
      doc.setDrawColor(0); doc.setLineWidth(0.25);
      for (const loop of it.part.loops) pathLoop(doc, loop.map((p) => toPage(placePoint(p, it))), 'S');
      for (const h of it.part.holes) {
        const [x, y] = toPage(placePoint([h.z, h.y], it));
        doc.setDrawColor(170, 0, 0); doc.circle(x, y, h.d / 2, 'S');
        doc.line(x - 3, y, x + 3, y); doc.line(x, y - 3, x, y + 3);
      }
      const [lx, ly] = toPage([it.dz, it.dy]);
      doc.setTextColor(0); doc.setFontSize(8);
      labelLines(it.part).forEach((t, i) => {
        doc.setFont('helvetica', i ? 'normal' : 'bold'); doc.text(t, lx, ly + 3.5 + i * 3.6);
      });
      grainArrow(doc, lx, ly + 17, it.part.grain);
    }
    doc.restoreGraphicsState();
  }
}

export function toPDF(result, params, { compress = true } = {}) {
  const format = { Letter: 'letter', A4: 'a4', A3: 'a3', A2: 'a2' }[params.paper] ?? 'a4';
  const doc = new jsPDF({ unit: 'mm', format, orientation: 'portrait', compress });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: 'Claude Box templates', creator: 'Claude Box template generator' });
  coverPage(doc, result, params, pageW, pageH);
  assemblyPage(doc, result, params, pageW, pageH);
  templatePages(doc, result, params, pageW, pageH);
  return doc;
}
