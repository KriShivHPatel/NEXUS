// Calendar arithmetic uses local date keys (YYYY-MM-DD) so that day boundaries follow the user's timezone.

const pad = (value) => String(value).padStart(2, '0');

export function toDateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

// Rejects impossible dates such as 2026-02-31 by checking that the key survives a round trip.
export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toDateKey(parseDateKey(value)) === value;
}

export function isTimeValue(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function currentTimeKey(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function addDays(key, days) {
  const date = parseDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

// Whole calendar days from fromKey to toKey. Rounding absorbs daylight-saving hour shifts.
export function diffDays(fromKey, toKey) {
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}

// Returns `count` day keys ending at endKey, oldest first.
export function lastDays(count, endKey = toDateKey()) {
  return Array.from({ length: count }, (_, index) => addDays(endKey, index - count + 1));
}

export function nowIso() {
  return new Date().toISOString();
}

export function dateKeyOfIso(iso) {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : toDateKey(date);
}

export function formatDateKey(key, options = { day: 'numeric', month: 'short' }) {
  return parseDateKey(key).toLocaleDateString(undefined, options);
}

export function weekdayShort(key) {
  return parseDateKey(key).toLocaleDateString(undefined, { weekday: 'short' });
}

export function relativeDayLabel(key, today = toDateKey()) {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff < 0) return `${-diff} days ago`;
  return `In ${diff} days`;
}

export function dayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}
