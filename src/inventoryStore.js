import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { inspectFeedValidation, inspectPreservedFeedValidation } from './inventoryIntegrity.js';

export class InventoryError extends Error {
  constructor(code, status, validation) {
    super(code); this.code = code; this.status = status;
    if (validation) this.validation = validation;
  }
}
export function createInventoryStore(file, { fsImpl = fs } = {}) {
  const io = fsImpl;
  const versionOf = bytes => `"${createHash('sha256').update(bytes).digest('hex')}"`;
  function snapshot() {
    let bytes;
    try { bytes = io.readFileSync(file); }
    catch (error) { if (error.code !== 'ENOENT') throw error; bytes = Buffer.from('[]'); }
    const rows = JSON.parse(bytes.toString('utf8'));
    if (!Array.isArray(rows)) throw new InventoryError('STORED_INVENTORY_INVALID', 409);
    return { rows, version: versionOf(bytes) };
  }
  function commit(rows, expectedVersion) {
    if (!expectedVersion) throw new InventoryError('IF_MATCH_REQUIRED', 428);
    if (!/^"[a-f0-9]{64}"$/.test(expectedVersion)) throw new InventoryError('IF_MATCH_INVALID', 400);
    if (!Array.isArray(rows)) throw new InventoryError('FEED_SHAPE_INVALID', 400);
    if (rows.length > 5000) throw new InventoryError('FEED_SHAPE_INVALID', 413);
    io.mkdirSync(path.dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    let lockFd;
    try { lockFd = io.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new InventoryError('INVENTORY_BUSY', 409);
      throw error;
    }
    let temporary;
    try {
      // Lock covers read/version check, preservation/schema validation and atomic rename.
      const current = snapshot();
      if (current.version !== expectedVersion) throw new InventoryError('STALE_INVENTORY_VERSION', 412);
      for (const [input, stage, status] of [[current.rows, 'baseline', 409], [rows, 'merged', 400]]) {
        const validation = inspectPreservedFeedValidation(input);
        if (validation.code !== 'VALID') throw new InventoryError(validation.code, status, { ...validation, stage });
      }
      if (rows.length < current.rows.length || current.rows.some((row, index) => JSON.stringify(row) !== JSON.stringify(rows[index]))) {
        throw new InventoryError('INVENTORY_PRESERVATION_REQUIRED', 409);
      }
      const validation = inspectFeedValidation(rows.slice(current.rows.length));
      if (validation.code !== 'VALID') throw new InventoryError(validation.code, 400, { ...validation, stage: 'additions' });
      const bytes = Buffer.from(JSON.stringify(rows, null, 2));
      if (bytes.length > 25 * 1024 * 1024) throw new InventoryError('PAYLOAD_TOO_LARGE', 413);
      temporary = `${file}.${randomUUID()}.tmp`;
      let fd;
      try {
        fd = io.openSync(temporary, 'wx', 0o600);
        io.writeFileSync(fd, bytes);
        io.fsyncSync(fd);
      } finally { if (fd !== undefined) io.closeSync(fd); }
      io.renameSync(temporary, file);
      temporary = undefined;
      return { ok: true, count: rows.length, version: versionOf(bytes), updatedAt: new Date().toISOString() };
    } finally {
      try { if (temporary) io.unlinkSync(temporary); }
      finally {
        try { io.closeSync(lockFd); }
        finally { io.unlinkSync(lock); }
      }
    }
  }
  return { snapshot, commit };
}
