import { bboxOf } from './geom.js';

export const TIMBER_NAME = { walnut: 'Walnut', carcass: 'Carcass timber', drawer: 'Drawer timber', dowel: 'Dowel' };
export const BLOCK_ALLOWANCE = 5;

const trim = (v, dp) => String(Number(v.toFixed(dp)));

export function fmt(mm, units) {
  return units === 'in' ? `${(mm / 25.4).toFixed(2)}"` : `${trim(mm, 1)} mm`;
}

export function dims(vals, units) {
  const f = (mm) => (units === 'in' ? (mm / 25.4).toFixed(2) : trim(mm, 1));
  return `${vals.map(f).join(' × ')}${units === 'in' ? '"' : ' mm'}`;
}

// Solid block a curved part is carved from: length × depth × height, with allowance on the profile.
export function blockDims(part) {
  const b = bboxOf(part.loops);
  return [part.length, b.z1 - b.z0 + 2 * BLOCK_ALLOWANCE, b.y1 - b.y0 + 2 * BLOCK_ALLOWANCE];
}

export function labelLines(part, units) {
  const lines = [`${part.name} — cut ${part.qty}`];
  const t = `${TIMBER_NAME[part.timber]} ${fmt(part.thickness, units)}`;
  if (part.kind === 'profile') {
    lines.push(`${t} thick`);
  } else if (part.kind === 'curved') {
    lines.push(`${t} wall, grain along length`);
    lines.push(`Carve from block ${dims(blockDims(part), units)}`);
  } else if (part.kind === 'board') {
    lines.push(`${t} board, ${fmt(part.length, units)} long`);
    lines.push(`End bevels ${part.bevels[0]}° / ${part.bevels[1]}°`);
  }
  return lines;
}

// Rough label width for exporters without text metrics.
export const estimateLabelWidth = (part, units, charMM) => Math.max(...labelLines(part, units).map((l) => l.length)) * charMM;
