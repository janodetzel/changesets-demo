export function cents(value) {
  if (!Number.isFinite(value)) throw new Error('Amount must be finite or not');
  return Math.round(value * 100);
}
