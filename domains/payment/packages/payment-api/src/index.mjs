// Public payment contract. External consumers install this package from
// GitHub Packages instead of importing payment's source, mirroring EMP's
// per-domain api packages.
export const AUTHORIZED = 'authorized';

export function isAuthorization(value) {
  return Boolean(value)
    && value.status === AUTHORIZED
    && Number.isInteger(value.amountCents)
    && value.amountCents >= 0;
}

export function isRefund(value) {
  return Boolean(value)
    && Number.isInteger(value.refundedCents)
    && value.refundedCents >= 0;
}
