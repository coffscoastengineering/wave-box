import { bboxOf } from './geom.js';

export const TIMBER_NAME = { walnut: 'Side timber', carcass: 'Carcass timber', drawer: 'Drawer timber', dowel: 'Dowel' };
export const BLOCK_ALLOWANCE = 5;

const trim = (v) => String(Number(v.toFixed(1)));

const TIER_CODE = { bottom: 'B', middle: 'M', top: 'T', sides: 'S' };
const ROLE_CODE = {
  ends: 'END',
  floor: 'FLOOR',
  top: 'TOP',
  wall: 'WALL',
  drawerFront: 'DFRONT',
  drawerSide: 'DSIDE',
  drawerBottom: 'DBOT',
  drawerBack: 'DBACK',
  lid: 'LID',
  walnut: 'SIDE',
};

export const fmt = (mm) => `${trim(mm)} mm`;
export const dims = (vals) => `${vals.map(trim).join(' × ')} mm`;

// Solid block a curved part is carved from: length × depth × height, with allowance on the profile.
export function blockDims(part) {
  const b = bboxOf(part.loops);
  return [part.length, b.z1 - b.z0 + 2 * BLOCK_ALLOWANCE, b.y1 - b.y0 + 2 * BLOCK_ALLOWANCE];
}

export function labelLines(part) {
  const lines = [`${part.name} — cut ${part.qty}`];
  const t = `${TIMBER_NAME[part.timber]} ${fmt(part.thickness)}`;
  if (part.kind === 'profile') {
    lines.push(`${t} thick`);
  } else if (part.kind === 'curved') {
    lines.push(`${t} wall, grain along length`);
    lines.push(`Carve from block ${dims(blockDims(part))}`);
  } else if (part.kind === 'board') {
    lines.push(`${t} board, ${fmt(part.length)} long`);
    lines.push(`End bevels ${part.bevels[0]}° / ${part.bevels[1]}°`);
  }
  return lines;
}

export function partCode(part) {
  if (part.templateCode) return part.templateCode;
  if (part.id === 'sides.walnut') return 'SIDE';
  const [, role = part.id] = part.id.split('.');
  return [TIER_CODE[part.tier], ROLE_CODE[role] ?? role.toUpperCase()].filter(Boolean).join('-');
}

export function templateLabelLines(part) {
  const qty = part.templateQty ?? part.qty;
  const name = part.templateName ?? part.name;
  const qtyText = qty > 1 ? ` - qty ${qty}` : '';
  return [partCode(part), name, `${TIMBER_NAME[part.timber]} ${fmt(part.thickness)}${qtyText}`];
}

// Rough label width for exporters without text metrics.
export const estimateLabelWidth = (part, charMM) => Math.max(...labelLines(part).map((l) => l.length)) * charMM;
