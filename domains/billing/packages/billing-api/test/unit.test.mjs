import assert from 'node:assert/strict';
import test from 'node:test';
import { INVOICE_CURRENCY, isInvoice } from '../src/index.mjs';

test('accepts the invoice shape billing produces', () => {
  assert.ok(isInvoice({ totalCents: 1234, currency: INVOICE_CURRENCY, description: 'Charging session invoice for current month' }));
});

test('rejects foreign shapes', () => {
  assert.equal(isInvoice(null), false);
  assert.equal(isInvoice({ totalCents: 12.5, currency: INVOICE_CURRENCY, description: 'fractional cents' }), false);
  assert.equal(isInvoice({ totalCents: 1, currency: 'USD', description: 'wrong currency' }), false);
});
