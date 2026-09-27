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

test('unknown paper falls back to A4', () => {
  assert.equal(validate({ paper: 'A3' }).params.paper, 'A4');
  assert.equal(validate({ paper: 'Letter' }).params.paper, 'Letter');
});

test('metric only: no units setting exists', () => {
  assert.ok(!('units' in DEFAULTS));
  assert.ok(!('units' in validate({ units: 'in' }).params));
});

test('values just outside a limit are errors', () => {
  assert.ok(validate({ D: 189.99 }).errors.D);
});
