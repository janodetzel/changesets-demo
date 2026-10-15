import test from 'node:test';
import assert from 'node:assert/strict';
import { authorize, refund } from '../dist/index.mjs';

test('authorize and refund a EUR 5.90 payment without changing its amount', () => {
  const payment = authorize({ amount: 5.9 });
  assert.equal(payment.amountCents, 590);
  assert.equal(refund({ amountCents: payment.amountCents }).refundedCents, 590);
});
