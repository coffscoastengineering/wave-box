import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGN_RATIO, MATERIAL_PRESETS, pairedDimension, safetyStatus } from '../src/presets.js';

test('design ratio is the default depth over height', () => {
  assert.equal(DESIGN_RATIO, 1.25);
});

test('pairedDimension keeps height and depth proportionate within limits', () => {
  assert.deepEqual(pairedDimension('H', 320), { D: 400 });
  assert.deepEqual(pairedDimension('D', 500), { H: 400 });
  assert.deepEqual(pairedDimension('H', 150), { D: 190 });
  assert.deepEqual(pairedDimension('H', 600), { D: 750 });
});

test('material presets give ordered safe stock thicknesses', () => {
  assert.ok(MATERIAL_PRESETS.light.walnut < MATERIAL_PRESETS.standard.walnut);
  assert.ok(MATERIAL_PRESETS.standard.walnut < MATERIAL_PRESETS.heavy.walnut);
  assert.equal(MATERIAL_PRESETS.standard.carcass, 6);
});

test('safetyStatus summarizes warnings into a compact state', () => {
  assert.deepEqual(safetyStatus([]), { state: 'good', label: 'Good to cut' });
  assert.equal(safetyStatus(['Dowel 1 hole is within 5 mm of an edge']).label, 'Dowel near edge');
  assert.equal(safetyStatus(['Bottom tier drawer does not fit']).label, 'Fit needs attention');
  assert.equal(safetyStatus(['Side splits into 2 pieces']).label, 'Part may split');
});
