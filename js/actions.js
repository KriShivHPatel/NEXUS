// Shared actions. Views call these instead of duplicating write logic, so every entry point behaves identically.

import { repos, createRecord, updateRecord, deleteRecord, putRecord, commitOperations } from './data.js';
import { completeTask, restoreTask } from './domain/tasks.js';
import { toDateKey, nowIso, formatDateKey } from './domain/dates.js';
import { validateObjective, validateHabit } from './domain/validation.js';
import { PRIORITIES } from './domain/constants.js';
import { field, openFormModal } from './components/forms.js';
import { confirmDialog } from './components/modal.js';
import { toast } from './components/toast.js';

export const MAX_OBJECTIVES_PER_DAY = 3;

// Runs an action and reports any failure as a toast instead of an unhandled rejection.
export async function safely(action) {
  try {
    await action();
  } catch (error) {
    console.error(error);
    toast(error.message || 'Something went wrong. Please try again.', 'error');
  }
}

export function completeTaskById(id) {
  return safely(async () => {
    const task = await repos.tasks.get(id);
    if (!task) throw new Error('That task no longer exists.');
    const patch = completeTask(task, nowIso(), toDateKey());
    await updateRecord('tasks', id, patch);
    if (patch.status === 'open' && patch.dueDate) {
      toast(`Done. The next occurrence is ${formatDateKey(patch.dueDate, { weekday: 'short', day: 'numeric', month: 'short' })}.`, 'success');
    } else {
      toast('Task completed.', 'success');
    }
  });
}

export function reopenTaskById(id) {
  return safely(async () => {
    await updateRecord('tasks', id, restoreTask());
    toast('Task restored to your open list.', 'success');
  });
}

export function deleteTaskById(id) {
  return safely(async () => {
    const task = await repos.tasks.get(id);
    if (!task) throw new Error('That task no longer exists.');
    const confirmed = await confirmDialog({
      title: 'Delete task?',
      message: `"${task.title}" will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    await deleteRecord('tasks', id);
    toast('Task deleted.', 'success');
  });
}

function objectiveFields(initial = {}) {
  return [
    field({ name: 'text', label: 'Objective', value: initial.text ?? '', required: true, placeholder: 'What must be finished today?', full: true }),
    field({
      name: 'priority',
      label: 'Priority',
      type: 'select',
      value: initial.priority ?? 'high',
      options: PRIORITIES.map((item) => ({ value: item.value, label: item.label })),
    }),
  ].join('');
}

export function toggleObjective(id) {
  return safely(async () => {
    const objective = await repos.objectives.get(id);
    if (!objective) throw new Error('That objective no longer exists.');
    const done = !objective.done;
    await updateRecord('objectives', id, { done, completedAt: done ? nowIso() : null });
  });
}

export function addObjective(date = toDateKey()) {
  return safely(async () => {
    const existing = await repos.objectives.byIndex('date', date);
    if (existing.length >= MAX_OBJECTIVES_PER_DAY) {
      throw new Error('You already have three objectives for today. Finish or remove one to add another.');
    }
    openFormModal({
      title: 'Add objective',
      html: objectiveFields({}),
      validate: validateObjective,
      submitLabel: 'Add objective',
      size: 'sm',
      onSubmit: async (value) => {
        const current = await repos.objectives.byIndex('date', date);
        if (current.length >= MAX_OBJECTIVES_PER_DAY) {
          throw new Error('You already have three objectives for today.');
        }
        await createRecord('objectives', { date, text: value.text, priority: value.priority, done: false, completedAt: null });
        toast('Objective added.', 'success');
      },
    });
  });
}

export function editObjective(id) {
  return safely(async () => {
    const objective = await repos.objectives.get(id);
    if (!objective) throw new Error('That objective no longer exists.');
    openFormModal({
      title: 'Edit objective',
      html: objectiveFields(objective),
      validate: validateObjective,
      size: 'sm',
      onSubmit: async (value) => {
        await updateRecord('objectives', id, { text: value.text, priority: value.priority });
        toast('Objective updated.', 'success');
      },
    });
  });
}

export function deleteObjective(id) {
  return safely(async () => {
    const objective = await repos.objectives.get(id);
    if (!objective) throw new Error('That objective no longer exists.');
    const confirmed = await confirmDialog({
      title: 'Remove objective?',
      message: `Remove "${objective.text}" from today?`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    await deleteRecord('objectives', id);
  });
}

export function toggleHabit(habitId, date = toDateKey()) {
  return safely(async () => {
    const logId = `${habitId}|${date}`;
    const existing = await repos.habitLogs.get(logId);
    if (existing) {
      await deleteRecord('habitLogs', logId);
    } else {
      const now = nowIso();
      await putRecord('habitLogs', { id: logId, habitId, date, createdAt: now, updatedAt: now });
    }
  });
}

export function addHabit() {
  return safely(async () => {
    openFormModal({
      title: 'Add habit',
      html: field({ name: 'name', label: 'Habit', required: true, placeholder: 'For example: 30 minutes of reading', full: true }),
      validate: validateHabit,
      submitLabel: 'Add habit',
      size: 'sm',
      onSubmit: async (value) => {
        await createRecord('habits', { name: value.name, active: true });
        toast('Habit added.', 'success');
      },
    });
  });
}

export function deleteHabit(id) {
  return safely(async () => {
    const habit = await repos.habits.get(id);
    if (!habit) throw new Error('That habit no longer exists.');
    const confirmed = await confirmDialog({
      title: 'Delete habit?',
      message: `Delete "${habit.name}" and its full history? This cannot be undone.`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    const logs = await repos.habitLogs.byIndex('habitId', id);
    await commitOperations(
      [...logs.map((log) => ({ type: 'delete', store: 'habitLogs', id: log.id })), { type: 'delete', store: 'habits', id }],
      'habits'
    );
    toast('Habit deleted.', 'success');
  });
}

