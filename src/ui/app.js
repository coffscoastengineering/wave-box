import { validate, DEFAULTS, LIMITS } from '../params.js';
import { buildBox } from '../parts.js';
import { toPDF } from '../export-pdf.js';
import { toSVG } from '../export-svg.js';
import { toDXF, byTimber } from '../export-dxf.js';
import { cutList } from '../cutlist.js';
import { fmt, TIMBER_NAME } from '../labels.js';
import { bboxOf } from '../geom.js';

const FIELDS = Object.keys(LIMITS);
const $ = (id) => document.getElementById(id);
const form = $('form');
let units = 'mm';
let current = null;

const toDisplay = (mm) => (units === 'in' ? +(mm / 25.4).toFixed(3) : +mm.toFixed(1));
const toMM = (text) => {
  const t = String(text).trim();
  if (t === '') return '';
  const v = Number(t);
  return Number.isFinite(v) ? (units === 'in' ? v * 25.4 : v) : t;
};

function fillForm(mmValues) {
  for (const k of FIELDS) form.elements[k].value = toDisplay(mmValues[k]);
  for (const el of form.querySelectorAll('.unit')) el.textContent = units === 'in' ? 'in' : 'mm';
}

function readForm() {
  const raw = { units, paper: form.elements.paper.value };
  for (const k of FIELDS) raw[k] = toMM(form.elements[k].value);
  return raw;
}

function rangeMsg(k) {
  const [lo, hi] = LIMITS[k];
  return `Use ${toDisplay(lo)}–${toDisplay(hi)} ${units === 'in' ? 'in' : 'mm'}`;
}

const svgEl = (tag, attrs = {}, parent) => {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.append(el);
  return el;
};

function renderPreview(result) {
  const solid = result.parts.filter((p) => p.loops.length);
  const b = bboxOf(solid.flatMap((p) => p.loops));
  const pad = Math.max(b.z1 - b.z0, b.y1 - b.y0) * 0.08;
  const svg = svgEl('svg', {
    viewBox: `${b.z0 - pad} ${-b.y1 - pad} ${b.z1 - b.z0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}`,
    preserveAspectRatio: 'xMidYMid meet',
  });
  const g = svgEl('g', { transform: 'scale(1,-1)' }, svg);
  const order = [...solid.filter((p) => p.timber !== 'walnut'), ...solid.filter((p) => p.timber === 'walnut')];
  for (const p of order) {
    const d = p.loops.map((l) => `M${l.map(([z, y]) => `${z.toFixed(2)} ${y.toFixed(2)}`).join('L')}Z`).join('');
    const path = svgEl('path', { d, class: `part ${p.timber}`, 'fill-rule': 'evenodd' }, g);
    svgEl('title', {}, path).textContent = `${p.name} — ${TIMBER_NAME[p.timber]} ${fmt(p.thickness, units)}`;
  }
  const walnut = solid.find((p) => p.id === 'sides.walnut');
  for (const h of walnut?.holes ?? []) svgEl('circle', { cx: h.z, cy: h.y, r: h.d / 2, class: 'hole' }, g);
  $('preview').replaceChildren(svg);
}

function renderCutList(result) {
  const body = $('cutlist').tBodies[0];
  body.replaceChildren(...cutList(result.parts, units).map((r) => {
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
    const o = new Option(`${TIMBER_NAME[t]} ${fmt(thick, units)}`, t);
    return o;
  }));
  if (prev && groups[prev]) sel.value = prev;
}

function update() {
  const { params, errors } = validate(readForm());
  let bad = false;
  for (const k of FIELDS) {
    const input = form.elements[k];
    const msg = errors[k] ? (errors[k] === 'Enter a number' ? 'Enter a number' : rangeMsg(k)) : '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    $(`${k}-err`).textContent = msg;
    if (msg) bad = true;
  }
  for (const id of ['pdf', 'svg', 'dxf']) $(id).disabled = bad;
  if (bad) return;

  const result = buildBox(params);
  current = { params, result };
  const o = result.overall;
  $('overall').textContent = `Overall ${fmt(o.H, units)} high × ${fmt(o.D, units)} deep × ${fmt(o.W, units)} wide`;
  renderPreview(result);
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

form.addEventListener('input', (e) => {
  if (e.target.name === 'units') {
    const mm = {};
    for (const k of FIELDS) {
      const v = toMM(form.elements[k].value);
      mm[k] = typeof v === 'number' ? v : DEFAULTS[k];
    }
    units = e.target.value;
    fillForm(mm);
    update();
    return;
  }
  schedule();
});

$('reset').addEventListener('click', () => { fillForm(DEFAULTS); update(); });

$('pdf').addEventListener('click', () => {
  const doc = toPDF(current.result, { ...current.params, units });
  download(`claude-box-${sizeTag()}-templates.pdf`, doc.output('blob'));
});

const cncParts = () => byTimber(current.result.parts)[$('timber').value] ?? [];
$('svg').addEventListener('click', () => {
  download(`claude-box-${sizeTag()}-${$('timber').value}.svg`, toSVG(cncParts(), { units, title: `Claude Box ${$('timber').value}` }), 'image/svg+xml');
});
$('dxf').addEventListener('click', () => {
  download(`claude-box-${sizeTag()}-${$('timber').value}.dxf`, toDXF(cncParts(), { units }), 'application/dxf');
});

fillForm(DEFAULTS);
update();
