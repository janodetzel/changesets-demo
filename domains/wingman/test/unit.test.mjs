import test from 'node:test';
import assert from 'node:assert/strict';
import { locations } from '../src/index.mjs';

test('location response identifies its provider', () => {
  assert.equal(locations().provider, 'HERE');
});
