/** @param {number | null | undefined} value */
export function encodeAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

/** @param {string | string[] | number | null | undefined} value */
export function formatAmount(value) {
  if (value == null || Array.isArray(value) || String(value).trim() === '') return 'Manual Review';
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toLocaleString('en-US')}` : 'Manual Review';
}
