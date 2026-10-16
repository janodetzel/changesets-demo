// Public billing contract. External consumers install this package from
// GitHub Packages instead of importing billing's source, mirroring EMP's
// per-domain api packages.
export const INVOICE_CURRENCY = 'EUR';

export function isInvoice(value) {
  return Boolean(value)
    && Number.isInteger(value.totalCents)
    && value.totalCents >= 0
    && value.currency === INVOICE_CURRENCY
    && typeof value.description === 'string';
}

export function isAuthorized(value) {
  return Boolean(value)
    && value.status === 'authorized'
    && Number.isInteger(value.amountCents)
    && value.amountCents >= 0;
}
