// Recurrence rules. Monthly repeats keep the original day of month (anchorDay) where the month allows it,
// so a task anchored to the 31st lands on the last day of shorter months and returns to the 31st afterwards.

import { addDays } from './dates.js';

export const RECURRENCE_OPTIONS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

export const RECURRENCE_VALUES = RECURRENCE_OPTIONS.map((option) => option.value);

const pad = (value) => String(value).padStart(2, '0');

export function addMonths(dateKey, months, anchorDay = null) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const total = month - 1 + months;
  const targetYear = year + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate();
  const wanted = anchorDay ?? day;
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(wanted, daysInTarget))}`;
}

export function nextOccurrence(dateKey, rule, anchorDay = null) {
  switch (rule) {
    case 'daily':
      return addDays(dateKey, 1);
    case 'weekly':
      return addDays(dateKey, 7);
    case 'monthly':
      return addMonths(dateKey, 1, anchorDay);
    default:
      return null;
  }
}

// Returns the first occurrence strictly after afterKey, starting from the recorded due date.
export function nextOccurrenceAfter(dateKey, rule, afterKey, anchorDay = null) {
  if (!rule || rule === 'none') return null;
  let next = nextOccurrence(dateKey, rule, anchorDay);
  let guard = 0;
  while (next <= afterKey && guard < 5000) {
    next = nextOccurrence(next, rule, anchorDay);
    guard += 1;
  }
  return next;
}
