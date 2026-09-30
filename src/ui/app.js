import { validate, DEFAULTS, LIMITS } from '../params.js';
import { buildBox } from '../parts.js';
import { toPDF } from '../export-pdf.js';
import { toSVG } from '../export-svg.js';
import { toDXF } from '../export-dxf.js';
import { cutList } from '../cutlist.js';
import { fmt, TIMBER_NAME } from '../labels.js';
import { bboxOf } from '../geom.js';
import { MATERIAL_PRESETS, pairedDimension, safetyStatus } from '../presets.js';
import { TIERS, groupedPartOptions, selectParts } from './view-model.js';

const FIELDS = Object.keys(LIMITS);
const $ = (id) => document.getElementById(id);
const form = $('form');
let current = null;
let viewKey = '';
let activePreset = 'standard';

function fillForm(values) {
  for (const k of FIELDS) form.elements[k].value = values[k];
  form.elements.paper.value = values.paper ?? 'A4';
  syncPresetButtons();
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
  el.classList.toggle('scrollable', el.scrollWidth > el.clientWidth + 1);
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

function syncPresetButtons() {
  const values = Object.fromEntries(['walnut', 'carcass', 'drawer'].map((k) => [k, Number(form.elements[k].value)]));
  activePreset = Object.entries(MATERIAL_PRESETS).find(([, p]) => (
    p.walnut === values.walnut && p.carcass === values.carcass && p.drawer === values.drawer
  ))?.[0] ?? '';
  document.querySelectorAll('[data-preset]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.preset === activePreset));
  });
}

function renderSafety(warnings) {
  const s = safetyStatus(warnings);
  const el = $('safety');
  el.dataset.state = s.state;
  el.textContent = s.label;
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
  renderSafety(result.warnings);
  refreshView();
  renderCutList(result);
  const w = $('warnings');
  w.hidden = !result.warnings.length;
  w.replaceChildren();
  if (result.warnings.length) {
    const head = document.createElement('p'); head.className = 'warnings-head';
    const icon = svgEl('svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    svgEl('path', { d: 'M10 3 1 18h18Z' }, icon);
    svgEl('path', { d: 'M10 8.5v4M10 15h.01' }, icon);
    head.append(icon, document.createTextNode('Check before cutting'));
    const ul = document.createElement('ul');
    for (const t of result.warnings) { const li = document.createElement('li'); li.textContent = t; ul.append(li); }
    w.append(head, ul);
  }
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(update, 150); };

form.addEventListener('input', (e) => {
  const name = e.target?.name;
  if ($('lock-proportions').checked && (name === 'H' || name === 'D')) {
    const value = Number(e.target.value);
    if (Number.isFinite(value)) {
      for (const [k, v] of Object.entries(pairedDimension(name, value))) form.elements[k].value = v;
    }
  }
  if (['walnut', 'carcass', 'drawer'].includes(name)) syncPresetButtons();
  schedule();
});
window.addEventListener('resize', () => { if (current) refreshView(); });

$('reset').addEventListener('click', () => {
  $('lock-proportions').checked = true;
  fillForm(DEFAULTS);
  viewKey = '';
  update();
});

document.querySelectorAll('[data-preset]').forEach((button) => {
  button.addEventListener('click', () => {
    form.elements.walnut.value = MATERIAL_PRESETS[button.dataset.preset].walnut;
    form.elements.carcass.value = MATERIAL_PRESETS[button.dataset.preset].carcass;
    form.elements.drawer.value = MATERIAL_PRESETS[button.dataset.preset].drawer;
    syncPresetButtons();
    update();
  });
});

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

$('pdf').addEventListener('click', () => {
  update();
  const tab = window.open('', '_blank');
  const doc = toPDF(current.result, current.params);
  const url = URL.createObjectURL(doc.output('blob'));
  if (tab) {
    tab.location.href = url;
  } else {
    downloadBlob(doc.output('blob'), 'claude-box-templates.pdf');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

$('svg').addEventListener('click', () => {
  update();
  const svg = toSVG(current.result.parts);
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), 'claude-box-templates.svg');
});

$('dxf').addEventListener('click', () => {
  update();
  const dxf = toDXF(current.result.parts);
  downloadBlob(new Blob([dxf], { type: 'application/dxf' }), 'claude-box-templates.dxf');
});

fillForm(DEFAULTS);
update();
