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

test('known paper sizes pass through, unknown falls back to A4', () => {
  for (const p of ['A4', 'A3', 'A2']) assert.equal(validate({ paper: p }).params.paper, p);
  assert.equal(validate({ paper: 'auto' }).params.paper, 'A4');
  assert.equal(validate({ paper: 'Letter' }).params.paper, 'A4');
  assert.equal(validate({ paper: 'Tabloid' }).params.paper, 'A4');
});

test('known orientations pass through, unknown falls back to auto', () => {
  for (const orientation of ['auto', 'portrait', 'landscape']) {
    assert.equal(validate({ orientation }).params.orientation, orientation);
  }
  assert.equal(validate({ orientation: 'sideways' }).params.orientation, 'auto');
});

test('metric only: no units setting exists', () => {
  assert.ok(!('units' in DEFAULTS));
  assert.ok(!('units' in validate({ units: 'in' }).params));
});

test('values just outside a limit are errors', () => {
  assert.ok(validate({ D: 189.99 }).errors.D);
});
