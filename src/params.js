export const DEFAULTS = Object.freeze({
  H: 300, D: 375, W: 300, walnut: 10, carcass: 6, drawer: 5, gap: 10, paper: 'A4', orientation: 'auto',
});

export const PAPERS = Object.freeze(['A4', 'A3', 'A2']);

export const LIMITS = Object.freeze({
  H: [150, 600], D: [190, 750], W: [120, 600],
  walnut: [3, 25], carcass: [3, 25], drawer: [3, 25], gap: [0, 30],
});

export const CLEARANCE = 1.5;
export const DOWEL_D = 20;
// Fixed lengths measured from the real dowel bodies in the "Box Revision" Fusion
// file, not scaled with timber thickness — matches the physical hardware as modeled.
export const DOWEL_LEN_SIDE = 16;
export const DOWEL_LEN_INTERTIER = 14;

// All numeric values are millimetres.
export function validate(raw = {}) {
  const params = { ...DEFAULTS };
  const errors = {};
  for (const [key, [lo, hi]] of Object.entries(LIMITS)) {
    if (raw[key] === undefined) continue;
    const text = String(raw[key]).trim();
    const v = text === '' ? NaN : Number(text);
    if (!Number.isFinite(v)) {
      errors[key] = 'Enter a number';
    } else if (v < lo || v > hi) {
      errors[key] = `Use ${lo}–${hi} mm`;
      params[key] = Math.min(hi, Math.max(lo, v));
    } else {
      params[key] = v;
    }
  }
  params.paper = PAPERS.includes(raw.paper) ? raw.paper : 'A4';
  params.orientation = ['auto', 'portrait', 'landscape'].includes(raw.orientation) ? raw.orientation : 'auto';
  return { params, errors };
}
