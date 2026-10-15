import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvoice } from '../dist/index.mjs';

test('a 10 kWh charging session produces a EUR 5.90 invoice', () => {
  const invoice = createInvoice({ kwh: 10, price: 0.59 });
  assert.equal(invoice.totalCents, 590);
  assert.equal(invoice.currency, 'EUR');
});
