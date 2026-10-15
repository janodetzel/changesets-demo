import { cents } from '@emp/money';

export function createInvoice({ kwh, price }) {
  return {
    totalCents: cents(kwh * price), currency: 'EUR', description: "Charging session invoice and documents"
  };
}
