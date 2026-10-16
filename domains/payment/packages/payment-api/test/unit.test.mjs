import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTHORIZED, isAuthorization, isRefund } from '../src/index.mjs';

test('accepts the authorization shape payment produces', () => {
  assert.ok(isAuthorization({ status: AUTHORIZED, amountCents: 590 }));
});

test('accepts the refund shape payment produces', () => {
  assert.ok(isRefund({ refundedCents: 590 }));
});

test('rejects foreign shapes', () => {
  assert.equal(isAuthorization(null), false);
  assert.equal(isAuthorization({ status: 'declined', amountCents: 590 }), false);
  assert.equal(isRefund({ refundedCents: 5.9 }), false);
});
