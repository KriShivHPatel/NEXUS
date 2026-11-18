// IndexedDB layer. Every store uses 'id' as its key, except 'kv' which uses 'key'.
// Multi-store writes run in a single transaction, so they either fully apply or fully roll back.

export const STORE_DEFINITIONS = {
  tasks: ['dueDate', 'status', 'projectId'],
  objectives: ['date'],
  habits: [],
  habitLogs: ['habitId', 'date'],
  semesters: [],
  subjects: ['semesterId'],
  units: ['subjectId'],
  topics: ['subjectId', 'unitId'],
  assignments: ['subjectId', 'dueDate'],
  exams: ['subjectId', 'date'],
  leetcodeDays: [],
  projects: ['status'],
  milestones: ['projectId'],
  focusSessions: ['startedAt'],
  journal: ['category'],
  kv: [],
};

export const STORE_NAMES = Object.keys(STORE_DEFINITIONS);

const DB_NAME = 'nexus';
const DB_VERSION = 1;
let databasePromise = null;

export function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('This browser does not support IndexedDB, so NEXUS cannot store data.'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const [name, indexes] of Object.entries(STORE_DEFINITIONS)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: name === 'kv' ? 'key' : 'id' });
          for (const index of indexes) store.createIndex(index, index);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          databasePromise = null;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error('The database could not be opened.'));
      request.onblocked = () => reject(new Error('NEXUS is open in another tab with an older version. Close the other tab and reload.'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

// `work` receives a store map and returns either a value or a thunk. A thunk runs after the commit,
// so it can read request results safely.
export function transact(names, mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        let tx;
        try {
          tx = db.transaction(names, mode);
        } catch (error) {
          reject(error);
          return;
        }
        const stores = {};
        for (const name of names) stores[name] = tx.objectStore(name);
        let outcome;
        try {
          outcome = work(stores);
        } catch (error) {
          try {
            tx.abort();
          } catch {
            // The transaction may already be finished.
          }
          reject(error);
          return;
        }
        tx.oncomplete = () => resolve(typeof outcome === 'function' ? outcome() : outcome);
        tx.onerror = () => reject(tx.error || new Error('A database operation failed.'));
        tx.onabort = () => reject(tx.error || new Error('The database transaction was cancelled.'));
      })
  );
}

export function repo(name) {
  return {
    list: () =>
      transact([name], 'readonly', (s) => {
        const request = s[name].getAll();
        return () => request.result ?? [];
      }),
    get: (id) =>
      transact([name], 'readonly', (s) => {
        const request = s[name].get(id);
        return () => request.result ?? null;
      }),
    byIndex: (index, value) =>
      transact([name], 'readonly', (s) => {
        const request = s[name].index(index).getAll(value);
        return () => request.result ?? [];
      }),
    put: (record) =>
      transact([name], 'readwrite', (s) => {
        s[name].put(record);
        return () => record;
      }),
    remove: (key) =>
      transact([name], 'readwrite', (s) => {
        s[name].delete(key);
      }),
  };
}

// Atomic write across any number of stores. Each operation is { type: 'put', store, record } or { type: 'delete', store, id }.
export function writeOperations(operations) {
  if (operations.length === 0) return Promise.resolve();
  const names = [...new Set(operations.map((operation) => operation.store))];
  return transact(names, 'readwrite', (s) => {
    for (const operation of operations) {
      if (operation.type === 'put') s[operation.store].put(operation.record);
      else s[operation.store].delete(operation.id);
    }
  });
}

export function readAllStores() {
  return transact(STORE_NAMES, 'readonly', (s) => {
    const requests = {};
    for (const name of STORE_NAMES) requests[name] = s[name].getAll();
    return () => {
      const data = {};
      for (const name of STORE_NAMES) data[name] = requests[name].result ?? [];
      return data;
    };
  });
}

// Applies backup data in one transaction. 'replace' clears every store first; 'merge' upserts by key.
export function applyStores(storesData, mode) {
  return transact(STORE_NAMES, 'readwrite', (s) => {
    let written = 0;
    for (const name of STORE_NAMES) {
      if (mode === 'replace') s[name].clear();
      for (const record of storesData[name] ?? []) {
        s[name].put(record);
        written += 1;
      }
    }
    return () => written;
  });
}
