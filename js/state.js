// Observable UI state. Holds transient interface state only.
// Persistent application data will live in IndexedDB (see docs/ARCHITECTURE.md).

const PREF_KEYS = {
  sidebarCollapsed: 'nexus.sidebarCollapsed',
};

function readPreference(key, fallback) {
  try {
    const raw = localStorage.getItem(PREF_KEYS[key]);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function writePreference(key, value) {
  try {
    localStorage.setItem(PREF_KEYS[key], JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode, quota). The preference then lasts only for this session.
  }
}

const state = {
  route: 'overview',
  title: 'Command Centre',
  sidebarCollapsed: readPreference('sidebarCollapsed', false),
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  const changed = Object.keys(patch).some((key) => state[key] !== patch[key]);
  if (!changed) return;
  Object.assign(state, patch);
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
