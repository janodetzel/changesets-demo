export function cents(value) {
  if (!Number.isFinite(value)) throw new Error('Amount must be finite');
  return Math.round(value * 100);
}
