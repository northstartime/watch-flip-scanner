// New rows require the full mobile contract; existing rows require safe identity only.
export function inspectFeedValidation(rows) { return inspectRows(rows, true); }
export function inspectPreservedFeedValidation(rows) { return inspectRows(rows, false); }
function inspectRows(rows, strict) {
  if (!Array.isArray(rows) || rows.length > 5000) return { code: 'FEED_SHAPE_INVALID' };
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { code: 'FEED_ROW_INVALID', row: index + 1, fields: [{ field: 'row', reason: 'object_required' }] };
    const fields = [];
    const reject = (field, valid, expected) => {
      if (!valid) fields.push({ field, reason: !Object.hasOwn(row, field) ? 'missing' : row[field] === null ? 'null_not_allowed' : expected });
    };
    reject('id', ['string', 'number'].includes(typeof row.id) && Boolean(String(row.id)), 'id_required');
    if (strict) {
      for (const field of ['title', 'decision', 'source', 'url']) reject(field, typeof row[field] === 'string', 'string_required');
      for (const field of ['price', 'marketValue', 'projectedProfit']) reject(field, row[field] === null || (typeof row[field] === 'number' && Number.isFinite(row[field])), 'number_or_null_required');
      reject('score', Number.isFinite(row.score), 'finite_number_required');
      reject('image', row.image === null || typeof row.image === 'string', 'string_or_null_required');
    }
    if (fields.length) return { code: 'FEED_ROW_INVALID', row: index + 1, fields };
    const id = String(row.id);
    if (ids.has(id)) return { code: 'FEED_DUPLICATE_ID', row: index + 1 };
    ids.add(id);
  }
  return { code: 'VALID' };
}
export function validateRows(rows, stage, preserveExisting = false) {
  const diagnostic = preserveExisting ? inspectPreservedFeedValidation(rows) : inspectFeedValidation(rows);
  if (diagnostic.code !== 'VALID') {
    const error = new Error(diagnostic.code);
    error.validation = { ...diagnostic, stage };
    throw error;
  }
  return new Set(rows.map(row => String(row.id)));
}

// Shared pure helpers for protected/versioned inventory writes and verification.
// Never use the public Facebook-only response as the existing inventory.
export function preparePreservingPayload(existing, additions) {
  validateRows(additions, 'additions');
  if (!additions.length) throw new Error('EMPTY_ADDITIONS');
  const ids = validateRows(existing, 'baseline', true);
  const newRows = additions.filter(row => !ids.has(String(row.id)));
  if (!newRows.length) throw new Error('NO_NEW_LISTINGS');
  const merged = [...existing, ...newRows];
  validateRows(merged, 'merged', true);
  if (Buffer.byteLength(JSON.stringify(merged)) > 25 * 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
  return { merged, existingPreserved: existing.length, added: newRows.length, skippedExistingIds: additions.length - newRows.length };
}
export function verifyPreservingReadback(expected, actual) {
  validateRows(actual, 'readback', true);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('READBACK_MISMATCH');
  return true;
}
