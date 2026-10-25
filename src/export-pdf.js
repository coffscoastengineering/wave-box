import { jsPDF } from 'jspdf';
import { layout, placePoint, holePoint } from './layout.js';
import { fmt, partCode, templateLabelLines } from './labels.js';
import { cutList, assemblySteps } from './cutlist.js';
import { bboxOf } from './geom.js';
import { PAPERS } from './params.js';

const MARGIN = 5;
const OVERLAP = 5;
const TEMPLATE_TOP_BAND = 5;
const TEMPLATE_BOTTOM_BAND = 2;
const TEMPLATE_MARK_SAFE = 12;
const TEMPLATE_MIN_FRAGMENT_AREA = 1600;
const LABEL_MIN_W = 26;
const LABEL_MIN_H = 10;
const TEMPLATE_GAP = 5;
const TAG_COLORS = { walnut: [130, 78, 40], carcass: [178, 146, 82], drawer: [82, 138, 184] };
const ROWS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PAPER_FORMAT = Object.fromEntries(PAPERS.map((p) => [p, p.toLowerCase()]));
const ORIENTATIONS = ['portrait', 'landscape'];

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

function cutListPage(doc, result, pageW, pageH) {
  doc.addPage();
  header(doc, 'Cut list', pageW);
  let y = MARGIN + 18;
  const cols = [MARGIN, MARGIN + 58, MARGIN + 67, MARGIN + 96, MARGIN + 139];
  const heads = ['Part', 'Qty', 'Timber', 'Finished size', 'Block / notes'];
  const row = (cells, bold) => {
    const fontSize = bold ? 7.4 : 6.6;
    const lineH = bold ? 3.2 : 2.75;
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(fontSize); doc.setTextColor(0);
    const wrapped = cells.map((c, i) => doc.splitTextToSize(String(c), (cols[i + 1] ?? pageW - MARGIN) - cols[i] - 2));
    const h = Math.max(...wrapped.map((w) => w.length)) * lineH + 0.8;
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

function tagColor(part) {
  return TAG_COLORS[part.timber] ?? [0, 0, 0];
}

function pointInLoop(loop, z, y) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [zi, yi] = loop[i], [zj, yj] = loop[j];
    const crosses = (yi > y) !== (yj > y) && z < ((zj - zi) * (y - yi)) / (yj - yi) + zi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInPart(part, z, y) {
  return part.loops.reduce((inside, loop) => (pointInLoop(loop, z, y) ? !inside : inside), false);
}

function bestLabelPoint(part, box) {
  const cols = 9, rows = 7;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  let best = null;
  for (let ry = 0; ry < rows; ry++) for (let cxIndex = 0; cxIndex < cols; cxIndex++) {
    const z = box.x0 + ((cxIndex + 0.5) / cols) * (box.x1 - box.x0);
    const y = box.y0 + ((ry + 0.5) / rows) * (box.y1 - box.y0);
    if (!pointInPart(part, z, y)) continue;
    const edge = Math.min(z - box.x0, box.x1 - z, y - box.y0, box.y1 - y);
    const center = Math.hypot(z - cx, y - cy) * 0.01;
    const score = edge - center;
    if (!best || score > best.score) best = { z, y, score };
  }
  return best;
}

// Decide what label (if any) fits inside the part's visible area on one tile.
function planInternalLabel(it, tx, ty, pw, ph) {
  const outline = {
    x0: it.dz,
    y0: it.dy + it.labelH,
    x1: it.dz + (it.b.z1 - it.b.z0),
    y1: it.dy + it.labelH + (it.b.y1 - it.b.y0),
  };
  const x0 = Math.max(outline.x0, tx), y0 = Math.max(outline.y0, ty);
  const x1 = Math.min(outline.x1, tx + pw), y1 = Math.min(outline.y1, ty + ph);
  const w = x1 - x0, h = y1 - y0;
  if (w < LABEL_MIN_W || h < LABEL_MIN_H) return null;

  const pick = bestLabelPoint(it.part, { x0: x0 - it.dz + it.b.z0, y0: it.b.y1 - (y1 - it.dy - it.labelH), x1: x1 - it.dz + it.b.z0, y1: it.b.y1 - (y0 - it.dy - it.labelH) });
  if (!pick) return null;

  const qty = it.part.templateQty ?? it.part.qty;
  const compact = qty > 1 ? [partCode(it.part), `qty ${qty}`] : [partCode(it.part)];
  const text = w >= 58 && h >= 18 ? templateLabelLines(it.part) : compact;
  const longest = Math.max(...text.map((line) => line.length));
  const font = Math.min(7.5, h / (text.length * 1.35), w / (longest * 0.52));
  if (font < 3.8) return null;
  return { text, font, at: placePoint([pick.z, pick.y], it), color: tagColor(it.part) };
}

// Thin boards have no room inside their outline: put a one-line code just outside it,
// above if that is on the page, otherwise below.
function planExternalLabel(it, tx, ty, pw, ph) {
  const top = it.dy + it.labelH, bottom = top + (it.b.y1 - it.b.y0);
  const x0 = Math.max(it.dz, tx) + 1, x1 = Math.min(it.dz + (it.b.z1 - it.b.z0), tx + pw) - 1;
  if (x1 - x0 < 12) return null;
  const qty = it.part.templateQty ?? it.part.qty;
  const text = [qty > 1 ? `${partCode(it.part)} x${qty}` : partCode(it.part)];
  const font = Math.min(5, (x1 - x0) / (text[0].length * 0.52));
  if (font < 3) return null;
  let y = top - 1.6;
  if (y < ty + 1.5) y = bottom + 2.4;
  if (y > ty + ph - 1.5) return null;
  return { text, font, at: [(x0 + x1) / 2, y], color: tagColor(it.part) };
}

function drawLabel(doc, label, toPage) {
  const { text, font, at, color } = label;
  const lineH = font * 1.22;
  doc.setTextColor(...color);
  text.forEach((line, i) => {
    doc.setFont('helvetica', i ? 'normal' : 'bold');
    doc.setFontSize(i ? font * 0.9 : font);
    const [px, py] = toPage(at);
    doc.text(line, px, py + (i - (text.length - 1) / 2) * lineH, { align: 'center', baseline: 'middle' });
  });
}

export function instructionsPDF(result, params, { compress = true } = {}) {
  const paper = PAPER_FORMAT[params.paper] ? params.paper : 'A4';
  const orientation = ORIENTATIONS.includes(params.orientation) ? params.orientation : 'portrait';
  const doc = new jsPDF({ unit: 'mm', format: PAPER_FORMAT[paper], orientation, compress });
  const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
  doc.setProperties({ title: 'Claude Box instructions', creator: 'Claude Box template generator' });
  header(doc, 'Claude Box — instructions', pageW);
  let y = MARGIN + 18;
  const put = (text, gap, size = 9.5) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, pageW - 2 * MARGIN);
    if (y + lines.length * 4.4 > pageH - MARGIN) {
      doc.addPage();
      header(doc, 'Instructions (continued)', pageW);
      y = MARGIN + 16;
    }
    doc.text(lines, MARGIN, y);
    y += lines.length * 4.4 + gap;
  };
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0);
  put(`Overall ${fmt(result.overall.H)} high × ${fmt(result.overall.D)} deep × ${fmt(result.overall.W)} wide`, 2, 10);
  if (result.warnings.length) {
    doc.setTextColor(170, 0, 0);
    put('Check before cutting', 0.5);
    doc.setFont('helvetica', 'normal');
    for (const w of result.warnings) put(`• ${w}`, 0.5);
    doc.setTextColor(0);
  }
  doc.setFont('helvetica', 'normal');
  y += 2;
  assemblySteps(params).forEach((step, i) => put(`${i + 1}. ${step}`, 2));
  cutListPage(doc, result, pageW, pageH);
  return doc;
}

export function printableTemplateParts(parts) {
  const groups = new Map();
  const rounded = (v) => Number(v.toFixed(3));
  const asPrintable = (part) => {
    if (!part.holes.some((h) => h.face === 'plan')) return part;
    const b = bboxOf(part.loops);
    return {
      ...part,
      loops: [[[0, b.z0], [part.length, b.z0], [part.length, b.z1], [0, b.z1]]],
      holes: part.holes.filter((h) => h.face === 'plan'),
      templateName: `${part.name} face drill locations`,
    };
  };

  for (const source of parts) {
    const part = asPrintable(source);
    if (!part.loops.length) continue;
    const b = bboxOf(part.loops);
    const key = JSON.stringify({
      kind: part.kind,
      timber: part.timber,
      thickness: rounded(part.thickness),
      length: rounded(part.length),
      grain: part.grain,
      bevels: part.bevels.map(rounded),
      loops: part.loops.map((loop) => loop.map(([z, y]) => [rounded(z - b.z0), rounded(y - b.y0)])),
      holes: part.holes.map((h) => [rounded(h.z - b.z0), rounded(h.y - b.y0), rounded(h.d)]).sort(),
    });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(part);
  }

  return [...groups.values()].map((group) => {
    const [first] = group;
    const totalQty = group.reduce((sum, part) => sum + part.qty, 0);
    const codes = [...new Set(group.map(partCode))];
    const names = [...new Set(group.map((part) => part.name))];
    const clone = {
      ...first,
      qty: totalQty,
      templateQty: totalQty,
    };
    if (group.length > 1) {
      clone.templateCode = codes.length <= 3 ? codes.join(' / ') : `${codes.slice(0, 3).join(' / ')} +${codes.length - 3}`;
      clone.templateName = names.length <= 2 ? names.join(' / ') : `${names.slice(0, 2).join(' / ')} +${names.length - 2}`;
    }
    return clone;
  });
}

function tileCount(length, pageLength, step, offset) {
  return Math.max(1, Math.ceil((length - pageLength + offset) / step) + 1);
}

function templateTileRects(score) {
  const rects = [];
  for (let r = 0; r < score.rows; r++) for (let c = 0; c < score.cols; c++) {
    const tx = c * score.stepX - score.offsetX;
    const ty = r * score.stepY - score.offsetY;
    if (score.occupied(tx, ty)) rects.push({ r, c, tx, ty });
  }
  return rects;
}

function rectIntersectionArea(a, b) {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0);
  const x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

function itemRect(it) {
  return { x0: it.dz, y0: it.dy, x1: it.dz + it.w, y1: it.dy + it.h };
}

function templateScoreDetails(score) {
  const rects = templateTileRects(score);
  let tinyFragments = 0;
  for (const rect of rects) {
    const tile = { x0: rect.tx, y0: rect.ty, x1: rect.tx + score.pw, y1: rect.ty + score.ph };
    const visible = score.L.items.reduce((sum, it) => sum + rectIntersectionArea(itemRect(it), tile), 0);
    if (visible > 0 && visible < 1200) tinyFragments += 1200 - visible;
  }

  let holeRisk = 0;
  score.L.items.forEach((it) => {
    it.part.holes.forEach((hole) => {
      const [hx, hy] = holePoint(hole, it);
      const requiredClearance = holeRequiredClearance(hole);
      const bestClearance = rects.reduce((best, rect) => {
        if (hx < rect.tx || hx > rect.tx + score.pw || hy < rect.ty || hy > rect.ty + score.ph) return best;
        const clearance = Math.min(hx - rect.tx, rect.tx + score.pw - hx, hy - rect.ty, rect.ty + score.ph - hy);
        return Math.max(best, clearance);
      }, -Infinity);
      if (bestClearance < requiredClearance) holeRisk += (requiredClearance - bestClearance) ** 2 * 1000;
      if (bestClearance < TEMPLATE_MARK_SAFE) holeRisk += (TEMPLATE_MARK_SAFE - bestClearance) ** 2;
    });
  });

  return { tinyFragments, holeRisk };
}

function holeRequiredClearance(hole) {
  return hole.d / 2 + (hole.face === 'plan' ? 5 : 1);
}

function computeTemplateLayout(result, pageW, pageH) {
  const px = MARGIN;
  const py = MARGIN + TEMPLATE_TOP_BAND;
  const pw = pageW - 2 * MARGIN;
  const ph = pageH - py - MARGIN - TEMPLATE_BOTTOM_BAND;
  const stepX = pw - OVERLAP, stepY = ph - OVERLAP;
  const printable = printableTemplateParts(result.parts);
  let best = null;
  for (let maxCols = 1; maxCols <= 8; maxCols++) {
    const maxWidth = maxCols * pw - (maxCols - 1) * OVERLAP;
    const L = layout(printable, { gap: TEMPLATE_GAP, maxWidth, labelH: 0, labelW: () => 0 });
    L.items.forEach((it, i) => { it.templateIndex = i; });
    const offsetCandidates = (step) => [...new Set([
      0,
      OVERLAP,
      step * 0.25,
      step * 0.5,
      step * 0.75,
      ...Array.from({ length: Math.ceil(step / 10) }, (_, i) => i * 10),
    ].map((v) => Math.max(0, Math.min(step - 1, Math.round(v)))))];
    const offsetsX = offsetCandidates(stepX);
    const offsetsY = offsetCandidates(stepY);
    for (const offsetX of offsetsX) for (const offsetY of offsetsY) {
      const cols = tileCount(L.width, pw, stepX, offsetX);
      const rows = tileCount(L.height, ph, stepY, offsetY);
      const occupied = (tx, ty) => L.items.some((it) => it.dz < tx + pw && it.dz + it.w > tx && it.dy < ty + ph && it.dy + it.h > ty);
      let pages = 0;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (occupied(c * stepX - offsetX, r * stepY - offsetY)) pages++;
      }
      if (best && pages > best.pages) continue; // pages decide first; skip the costly risk scoring
      const score = { pages, area: L.width * L.height, cols, rows, L, occupied, pw, ph, px, py, stepX, stepY, offsetX, offsetY };
      const details = templateScoreDetails(score);
      score.holeRisk = details.holeRisk;
      score.tinyFragments = details.tinyFragments;
      if (!best
        || pages < best.pages
        || (pages === best.pages && score.holeRisk < best.holeRisk)
        || (pages === best.pages && score.holeRisk === best.holeRisk && score.tinyFragments < best.tinyFragments)
        || (pages === best.pages && score.holeRisk === best.holeRisk && score.tinyFragments === best.tinyFragments && score.area < best.area)) {
        best = score;
      }
    }
  }
  return best;
}

// The layout search is the expensive part; page counts and the PDF share it per box result.
const layoutCache = new WeakMap();
function templateLayout(result, pageW, pageH) {
  if (!layoutCache.has(result)) layoutCache.set(result, new Map());
  const cache = layoutCache.get(result), key = `${pageW}x${pageH}`;
  if (!cache.has(key)) cache.set(key, computeTemplateLayout(result, pageW, pageH));
  return cache.get(key);
}

function templatePages(doc, layoutScore, pageW, pageH) {
  const { L, rows, cols, occupied, pw, ph, px, py, stepX, stepY, offsetX, offsetY } = layoutScore;
  const rects = templateTileRects(layoutScore);
  const holePageKeys = new Map();
  const bestLabelPage = new Map();
  L.items.forEach((it) => {
    const item = itemRect(it);
    const tiles = rects.map((rect) => {
      const tile = { x0: rect.tx, y0: rect.ty, x1: rect.tx + pw, y1: rect.ty + ph };
      return { key: `${rect.r}:${rect.c}`, rect, visible: rectIntersectionArea(item, tile) };
    }).filter((v) => v.visible > 0).sort((a, b) => b.visible - a.visible);
    // Prefer the page showing most of the part; if no label fits there, try the others.
    for (const plan of [planInternalLabel, planExternalLabel]) {
      for (const minArea of [TEMPLATE_MIN_FRAGMENT_AREA, 0]) {
        for (const v of tiles) {
          if (v.visible < minArea) continue;
          const label = plan(it, v.rect.tx, v.rect.ty, pw, ph);
          if (label) { bestLabelPage.set(it.templateIndex, { key: v.key, label }); return; }
        }
      }
    }
  });
  L.items.forEach((it) => {
    it.part.holes.forEach((hole, hi) => {
      const [hx, hy] = holePoint(hole, it);
      let best = null;
      const touches = [];
      const requiredClearance = holeRequiredClearance(hole);
      const radius = hole.d / 2;
      for (const rect of rects) {
        const key = `${rect.r}:${rect.c}`;
        const circleBox = { x0: hx - radius, y0: hy - radius, x1: hx + radius, y1: hy + radius };
        const tile = { x0: rect.tx, y0: rect.ty, x1: rect.tx + pw, y1: rect.ty + ph };
        if (rectIntersectionArea(circleBox, tile) > 0) touches.push(key);
        if (hx < rect.tx || hx > rect.tx + pw || hy < rect.ty || hy > rect.ty + ph) continue;
        const clearance = Math.min(hx - rect.tx, rect.tx + pw - hx, hy - rect.ty, rect.ty + ph - hy);
        if (!best || clearance > best.clearance) best = { key, clearance };
      }
      if (best?.clearance >= requiredClearance) holePageKeys.set(`${it.templateIndex}:${hi}`, new Set([best.key]));
      else if (touches.length) holePageKeys.set(`${it.templateIndex}:${hi}`, new Set(touches));
      else if (best) holePageKeys.set(`${it.templateIndex}:${hi}`, new Set([best.key]));
    });
  });

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const tx = c * stepX - offsetX, ty = r * stepY - offsetY;
    if (!occupied(tx, ty)) continue;
    doc.addPage();
    const tag = `${ROWS[r % 26]}${c + 1}`;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0);
    doc.text(tag, MARGIN + 6, MARGIN + 2);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(90);
    doc.text(`Match crosshairs in the ${OVERLAP} mm overlap`, MARGIN + 22, MARGIN + 2);
    doc.setDrawColor(150); doc.setLineWidth(0.1);
    doc.setLineDashPattern([1, 1], 0);
    if (c > 0) doc.line(px + OVERLAP, py, px + OVERLAP, py + ph);
    if (r > 0) doc.line(px, py + OVERLAP, px + pw, py + OVERLAP);
    doc.setLineDashPattern([], 0);
    doc.setDrawColor(0); doc.setLineWidth(0.2);
    for (const [x, y] of [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph],
      [px + OVERLAP, py + OVERLAP], [px + pw - OVERLAP, py + OVERLAP],
      [px + OVERLAP, py + ph - OVERLAP], [px + pw - OVERLAP, py + ph - OVERLAP]]) {
      doc.line(x - 3, y, x + 3, y); doc.line(x, y - 3, x, y + 3);
    }

    doc.saveGraphicsState();
    doc.rect(px, py, pw, ph, null); doc.clip(); doc.discardPath();
    const toPage = ([x, y]) => [px + x - tx, py + y - ty];
    for (const it of L.items) {
      doc.setDrawColor(0); doc.setLineWidth(0.25);
      for (const loop of it.part.loops) pathLoop(doc, loop.map((p) => toPage(placePoint(p, it))), 'S');
      for (const [hi, h] of it.part.holes.entries()) {
        if (!holePageKeys.get(`${it.templateIndex}:${hi}`)?.has(`${r}:${c}`)) continue;
        const [x, y] = toPage(holePoint(h, it));
        doc.setDrawColor(170, 0, 0); doc.circle(x, y, h.d / 2, 'S');
        doc.line(x - 3, y, x + 3, y); doc.line(x, y - 3, x, y + 3);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(4.5);
        doc.setTextColor(170, 0, 0);
        if (h.face === 'plan') doc.text('INTER-TIER', x, y - h.d / 2 - 2, { align: 'center' });
        if (h.depth) doc.text(`${h.depth} mm deep`, x, y + h.d / 2 + 3, { align: 'center' });
      }
      const planned = bestLabelPage.get(it.templateIndex);
      if (planned?.key === `${r}:${c}`) drawLabel(doc, planned.label, toPage);
    }
    doc.restoreGraphicsState();
  }
}

// Cheapest paper/orientation for the request, decided from layouts alone (no PDF drawing).
function bestPlan(result, params) {
  const papers = PAPER_FORMAT[params.paper] ? [params.paper] : PAPERS;
  const orientations = ORIENTATIONS.includes(params.orientation) ? [params.orientation] : ORIENTATIONS;
  let best = null;
  for (const paper of papers) for (const orientation of orientations) {
    const { internal: { pageSize } } = new jsPDF({ unit: 'mm', format: PAPER_FORMAT[paper], orientation });
    const pageW = pageSize.getWidth(), pageH = pageSize.getHeight();
    const score = templateLayout(result, pageW, pageH);
    const area = pageW * pageH;
    if (!best || score.pages < best.score.pages || (score.pages === best.score.pages && area < best.area)) {
      best = { paper, orientation, pageW, pageH, area, score };
    }
  }
  return best;
}

export const templatePageCount = (result, params) => bestPlan(result, params).score.pages;

export function toPDF(result, params, { compress = true } = {}) {
  const { paper, orientation, pageW, pageH, score } = bestPlan(result, params);
  const doc = new jsPDF({ unit: 'mm', format: PAPER_FORMAT[paper], orientation, compress });
  doc.setProperties({ title: 'Claude Box templates', creator: 'Claude Box template generator' });
  templatePages(doc, score, pageW, pageH);
  if (doc.getNumberOfPages() > 1) doc.deletePage(1);
  return doc;
}
