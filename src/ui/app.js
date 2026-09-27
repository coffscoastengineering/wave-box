import { validate, DEFAULTS, LIMITS } from '../params.js';
import { buildBox } from '../parts.js';
import { toPDF } from '../export-pdf.js';
import { toSVG } from '../export-svg.js';
import { toDXF, byTimber } from '../export-dxf.js';
import { cutList } from '../cutlist.js';
import { fmt, TIMBER_NAME } from '../labels.js';
import { bboxOf } from '../geom.js';
import { partOptions, selectParts } from './view-model.js';

const FIELDS = Object.keys(LIMITS);
const $ = (id) => document.getElementById(id);
const form = $('form');
let current = null;

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

function renderPreview(parts) {
  const b = bboxOf(parts.flatMap((p) => p.loops));
  const pad = Math.max(b.z1 - b.z0, b.y1 - b.y0) * 0.08 || 10;
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
  $('preview').replaceChildren(svg);
}

function renderPartOptions(result) {
  const sel = $('viewPart');
  const prev = sel.value;
  sel.replaceChildren(new Option('Full assembly', ''), ...partOptions(result.parts).map((o) => new Option(o.label, o.id)));
  sel.value = [...sel.options].some((o) => o.value === prev) ? prev : '';
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
    const o = new Option(`${TIMBER_NAME[t]} ${fmt(thick)}`, t);
    return o;
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
  $('overall').textContent = `Overall ${fmt(o.H)} high × ${fmt(o.D)} deep × ${fmt(o.W)} wide`;
  renderPartOptions(result);
  renderPreview(selectParts(result.parts, $('viewPart').value));
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
$('viewPart').addEventListener('input', () => renderPreview(selectParts(current.result.parts, $('viewPart').value)));

$('reset').addEventListener('click', () => { fillForm(DEFAULTS); update(); });

$('pdf').addEventListener('click', () => {
  const doc = toPDF(current.result, current.params);
  download(`claude-box-${sizeTag()}-templates.pdf`, doc.output('blob'));
});

const cncParts = () => byTimber(current.result.parts)[$('timber').value] ?? [];
$('svg').addEventListener('click', () => {
  download(`claude-box-${sizeTag()}-${$('timber').value}.svg`, toSVG(cncParts(), { title: `Claude Box ${$('timber').value}` }), 'image/svg+xml');
});
$('dxf').addEventListener('click', () => {
  download(`claude-box-${sizeTag()}-${$('timber').value}.dxf`, toDXF(cncParts()), 'application/dxf');
});

fillForm(DEFAULTS);
update();
