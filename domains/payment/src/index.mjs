import { cents } from '@emp/money';

export function authorize({ amount }) {
  return { status: 'authorized', amountCents: cents(amount) };
}

export function refund({ amountCents }) {
  return { refundedCents: amountCents };
}
