import test from 'node:test';
import assert from 'node:assert/strict';
import { locations } from '../dist/index.mjs';

test('location proxy covers Oldenburg and Bremen', () => {
  assert.ok(locations().cities.includes('Oldenburg'));
  assert.ok(locations().cities.includes('Bremen'));
});
