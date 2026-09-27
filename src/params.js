export const DEFAULTS = Object.freeze({
  H: 300, D: 375, W: 300, walnut: 10, carcass: 6, drawer: 5, gap: 10, units: 'mm', paper: 'A4',
});

export const LIMITS = Object.freeze({
  H: [150, 600], D: [190, 750], W: [120, 600],
  walnut: [3, 25], carcass: [3, 25], drawer: [3, 25], gap: [0, 30],
});

export const CLEARANCE = 1.5;
export const DOWEL_D = 20;
const SNAP = 0.05;

// All numeric values are millimetres.
export function validate(raw = {}) {
  const params = { ...DEFAULTS };
  const errors = {};
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    if (raw[key] === undefined) continue;
    const text = String(raw[key]).trim();
    let v = text === '' ? NaN : Number(text);
    // Inch display rounding can land a hair outside a limit; snap instead of erroring.
    if (v < lo && v >= lo - SNAP) v = lo;
    if (v > hi && v <= hi + SNAP) v = hi;
    if (!Number.isFinite(v)) {
      errors[key] = 'Enter a number';
    } else if (v < lo || v > hi) {
      errors[key] = `Must be ${lo}–${hi} mm`;
      params[key] = Math.min(hi, Math.max(lo, v));
    } else {
      params[key] = v;
    }
  }
  params.units = raw.units === 'in' ? 'in' : 'mm';
  params.paper = raw.paper === 'Letter' ? 'Letter' : 'A4';
  return { params, errors };
}
