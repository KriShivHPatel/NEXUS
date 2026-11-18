// Task form shared by the Tasks page and project workspaces. Opens as a modal and saves through the data layer.

import { field, openFormModal } from './forms.js';
import { repos, createRecord, updateRecord, getSetting } from '../data.js';
import { validateTask } from '../domain/validation.js';
import { TASK_CATEGORIES, PRIORITIES, resolvePreferences } from '../domain/constants.js';
import { RECURRENCE_OPTIONS } from '../domain/recurrence.js';
import { toast } from './toast.js';

export async function openTaskForm({ task = null, projectId = null, onSaved = null } = {}) {
  const [savedPreferences, projects] = await Promise.all([getSetting('preferences', null), repos.projects.list()]);
  const prefs = resolvePreferences(savedPreferences);
  const initial = task ?? {
    category: prefs.defaultCategory,
    priority: prefs.defaultPriority,
    recurrence: 'none',
    tags: [],
    projectId,
  };

  const projectOptions = [
    { value: '', label: 'No project' },
    ...projects
      .filter((project) => project.status !== 'archived' || project.id === initial.projectId)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => ({ value: project.id, label: project.name })),
  ];

  const html = [
    field({ name: 'title', label: 'Title', value: initial.title ?? '', required: true, full: true, placeholder: 'What needs to get done?' }),
    field({ name: 'description', label: 'Notes', type: 'textarea', value: initial.description ?? '', full: true, rows: 3, placeholder: 'Optional detail' }),
    field({ name: 'category', label: 'Category', type: 'select', value: initial.category, options: TASK_CATEGORIES }),
    field({
      name: 'priority',
      label: 'Priority',
      type: 'select',
      value: initial.priority,
      options: PRIORITIES.map((item) => ({ value: item.value, label: item.label })),
    }),
    field({ name: 'dueDate', label: 'Due date', type: 'date', value: initial.dueDate ?? '' }),
    field({ name: 'dueTime', label: 'Due time', type: 'time', value: initial.dueTime ?? '', hint: 'Optional. Needs a due date.' }),
    field({ name: 'recurrence', label: 'Repeat', type: 'select', value: initial.recurrence ?? 'none', options: RECURRENCE_OPTIONS, hint: 'Repeating tasks need a due date.' }),
    field({ name: 'projectId', label: 'Project', type: 'select', value: initial.projectId ?? '', options: projectOptions }),
    field({ name: 'tags', label: 'Tags', value: (initial.tags ?? []).join(', '), placeholder: 'exam, reading', hint: 'Separate tags with commas. Up to 10.', full: true }),
  ].join('');

  return openFormModal({
    title: task ? 'Edit task' : 'New task',
    html,
    size: 'lg',
    validate: validateTask,
    submitLabel: task ? 'Save changes' : 'Create task',
    onSubmit: async (value) => {
      if (task) {
        await updateRecord('tasks', task.id, value);
        toast('Task updated.', 'success');
      } else {
        await createRecord('tasks', { ...value, status: 'open', completedAt: null, completions: [] });
        toast('Task created.', 'success');
      }
      if (onSaved) onSaved();
    },
  });
}
