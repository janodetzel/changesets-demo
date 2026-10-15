import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoice } from '../src/index.mjs';

test('empty charging session costs zero', () => {
  assert.equal(createInvoice({ kwh: 0, price: 0.59 }).totalCents, 0);
});
