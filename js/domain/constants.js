// Shared domain constants. Stored values are persisted in IndexedDB, so changing a value needs a migration.

export const TASK_CATEGORIES = [
  { value: 'academic', label: 'Academic' },
  { value: 'programming', label: 'Programming' },
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
  { value: 'projects', label: 'Projects' },
  { value: 'other', label: 'Other' },
];

export const PRIORITIES = [
  { value: 'critical', label: 'Critical', rank: 4 },
  { value: 'high', label: 'High', rank: 3 },
  { value: 'medium', label: 'Medium', rank: 2 },
  { value: 'low', label: 'Low', rank: 1 },
];

export const PRIORITY_VALUES = PRIORITIES.map((item) => item.value);

export const UNDERSTANDING_LEVELS = [
  { value: 'notStarted', label: 'Not started', revisionDays: null },
  { value: 'learning', label: 'Learning', revisionDays: 3 },
  { value: 'understood', label: 'Understood', revisionDays: 7 },
  { value: 'needsRevision', label: 'Needs revision', revisionDays: 1 },
  { value: 'mastered', label: 'Mastered', revisionDays: 21 },
];

export const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'onHold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

export const PROJECT_CATEGORIES = [
  { value: 'programming', label: 'Programming' },
  { value: 'university', label: 'University' },
  { value: 'personal', label: 'Personal' },
  { value: 'business', label: 'Business' },
  { value: 'other', label: 'Other' },
];

export const JOURNAL_CATEGORIES = [
  { value: 'thought', label: 'Thought' },
  { value: 'idea', label: 'Idea' },
  { value: 'reflection', label: 'Reflection' },
  { value: 'decision', label: 'Decision' },
  { value: 'lesson', label: 'Lesson learned' },
  { value: 'note', label: 'General note' },
];

export const FOCUS_MODES = [
  { value: 'pomodoro', label: 'Pomodoro', minutes: 25 },
  { value: 'focus', label: 'Focus', minutes: 50 },
  { value: 'deepWork', label: 'Deep work', minutes: 90 },
  { value: 'custom', label: 'Custom', minutes: null },
];

export const DEFAULT_PREFERENCES = {
  name: '',
  university: '',
  dailyFocusMinutes: 120,
  lookaheadDays: 3,
  examDays: 14,
  defaultCategory: 'personal',
  defaultPriority: 'medium',
  notifications: {
    overdue: true,
    dueSoon: true,
    exams: true,
    assignments: true,
    objectives: true,
    revisions: true,
  },
};

export function priorityRank(value) {
  return PRIORITIES.find((item) => item.value === value)?.rank ?? 0;
}

export function labelOf(list, value, fallback = '') {
  return list.find((item) => item.value === value)?.label ?? fallback;
}

export function priorityLabel(value) {
  return labelOf(PRIORITIES, value, 'Unset');
}

function inRange(value, min, max, fallback) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fallback;
}

// Merges saved preferences over defaults and discards values that are out of range or the wrong type.
export function resolvePreferences(saved) {
  const source = saved && typeof saved === 'object' ? saved : {};
  const notifications = { ...DEFAULT_PREFERENCES.notifications };
  for (const key of Object.keys(notifications)) {
    if (typeof source.notifications?.[key] === 'boolean') notifications[key] = source.notifications[key];
  }
  return {
    name: typeof source.name === 'string' ? source.name : DEFAULT_PREFERENCES.name,
    university: typeof source.university === 'string' ? source.university : DEFAULT_PREFERENCES.university,
    dailyFocusMinutes: inRange(source.dailyFocusMinutes, 15, 1440, DEFAULT_PREFERENCES.dailyFocusMinutes),
    lookaheadDays: inRange(source.lookaheadDays, 1, 14, DEFAULT_PREFERENCES.lookaheadDays),
    examDays: inRange(source.examDays, 1, 60, DEFAULT_PREFERENCES.examDays),
    defaultCategory: TASK_CATEGORIES.some((c) => c.value === source.defaultCategory)
      ? source.defaultCategory
      : DEFAULT_PREFERENCES.defaultCategory,
    defaultPriority: PRIORITY_VALUES.includes(source.defaultPriority)
      ? source.defaultPriority
      : DEFAULT_PREFERENCES.defaultPriority,
    notifications,
  };
}
