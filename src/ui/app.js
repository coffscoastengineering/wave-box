import { validate, DEFAULTS, LIMITS } from '../params.js';
import { buildBox } from '../parts.js';
import { toPDF } from '../export-pdf.js';
import { toSVG } from '../export-svg.js';
import { toDXF, byTimber } from '../export-dxf.js';
import { cutList } from '../cutlist.js';
import { fmt, TIMBER_NAME } from '../labels.js';
import { bboxOf } from '../geom.js';
import { TIERS, groupedPartOptions, selectParts } from './view-model.js';

const FIELDS = Object.keys(LIMITS);
const $ = (id) => document.getElementById(id);
const form = $('form');
let current = null;
let viewKey = '';

function fillForm(values) {
  for (const k of FIELDS) form.elements[k].value = values[k];
}

function readForm() {
  const raw = { paper: form.elements.paper.value };
  for (const k of FIELDS) raw[k] = form.elements[k].value;
  return raw;
}

const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};

function buildPartsSVG(parts, { pad: padOverride } = {}) {
  const b = bboxOf(parts.flatMap((p) => p.loops));
  const pad = padOverride ?? (Math.max(b.z1 - b.z0, b.y1 - b.y0) * 0.08 || 10);
  const svg = svgEl('svg', {
    viewBox: `${b.z0 - pad} ${-b.y1 - pad} ${b.z1 - b.z0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  const g = svgEl('g', { transform: 'scale(1,-1)' }, svg);
  const order = [...parts.filter((p) => p.timber !== 'walnut'), ...parts.filter((p) => p.timber === 'walnut')];
  for (const p of order) {
    const d = p.loops.map((l) => `M${l.map(([z, y]) => `${z.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`).join('');
    const path = svgEl('path', { d, class: `part ${p.timber}`, 'fill-rule': 'evenodd' }, g);
    svgEl('title', {}, path).textContent = `${p.name} — ${TIMBER_NAME[p.timber]} ${fmt(p.thickness)}`;
    for (const h of p.holes) svgEl('circle', { cx: h.z, cy: h.y, r: h.d / 2, class: 'hole' }, g);
  }
  return { svg, bbox: b };
}

function renderPreview(parts) {
  const { svg, bbox } = buildPartsSVG(parts);
  $('preview').replaceChildren(svg);
  renderDimLine(bbox.z1 - bbox.z0);
}

function renderDimLine(depthMM) {
  const left = document.createElement('span'); left.className = 'dim-line';
  const right = document.createElement('span'); right.className = 'dim-line';
  const label = document.createElement('span'); label.className = 'dim-label num';
  label.textContent = `${Math.round(depthMM * 10) / 10} mm`;
  $('dimline').replaceChildren(left, label, right);
}

function chipIcon(part) {
  const b = bboxOf(part.loops);
  const pad = Math.max(b.z1 - b.z0, b.y1 - b.y0) * 0.12 || 2;
  return buildPartsSVG([part], { pad }).svg;
}

function tierOf(result, id) {
  for (const g of groupedPartOptions(result.parts)) if (g.options.some((o) => o.id === id)) return g.tier;
  return null;
}

function renderTabs(result) {
  const activeTier = viewKey.startsWith('tier:') ? viewKey.slice(5) : (tierOf(result, viewKey) ?? '');
  const groups = groupedPartOptions(result.parts);
  const tabs = [{ tier: '', label: 'Full assembly' }, ...TIERS.filter((t) => groups.some((g) => g.tier === t.tier))];
  $('tabs').replaceChildren(...tabs.map((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'tab'; b.textContent = t.label; b.setAttribute('role', 'tab');
    const selected = t.tier === '' ? viewKey === '' : activeTier === t.tier;
    b.setAttribute('aria-selected', String(selected));
    b.addEventListener('click', () => { viewKey = t.tier === '' ? '' : `tier:${t.tier}`; refreshView(); });
    return b;
  }));
  renderChips(result, activeTier);
}

function renderChips(result, activeTier) {
  const el = $('chips');
  const group = groupedPartOptions(result.parts).find((g) => g.tier === activeTier);
  if (!group) { el.hidden = true; el.replaceChildren(); return; }
  el.hidden = false;
  const byId = Object.fromEntries(result.parts.map((p) => [p.id, p]));
  el.replaceChildren(...group.options.map((o) => {
    const part = byId[o.id];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(viewKey === o.id));
    b.title = o.label;
    b.append(chipIcon(part));
    const label = document.createElement('span'); label.className = 'chip-label';
    label.textContent = part.tier === 'sides' ? part.name : part.name.replace(/^(Bottom|Middle|Top) tier\s*/, '');
    b.append(label);
    if (part.qty > 1) { const q = document.createElement('span'); q.className = 'qty'; q.textContent = `×${part.qty}`; b.append(q); }
    b.addEventListener('click', () => { viewKey = o.id; refreshView(); });
    return b;
  }));
}

function refreshView() {
  renderTabs(current.result);
  renderPreview(selectParts(current.result.parts, viewKey));
}

function renderCutList(result) {
  const body = $('cutlist').tBodies[0];
  body.replaceChildren(...cutList(result.parts).map((r) => {
    const tr = document.createElement('tr');
    for (const v of [r.name, r.qty, r.timber, r.finished, [r.block && `Block ${r.block}`, r.notes].filter(Boolean).join('. ')]) {
      const td = document.createElement('td'); td.textContent = v; tr.append(td);
    }
    return tr;
  }));
}

function renderTimberOptions(result) {
  const sel = $('timber');
  const prev = sel.value;
  const groups = byTimber(result.parts);
  sel.replaceChildren(...Object.keys(groups).map((t) => {
    const thick = groups[t][0].thickness;
    return new Option(`${TIMBER_NAME[t]} ${fmt(thick)}`, t);
  }));
  if (prev && groups[prev]) sel.value = prev;
}

function update() {
  const { params, errors } = validate(readForm());
  let bad = false;
  for (const k of FIELDS) {
    const input = form.elements[k];
    const msg = errors[k] ?? '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $(`${k}-err`).textContent = msg;
    if (msg) bad = true;
  }
  for (const id of ['pdf', 'svg', 'dxf']) $(id).disabled = bad;
  if (bad) return;

  const result = buildBox(params);
  current = { params, result };
  const o = result.overall;
  $('overall').textContent = `${fmt(o.H)} × ${fmt(o.D)} × ${fmt(o.W)}`;
  refreshView();
  renderCutList(result);
  renderTimberOptions(result);
  const w = $('warnings');
  w.hidden = !result.warnings.length;
  w.replaceChildren();
  if (result.warnings.length) {
    const ul = document.createElement('ul');
    for (const t of result.warnings) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
    w.append(ul);
  }
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 150); };

function sizeTag() {
  const p = current.params;
  return `${Math.round(p.H)}x${Math.round(p.D)}x${Math.round(p.W)}`;
}

function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener('input', schedule);

$('reset').addEventListener('click', () => { fillForm(DEFAULTS); viewKey = ''; update(); });

$('pdf').addEventListener('click', () => {
  update();
  const doc = toPDF(current.result, current.params);
  download(`claude-box-${sizeTag()}-templates.pdf`, doc.output('blob'));
});

const cncParts = () => byTimber(current.result.parts)[$('timber').value] ?? [];
$('svg').addEventListener('click', () => {
  update();
  download(`claude-box-${sizeTag()}-${$('timber').value}.svg`, toSVG(cncParts(), { title: `Claude Box ${$('timber').value}` }), 'image/svg+xml');
});
$('dxf').addEventListener('click', () => {
  update();
  download(`claude-box-${sizeTag()}-${$('timber').value}.dxf`, toDXF(cncParts()), 'application/dxf');
});

fillForm(DEFAULTS);
update();
