// Quick Capture. Opens from anywhere with Alt+N. Tasks become task records; notes, ideas and reflections become journal entries.

import { createRecord, getSetting } from '../data.js';
import { openModal, closeModal } from './modal.js';
import { field, readForm, showErrors, setFormError } from './forms.js';
import { toast } from './toast.js';
import { validateTask, validateJournal } from '../domain/validation.js';
import { PRIORITIES, resolvePreferences } from '../domain/constants.js';
import { escapeHtml, icon } from '../utilities.js';

const CAPTURE_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'note', label: 'Note' },
  { value: 'idea', label: 'Idea' },
  { value: 'reflection', label: 'Reflection' },
];

function fieldsFor(type, prefs) {
  if (type === 'task') {
    return [
      field({ name: 'title', label: 'Task', required: true, full: true, placeholder: 'What needs doing?' }),
      field({ name: 'dueDate', label: 'Due date (optional)', type: 'date' }),
      field({
        name: 'priority',
        label: 'Priority',
        type: 'select',
        value: prefs.defaultPriority,
        options: PRIORITIES.map((item) => ({ value: item.value, label: item.label })),
      }),
    ].join('');
  }
  const label = { note: 'Note', idea: 'Idea', reflection: 'Reflection' }[type];
  return [
    field({ name: 'title', label: `${label} title (optional)`, full: true, placeholder: 'A short title' }),
    field({ name: 'content', label: 'Write it down', type: 'textarea', rows: 5, full: true, placeholder: 'Capture it before it slips away.' }),
  ].join('');
}

export async function openQuickCapture(initialType = 'task') {
  const saved = await getSetting('preferences', null);
  const prefs = resolvePreferences(saved);
  let type = CAPTURE_TYPES.some((item) => item.value === initialType) ? initialType : 'task';

  const wrapper = document.createElement('form');
  wrapper.className = 'form capture-form';
  wrapper.noValidate = true;

  const render = () => {
    wrapper.innerHTML = `
      <div class="segmented" role="group" aria-label="What to capture">
        ${CAPTURE_TYPES.map((item) => `<button type="button" class="segment" data-type="${item.value}" aria-pressed="${item.value === type}">${escapeHtml(item.label)}</button>`).join('')}
      </div>
      <div class="form-grid">${fieldsFor(type, prefs)}</div>
      <p class="form-error" data-form-error hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-modal-close>Cancel</button>
        <button type="submit" class="btn btn-primary" data-submit>${icon('zap', 16)} Capture</button>
      </div>`;
  };
  render();

  wrapper.addEventListener('click', (event) => {
    const segment = event.target.closest('[data-type]');
    if (!segment) return;
    type = segment.dataset.type;
    render();
    wrapper.querySelector('input, textarea, select')?.focus();
  });

  let busy = false;
  wrapper.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = readForm(wrapper);

    let outcome;
    if (type === 'task') {
      outcome = validateTask({
        title: values.title,
        description: '',
        category: prefs.defaultCategory,
        priority: values.priority,
        dueDate: values.dueDate,
        dueTime: '',
        recurrence: 'none',
        tags: '',
        projectId: '',
      });
    } else {
      outcome = validateJournal({ title: values.title, content: values.content, category: type, tags: '' });
    }
    showErrors(wrapper, outcome.errors);
    if (!outcome.valid) return;

    busy = true;
    try {
      if (type === 'task') {
        await createRecord('tasks', { ...outcome.value, status: 'open', completedAt: null, completions: [] });
        toast('Task captured.', 'success');
      } else {
        await createRecord('journal', { ...outcome.value });
        toast('Captured to your journal.', 'success');
      }
      closeModal();
    } catch (error) {
      setFormError(wrapper, error.message || 'The capture could not be saved.');
    } finally {
      busy = false;
    }
  });

  openModal({ title: 'Quick capture', content: wrapper, size: 'md' });
}
