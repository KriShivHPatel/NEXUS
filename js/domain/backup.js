// Backup format. Validation runs before anything is written, and an import that fails validation changes nothing.

export const BACKUP_FORMAT = 'nexus-backup';
export const BACKUP_VERSION = 1;
const MAX_RECORDS = 200000;
const MAX_ERRORS = 25;

export function createBackupPayload(stores, appVersion) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    stores,
  };
}

function isPlainObject(value) {
  return Object.prototype.toString.call(value) === '[object Object]';
}

export function validateBackup(payload, storeNames) {
  const errors = [];
  const counts = {};

  const fail = (message) => {
    if (errors.length < MAX_ERRORS) errors.push(message);
    else if (errors.length === MAX_ERRORS) errors.push('More problems were found. Only the first few are shown.');
  };

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['The file does not contain a JSON object.'], counts, totalRecords: 0 };
  }
  if (payload.format !== BACKUP_FORMAT) {
    return { ok: false, errors: ['This file is not a NEXUS backup.'], counts, totalRecords: 0 };
  }
  if (payload.version !== BACKUP_VERSION) {
    return {
      ok: false,
      errors: [`This backup uses format version ${String(payload.version)}, which this version of NEXUS cannot read.`],
      counts,
      totalRecords: 0,
    };
  }
  if (!isPlainObject(payload.stores)) {
    return { ok: false, errors: ['The backup has no data section.'], counts, totalRecords: 0 };
  }

  for (const name of storeNames) {
    if (!Array.isArray(payload.stores[name])) fail(`Missing data section "${name}".`);
  }
  for (const name of Object.keys(payload.stores)) {
    if (!storeNames.includes(name)) fail(`Unknown data section "${name}". Nothing was imported.`);
  }

  let totalRecords = 0;
  for (const name of storeNames) {
    const records = payload.stores[name];
    if (!Array.isArray(records)) continue;
    counts[name] = records.length;
    totalRecords += records.length;
    const idField = name === 'kv' ? 'key' : 'id';
    const seen = new Set();

    records.forEach((record, index) => {
      const where = `${name} item ${index + 1}`;
      if (!isPlainObject(record)) {
        fail(`${where} is not a valid record.`);
        return;
      }
      const id = record[idField];
      if (typeof id !== 'string' || id.length === 0) {
        fail(`${where} has no valid identifier.`);
        return;
      }
      if (seen.has(id)) {
        fail(`${where} is duplicated inside "${name}".`);
      }
      seen.add(id);
      if (name === 'kv' && !('value' in record)) fail(`${where} has no value.`);
    });
  }

  if (totalRecords > MAX_RECORDS) fail('This backup contains more records than NEXUS can import at once.');

  return { ok: errors.length === 0, errors, counts, totalRecords, exportedAt: payload.exportedAt ?? null };
}
