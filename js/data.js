// Service layer used by every module. All writes go through here so that views always receive a change notification.

import { STORE_NAMES, repo, writeOperations, applyStores, readAllStores } from './database.js';
import { emit } from './bus.js';
import { nowIso } from './domain/dates.js';
import { progressSnapshot } from './domain/analytics.js';

export const repos = Object.fromEntries(STORE_NAMES.map((name) => [name, repo(name)]));

export function newId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function notify(store, action, id = null) {
  emit('data', { store, action, id });
}

// Loads every record store plus settings in one pass. Views filter this in memory.
export async function loadSnapshot() {
  const names = STORE_NAMES.filter((name) => name !== 'kv');
  const pairs = await Promise.all(names.map(async (name) => [name, await repos[name].list()]));
  const snapshot = Object.fromEntries(pairs);
  snapshot.settings = await getSettings();
  return snapshot;
}

export async function getSettings() {
  const records = await repos.kv.list();
  return Object.fromEntries(records.map((record) => [record.key, record.value]));
}

export async function getSetting(key, fallback = null) {
  const record = await repos.kv.get(key);
  return record ? record.value : fallback;
}

export async function setSetting(key, value) {
  await repos.kv.put({ key, value, updatedAt: nowIso() });
  notify('kv', 'update', key);
}

export async function createRecord(store, data) {
  const now = nowIso();
  const record = { ...data, id: newId(), createdAt: now, updatedAt: now };
  await repos[store].put(record);
  notify(store, 'create', record.id);
  return record;
}

export async function updateRecord(store, id, patch) {
  const current = await repos[store].get(id);
  if (!current) {
    throw new Error('This item no longer exists. It may have been deleted in another tab.');
  }
  const record = { ...current, ...patch, id, updatedAt: nowIso() };
  await repos[store].put(record);
  notify(store, 'update', id);
  return record;
}

export async function deleteRecord(store, id) {
  await repos[store].remove(id);
  notify(store, 'delete', id);
}

export async function putRecord(store, record) {
  await repos[store].put(record);
  notify(store, 'put', record.id);
  return record;
}

export async function commitOperations(operations, label = 'batch') {
  await writeOperations(operations);
  notify(label, 'batch');
}

export async function replaceAllData(storesData, mode) {
  const count = await applyStores(storesData, mode);
  notify('*', mode);
  return count;
}

export async function exportAllData() {
  return readAllStores();
}

// Writes today's progress values without emitting a change event, so recording cannot trigger another refresh.
export async function recordDailyProgress(today) {
  const snapshot = await loadSnapshot();
  const value = progressSnapshot(snapshot, today);
  const now = nowIso();
  await repos.kv.put({ key: `progress:${today}`, value: { ...value, capturedAt: now }, updatedAt: now });
}
