import { DEFAULTS, LIMITS } from './params.js';

export const DESIGN_RATIO = DEFAULTS.D / DEFAULTS.H;

export const MATERIAL_PRESETS = Object.freeze({
  light: Object.freeze({ walnut: 6, carcass: 4, drawer: 3 }),
  standard: Object.freeze({ walnut: 10, carcass: 6, drawer: 5 }),
  heavy: Object.freeze({ walnut: 16, carcass: 10, drawer: 8 }),
});

const clamp = (key, value) => Math.min(LIMITS[key][1], Math.max(LIMITS[key][0], value));
const round = (value) => Math.round(value * 10) / 10;

export function pairedDimension(changed, value) {
  if (changed === 'H') return { D: round(clamp('D', value * DESIGN_RATIO)) };
  if (changed === 'D') return { H: round(clamp('H', value / DESIGN_RATIO)) };
  return {};
}

export function safetyStatus(warnings = []) {
  if (!warnings.length) return { state: 'good', label: 'Good to cut' };
  const text = warnings.join(' ').toLowerCase();
  if (text.includes('dowel')) return { state: 'warn', label: 'Dowel near edge' };
  if (text.includes('splits')) return { state: 'warn', label: 'Part may split' };
  if (text.includes('drawer') || text.includes('lid') || text.includes('too short')) {
    return { state: 'warn', label: 'Fit needs attention' };
  }
  return { state: 'warn', label: 'Check warnings' };
}
