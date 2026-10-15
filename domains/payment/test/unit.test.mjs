import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize } from '../src/index.mjs';

test('authorization succeeds', () => {
  assert.equal(authorize({ amount: 5.9 }).status, 'authorized');
});
