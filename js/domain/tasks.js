// Task rules. Pure functions only.
// Recurring tasks never reach status 'done'. Completing one advances its due date and records the completion.

import { dateKeyOfIso } from './dates.js';
import { nextOccurrenceAfter } from './recurrence.js';
import { priorityRank } from './constants.js';

export const TASK_VIEWS = [
  { value: 'all', label: 'All tasks' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'completed', label: 'Completed' },
];

export const SORT_OPTIONS = [
  { value: 'deadline', label: 'Deadline' },
  { value: 'priority', label: 'Priority' },
  { value: 'created', label: 'Recently added' },
];

const MAX_COMPLETIONS = 500;

export function isOpen(task) {
  return task.status !== 'done';
}

export function isRecurring(task) {
  return Boolean(task.recurrence) && task.recurrence !== 'none';
}

// A task is overdue when its date has passed, or when it is due today at a time that has already gone.
export function isOverdue(task, today, nowTime) {
  if (!isOpen(task) || !task.dueDate) return false;
  if (task.dueDate < today) return true;
  return task.dueDate === today && Boolean(task.dueTime) && task.dueTime < nowTime;
}

function matchesView(task, view, today, nowTime) {
  switch (view) {
    case 'today':
      return isOpen(task) && task.dueDate === today;
    case 'upcoming':
      return isOpen(task) && Boolean(task.dueDate) && task.dueDate > today;
    case 'overdue':
      return isOverdue(task, today, nowTime);
    case 'completed':
      return !isOpen(task);
    case 'all':
    default:
      return isOpen(task);
  }
}

export function filterTasks(tasks, options, today, nowTime) {
  const { view = 'all', category = '', priority = '', query = '', projectId } = options;
  const needle = query.trim().toLowerCase();
  return tasks.filter((task) => {
    if (!matchesView(task, view, today, nowTime)) return false;
    if (category && task.category !== category) return false;
    if (priority && task.priority !== priority) return false;
    if (projectId !== undefined && (task.projectId ?? null) !== projectId) return false;
    if (needle) {
      const haystack = [task.title, task.description, ...(task.tags ?? [])].join(' ').toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function byCreated(a, b) {
  return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
}

function byPriority(a, b) {
  return priorityRank(b.priority) - priorityRank(a.priority);
}

// Undated tasks always sort after dated ones in deadline order.
function byDeadline(a, b) {
  if (a.dueDate && b.dueDate) {
    return (
      a.dueDate.localeCompare(b.dueDate) ||
      (a.dueTime ?? '99:99').localeCompare(b.dueTime ?? '99:99') ||
      byPriority(a, b) ||
      byCreated(a, b)
    );
  }
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return byPriority(a, b) || byCreated(a, b);
}

export function sortTasks(tasks, key = 'deadline') {
  const comparators = {
    deadline: byDeadline,
    priority: (a, b) => byPriority(a, b) || byDeadline(a, b),
    created: byCreated,
  };
  return [...tasks].sort(comparators[key] ?? byDeadline);
}

// Returns the patch to apply when a task is completed.
export function completeTask(task, now, today) {
  const completions = [...(task.completions ?? []), now].slice(-MAX_COMPLETIONS);
  if (isRecurring(task) && task.dueDate) {
    const dueDate = nextOccurrenceAfter(task.dueDate, task.recurrence, today, task.anchorDay ?? null);
    return { status: 'open', dueDate, completedAt: null, completions };
  }
  return { status: 'done', completedAt: now, completions };
}

export function restoreTask() {
  return { status: 'open', completedAt: null };
}

export function completionDay(iso) {
  return dateKeyOfIso(iso);
}
