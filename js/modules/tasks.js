// Tasks page. Views are filters over stored tasks. Every control changes only the list, so typing in search keeps its focus.

import { repos } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { toDateKey, currentTimeKey, relativeDayLabel, dateKeyOfIso, formatDateKey } from '../domain/dates.js';
import { TASK_VIEWS, SORT_OPTIONS, filterTasks, sortTasks, isOpen, isOverdue, isRecurring } from '../domain/tasks.js';
import { TASK_CATEGORIES, PRIORITIES, labelOf, priorityLabel } from '../domain/constants.js';
import { RECURRENCE_OPTIONS } from '../domain/recurrence.js';
import { completeTaskById, reopenTaskById, deleteTaskById, safely } from '../actions.js';
import { openTaskForm } from '../components/task-form.js';

const EMPTY_MESSAGES = {
  all: 'No open tasks. Add one to start your list.',
  today: 'Nothing is due today.',
  upcoming: 'Nothing scheduled after today yet.',
  overdue: 'Nothing is overdue. Keep it that way.',
  completed: 'No completed tasks yet. Finished work will appear here.',
};

function options(list, selected, allLabel) {
  const all = allLabel ? [`<option value="">${escapeHtml(allLabel)}</option>`] : [];
  return [
    ...all,
    ...list.map((item) => `<option value="${escapeHtml(item.value)}" ${item.value === selected ? 'selected' : ''}>${escapeHtml(item.label)}</option>`),
  ].join('');
}

function renderRow(task, context) {
  const { today, nowTime, projectNames } = context;
  const open = isOpen(task);
  const overdue = isOverdue(task, today, nowTime);
  const title = escapeHtml(task.title);

  const check = open
    ? `<button type="button" class="check-btn" data-action="complete-task" data-id="${task.id}" aria-label="Complete ${title}"></button>`
    : `<button type="button" class="check-btn is-done" data-action="reopen-task" data-id="${task.id}" aria-label="Restore ${title} to open tasks">${icon('check', 14)}</button>`;

  const dueText = task.dueDate
    ? `${relativeDayLabel(task.dueDate, today)}${task.dueTime ? ` · ${task.dueTime}` : ''}`
    : 'No due date';

  const recurrence = isRecurring(task) ? labelOf(RECURRENCE_OPTIONS, task.recurrence) : '';
  const project = task.projectId && projectNames[task.projectId];
  const completedOn = !open && task.completedAt ? formatDateKey(dateKeyOfIso(task.completedAt), { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  return `<li class="task-card${open ? '' : ' is-completed'}${overdue ? ' is-overdue' : ''}">
      ${check}
      <div class="task-body">
        <span class="task-title">${title}</span>
        ${task.description ? `<p class="task-note">${escapeHtml(task.description.slice(0, 160))}</p>` : ''}
        <div class="task-meta">
          <span class="tag">${escapeHtml(labelOf(TASK_CATEGORIES, task.category, 'Other'))}</span>
          <span class="tag tag-${escapeHtml(task.priority)}">${escapeHtml(priorityLabel(task.priority))}</span>
          <span class="meta-item${overdue ? ' text-danger' : ''}">${icon('calendar', 13)} ${escapeHtml(dueText)}</span>
          ${recurrence ? `<span class="meta-item">${icon('rotate', 13)} ${escapeHtml(recurrence)}</span>` : ''}
          ${project ? `<a class="meta-item meta-link" href="#/projects/${escapeHtml(task.projectId)}">${icon('folder', 13)} ${escapeHtml(project)}</a>` : ''}
          ${completedOn ? `<span class="meta-item">Completed ${escapeHtml(completedOn)}</span>` : ''}
          ${(task.tags ?? []).map((tag) => `<span class="tag tag-ghost">#${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn" data-action="edit-task" data-id="${task.id}" aria-label="Edit ${title}">${icon('edit', 16)}</button>
        <button type="button" class="icon-btn" data-action="delete-task" data-id="${task.id}" aria-label="Delete ${title}">${icon('trash', 16)}</button>
      </div>
    </li>`;
}

export function render(container) {
  const state = { view: 'all', category: '', priority: '', query: '', sort: 'deadline' };
  let token = 0;
  let timer = null;

  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow">Management</p>
      <div class="header-row">
        <h1>Tasks</h1>
        <button type="button" class="btn btn-primary" data-action="new-task">${icon('plus', 16)} New task</button>
      </div>
      <p class="lead">Plan what is due, see what is overdue, and review what you have finished.</p>
    </section>

    <div class="view-tabs" role="tablist" aria-label="Task views">
      ${TASK_VIEWS.map((item) => `<button type="button" role="tab" class="tab" data-view="${item.value}" aria-selected="${item.value === state.view}">${escapeHtml(item.label)}</button>`).join('')}
    </div>

    <div class="filter-bar">
      <label class="search-field">
        ${icon('search', 16)}
        <input type="search" placeholder="Search title, notes or tags" data-field="query" aria-label="Search tasks" />
      </label>
      <select data-field="category" aria-label="Filter by category">${options(TASK_CATEGORIES, '', 'All categories')}</select>
      <select data-field="priority" aria-label="Filter by priority">${options(PRIORITIES.map((p) => ({ value: p.value, label: p.label })), '', 'All priorities')}</select>
      <select data-field="sort" aria-label="Sort tasks">${options(SORT_OPTIONS, state.sort)}</select>
    </div>

    <div class="results-meta" data-count aria-live="polite"></div>
    <ul class="task-stack" data-results></ul>
  `;

  const results = container.querySelector('[data-results]');
  const countLine = container.querySelector('[data-count]');

  async function refresh() {
    const current = ++token;
    try {
      const [tasks, projects] = await Promise.all([repos.tasks.list(), repos.projects.list()]);
      if (current !== token) return;

      const now = new Date();
      const today = toDateKey(now);
      const nowTime = currentTimeKey(now);
      const projectNames = Object.fromEntries(projects.map((project) => [project.id, project.name]));

      container.querySelectorAll('[data-view]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.view === state.view));
      });

      let list = filterTasks(tasks, state, today, nowTime);
      if (state.view === 'completed') {
        list = list.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
      } else {
        list = sortTasks(list, state.sort);
      }

      const filtersActive = Boolean(state.category || state.priority || state.query);
      countLine.textContent = `${list.length} ${list.length === 1 ? 'task' : 'tasks'}`;

      if (list.length === 0) {
        const message = filtersActive
          ? 'No tasks match these filters.'
          : EMPTY_MESSAGES[state.view];
        results.innerHTML = `<li class="empty-block">
          <p>${escapeHtml(message)}</p>
          ${filtersActive ? '<button type="button" class="btn btn-sm" data-action="clear-filters">Clear filters</button>' : ''}
        </li>`;
        return;
      }

      results.innerHTML = list.map((task) => renderRow(task, { today, nowTime, projectNames })).join('');
    } catch (error) {
      console.error(error);
      results.innerHTML = `<li class="empty-block"><p>Tasks could not be loaded. ${escapeHtml(error.message || '')}</p></li>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 40);
  }

  function resetFilters() {
    state.category = '';
    state.priority = '';
    state.query = '';
    container.querySelector('[data-field="category"]').value = '';
    container.querySelector('[data-field="priority"]').value = '';
    container.querySelector('[data-field="query"]').value = '';
    refresh();
  }

  async function openEdit(id) {
    const task = await repos.tasks.get(id);
    if (!task) throw new Error('That task no longer exists.');
    await openTaskForm({ task });
  }

  function onClick(event) {
    const view = event.target.closest('[data-view]');
    if (view && container.contains(view)) {
      state.view = view.dataset.view;
      refresh();
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !container.contains(trigger)) return;
    const id = trigger.dataset.id;
    switch (trigger.dataset.action) {
      case 'new-task':
        safely(() => openTaskForm({}));
        break;
      case 'edit-task':
        safely(() => openEdit(id));
        break;
      case 'delete-task':
        deleteTaskById(id);
        break;
      case 'complete-task':
        completeTaskById(id);
        break;
      case 'reopen-task':
        reopenTaskById(id);
        break;
      case 'clear-filters':
        resetFilters();
        break;
      default:
        break;
    }
  }

  function onInput(event) {
    if (event.target.dataset.field === 'query') {
      state.query = event.target.value;
      refresh();
    }
  }

  function onChange(event) {
    const field = event.target.dataset.field;
    if (!field || field === 'query') return;
    state[field] = event.target.value;
    refresh();
  }

  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  const unsubscribe = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
  };
}
