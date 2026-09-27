import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, DEFAULTS } from '../src/params.js';

test('defaults validate cleanly', () => {
  const { params, errors } = validate({});
  assert.deepEqual(params, DEFAULTS);
  assert.deepEqual(errors, {});
});

test('non-numeric input falls back to default with an error', () => {
  const { params, errors } = validate({ H: 'abc' });
  assert.equal(params.H, 300);
  assert.ok(errors.H);
});

test('empty string is an error, not zero', () => {
  const { params, errors } = validate({ D: '' });
  assert.equal(params.D, 375);
  assert.ok(errors.D);
});

test('out of range is clamped with an error', () => {
  const { params, errors } = validate({ H: 1000, carcass: 1 });
  assert.equal(params.H, 600);
  assert.equal(params.carcass, 3);
  assert.ok(errors.H && errors.carcass);
});

test('numeric strings parse', () => {
  const { params, errors } = validate({ carcass: '8', W: ' 250.5 ' });
  assert.equal(params.carcass, 8);
  assert.equal(params.W, 250.5);
  assert.deepEqual(errors, {});
});

test('unknown units and paper fall back', () => {
  const { params } = validate({ units: 'furlongs', paper: 'A3' });
  assert.equal(params.units, 'mm');
  assert.equal(params.paper, 'A4');
  assert.equal(validate({ units: 'in', paper: 'Letter' }).params.units, 'in');
});

test('values within 0.05 mm of a limit (inch round-trip) are accepted and snapped', () => {
  const { params, errors } = validate({ D: 189.992, W: 119.99, carcass: 2.997, H: 600.011 });
  assert.deepEqual(errors, {});
  assert.equal(params.D, 190); assert.equal(params.W, 120); assert.equal(params.carcass, 3); assert.equal(params.H, 600);
  assert.ok(validate({ D: 189.9 }).errors.D);
});
