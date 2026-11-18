// Projects. Progress is derived from milestones and linked tasks. Notes save when you leave the field.

import { repos, createRecord, updateRecord, deleteRecord, commitOperations } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { toDateKey, currentTimeKey, relativeDayLabel, formatDateKey, dateKeyOfIso, nowIso } from '../domain/dates.js';
import { PROJECT_STATUSES, PROJECT_CATEGORIES, PRIORITIES, labelOf, priorityLabel } from '../domain/constants.js';
import { projectProgress, openMilestones, nextActionFor, projectTimeline, completionHistory } from '../domain/projects.js';
import { isOpen, isOverdue, sortTasks } from '../domain/tasks.js';
import { validateProject, validateMilestone } from '../domain/validation.js';
import { field, openFormModal } from '../components/forms.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { completeTaskById, reopenTaskById, deleteTaskById, safely } from '../actions.js';
import { openTaskForm } from '../components/task-form.js';

const LIST_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'planning', label: 'Planning' },
  { value: 'onHold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

function percentText(value) {
  return value === null ? 'No items yet' : `${value}%`;
}

function bar(percent) {
  const width = percent ?? 0;
  return `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${width}"><span style="width:${width}%"></span></div>`;
}

function statusTag(status) {
  return `<span class="tag status-${escapeHtml(status)}">${escapeHtml(labelOf(PROJECT_STATUSES, status, status))}</span>`;
}

// ---------- Forms and mutations ----------

function projectFields(initial = {}) {
  return [
    field({ name: 'name', label: 'Project name', value: initial.name ?? '', required: true, full: true }),
    field({ name: 'description', label: 'Description', type: 'textarea', value: initial.description ?? '', full: true, rows: 3 }),
    field({ name: 'category', label: 'Category', type: 'select', value: initial.category ?? 'programming', options: PROJECT_CATEGORIES }),
    field({ name: 'status', label: 'Status', type: 'select', value: initial.status ?? 'planning', options: PROJECT_STATUSES }),
    field({
      name: 'priority',
      label: 'Priority',
      type: 'select',
      value: initial.priority ?? 'medium',
      options: PRIORITIES.map((item) => ({ value: item.value, label: item.label })),
    }),
    field({ name: 'startDate', label: 'Start date', type: 'date', value: initial.startDate ?? '' }),
    field({ name: 'targetDate', label: 'Target completion', type: 'date', value: initial.targetDate ?? '' }),
  ].join('');
}

export function openProjectForm(project = null) {
  return openFormModal({
    title: project ? 'Edit project' : 'New project',
    html: projectFields(project ?? {}),
    validate: validateProject,
    size: 'lg',
    submitLabel: project ? 'Save changes' : 'Create project',
    onSubmit: async (value) => {
      if (project) {
        await updateRecord('projects', project.id, value);
        toast('Project updated.', 'success');
      } else {
        const created = await createRecord('projects', { ...value, notes: '' });
        toast('Project created.', 'success');
        location.hash = `#/projects/${created.id}`;
      }
    },
  });
}

function milestoneFields(initial = {}) {
  return [
    field({ name: 'title', label: 'Milestone', value: initial.title ?? '', required: true, full: true, placeholder: 'For example: Working prototype' }),
    field({ name: 'dueDate', label: 'Target date', type: 'date', value: initial.dueDate ?? '' }),
  ].join('');
}

function openMilestoneForm(projectId, milestone = null) {
  return openFormModal({
    title: milestone ? 'Edit milestone' : 'New milestone',
    html: milestoneFields(milestone ?? {}),
    validate: validateMilestone,
    size: 'sm',
    submitLabel: milestone ? 'Save changes' : 'Add milestone',
    onSubmit: async (value) => {
      if (milestone) await updateRecord('milestones', milestone.id, value);
      else await createRecord('milestones', { ...value, projectId, done: false, completedAt: null });
      toast(milestone ? 'Milestone updated.' : 'Milestone added.', 'success');
    },
  });
}

async function deleteProject(id) {
  const project = await repos.projects.get(id);
  if (!project) throw new Error('That project no longer exists.');
  const confirmed = await confirmDialog({
    title: 'Delete project?',
    message: `Delete ${project.name} and its milestones? Linked tasks are kept but become unassigned. This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
  });
  if (!confirmed) return false;
  const [milestones, tasks] = await Promise.all([repos.milestones.byIndex('projectId', id), repos.tasks.byIndex('projectId', id)]);
  const now = nowIso();
  await commitOperations(
    [
      ...milestones.map((item) => ({ type: 'delete', store: 'milestones', id: item.id })),
      ...tasks.map((item) => ({ type: 'put', store: 'tasks', record: { ...item, projectId: null, updatedAt: now } })),
      { type: 'delete', store: 'projects', id },
    ],
    'projects'
  );
  toast('Project deleted.', 'success');
  return true;
}

// ---------- Rendering ----------

function renderList(projects, milestones, tasks, filter, today) {
  const visible = projects
    .filter((project) => (filter === 'all' ? true : project.status === filter))
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999') || a.name.localeCompare(b.name));

  if (visible.length === 0) {
    return `<div class="card empty-state">
      <div class="empty-icon">${icon('folder', 22)}</div>
      <h2>${filter === 'all' ? 'No projects yet' : 'No projects in this status'}</h2>
      <p>Projects group milestones and tasks around one outcome. Create one to follow its progress.</p>
      <button type="button" class="btn btn-primary" data-action="new-project">${icon('plus', 16)} New project</button>
    </div>`;
  }

  return `<div class="project-grid">${visible
    .map((project) => {
      const projectMilestones = milestones.filter((item) => item.projectId === project.id);
      const projectTasks = tasks.filter((item) => item.projectId === project.id);
      const progress = projectProgress(projectMilestones, projectTasks);
      const next = nextActionFor(projectMilestones, projectTasks);
      const due = project.targetDate
        ? `${relativeDayLabel(project.targetDate, today)} (${formatDateKey(project.targetDate)})`
        : 'No target date';
      return `<article class="project-card">
        <div class="project-card-head">
          ${statusTag(project.status)}
          <span class="tag tag-${escapeHtml(project.priority)}">${escapeHtml(priorityLabel(project.priority))}</span>
        </div>
        <a class="project-title" href="#/projects/${escapeHtml(project.id)}">${escapeHtml(project.name)}</a>
        <span class="list-sub">${escapeHtml(labelOf(PROJECT_CATEGORIES, project.category, 'Other'))} · ${escapeHtml(due)}</span>
        <div class="project-progress">
          ${bar(progress.percent)}
          <span class="mono">${escapeHtml(percentText(progress.percent))}</span>
        </div>
        <p class="project-next"><span class="meta-label">Next action</span> ${escapeHtml(next ?? 'Add a milestone or task to define the next step')}</p>
      </article>`;
    })
    .join('')}</div>`;
}

function renderWorkspace(project, data, today) {
  const milestones = data.milestones.filter((item) => item.projectId === project.id);
  const tasks = data.tasks.filter((item) => item.projectId === project.id);
  const progress = projectProgress(milestones, tasks);
  const timeline = projectTimeline(project, milestones, today);
  const openTasks = sortTasks(tasks.filter(isOpen), 'deadline');
  const doneTasks = tasks.filter((item) => !isOpen(item));
  const history = completionHistory(milestones, tasks).slice(0, 15);

  const milestoneRows = milestones.length
    ? openMilestones(milestones)
        .concat(milestones.filter((item) => item.done).sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')))
        .map((milestone) => `<li class="list-item${milestone.done ? ' is-done' : ''}">
          <button type="button" class="check-btn${milestone.done ? ' is-done' : ''}" data-action="toggle-milestone" data-id="${milestone.id}" aria-pressed="${milestone.done}" aria-label="Toggle ${escapeHtml(milestone.title)}">${milestone.done ? icon('check', 14) : ''}</button>
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(milestone.title)}</span>
            <span class="list-sub">${milestone.dueDate ? `Target ${escapeHtml(relativeDayLabel(milestone.dueDate, today).toLowerCase())} (${escapeHtml(formatDateKey(milestone.dueDate))})` : 'No target date'}${milestone.done && milestone.completedAt ? ` · completed ${escapeHtml(formatDateKey(dateKeyOfIso(milestone.completedAt)))}` : ''}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="icon-btn" data-action="edit-milestone" data-id="${milestone.id}" aria-label="Edit ${escapeHtml(milestone.title)}">${icon('edit', 16)}</button>
            <button type="button" class="icon-btn" data-action="delete-milestone" data-id="${milestone.id}" aria-label="Delete ${escapeHtml(milestone.title)}">${icon('trash', 16)}</button>
          </div>
        </li>`)
        .join('')
    : '<li class="list-empty">No milestones yet. Milestones mark the stages of this project.</li>';

  const timelineMarkup = timeline
    ? `<div class="timeline" aria-label="Project timeline">
        <div class="timeline-track">
          <span class="timeline-fill" style="width:${Math.round(timeline.todayRatio * 100)}%"></span>
          <span class="timeline-today" style="left:${Math.round(timeline.todayRatio * 100)}%" title="Today"></span>
          ${timeline.markers
            .map((marker) => `<span class="timeline-marker${marker.done ? ' is-done' : ''}" style="left:${Math.round(marker.ratio * 100)}%" title="${escapeHtml(marker.title)} · ${escapeHtml(formatDateKey(marker.dueDate))}"></span>`)
            .join('')}
        </div>
        <div class="timeline-labels"><span>${escapeHtml(formatDateKey(project.startDate, { day: 'numeric', month: 'short', year: 'numeric' }))}</span><span>${escapeHtml(formatDateKey(project.targetDate, { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      </div>`
    : `<p class="widget-hint">Add a start date and a target completion date to see the project timeline.</p>`;

  const taskRow = (task) => `<li class="task-row${isOpen(task) ? '' : ' is-done'}">
      ${isOpen(task)
        ? `<button type="button" class="check-btn" data-action="complete-task" data-id="${task.id}" aria-label="Complete ${escapeHtml(task.title)}"></button>`
        : `<button type="button" class="check-btn is-done" data-action="reopen-task" data-id="${task.id}" aria-label="Restore ${escapeHtml(task.title)}">${icon('check', 14)}</button>`}
      <div class="list-item-main">
        <span class="list-title">${escapeHtml(task.title)}</span>
        <span class="list-sub">${task.dueDate ? `Due ${escapeHtml(relativeDayLabel(task.dueDate, today).toLowerCase())}` : 'No due date'}${isOverdue(task, today, currentTimeKey()) && isOpen(task) ? ' · overdue' : ''}</span>
      </div>
      <div class="row-actions">
        <button type="button" class="icon-btn" data-action="edit-task" data-id="${task.id}" aria-label="Edit ${escapeHtml(task.title)}">${icon('edit', 16)}</button>
        <button type="button" class="icon-btn" data-action="delete-task" data-id="${task.id}" aria-label="Delete ${escapeHtml(task.title)}">${icon('trash', 16)}</button>
      </div>
    </li>`;

  const historyRows = history.length
    ? history
        .map((event) => `<li class="list-item">
          <span class="tag">${event.type === 'milestone' ? 'Milestone' : 'Task'}</span>
          <div class="list-item-main"><span class="list-title">${escapeHtml(event.title)}</span><span class="list-sub">${escapeHtml(formatDateKey(dateKeyOfIso(event.at), { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
        </li>`)
        .join('')
    : '<li class="list-empty">Completed milestones and tasks will appear here with their dates.</li>';

  return `<p class="back-link"><a href="#/projects">${icon('chevron', 14)} All projects</a></p>
    <section class="page-header">
      <p class="eyebrow">${escapeHtml(labelOf(PROJECT_CATEGORIES, project.category, 'Other'))}</p>
      <div class="header-row">
        <h1>${escapeHtml(project.name)}</h1>
        <div class="row-actions">
          <button type="button" class="btn" data-action="edit-project" data-id="${project.id}">${icon('edit', 16)} Edit details</button>
          <button type="button" class="btn btn-danger-ghost" data-action="delete-project" data-id="${project.id}">${icon('trash', 16)} Delete</button>
        </div>
      </div>
      <div class="status-row">
        <label class="inline-select">Status
          <select data-field="status" data-id="${project.id}" aria-label="Project status">
            ${PROJECT_STATUSES.map((item) => `<option value="${item.value}" ${item.value === project.status ? 'selected' : ''}>${escapeHtml(item.label)}</option>`).join('')}
          </select>
        </label>
        <span class="tag tag-${escapeHtml(project.priority)}">${escapeHtml(priorityLabel(project.priority))} priority</span>
      </div>
      ${project.description ? `<p class="lead">${escapeHtml(project.description)}</p>` : ''}
    </section>

    <div class="stat-grid stat-grid-5">
      <div class="stat-card"><span class="stat-label">Progress</span><span class="stat-value mono">${escapeHtml(percentText(progress.percent))}</span><span class="stat-sub">${progress.done} of ${progress.total} items done</span></div>
      <div class="stat-card"><span class="stat-label">Milestones</span><span class="stat-value mono">${milestones.filter((m) => m.done).length}/${milestones.length}</span><span class="stat-sub">Completed</span></div>
      <div class="stat-card"><span class="stat-label">Open tasks</span><span class="stat-value mono">${openTasks.length}</span><span class="stat-sub">Linked to this project</span></div>
      <div class="stat-card"><span class="stat-label">Target</span><span class="stat-value mono" style="font-size:16px">${project.targetDate ? escapeHtml(formatDateKey(project.targetDate)) : '–'}</span><span class="stat-sub">${project.targetDate ? escapeHtml(relativeDayLabel(project.targetDate, today)) : 'No target set'}</span></div>
      <div class="stat-card"><span class="stat-label">Next action</span><span class="stat-sub stat-next">${escapeHtml(nextActionFor(milestones, tasks) ?? 'None defined')}</span></div>
    </div>

    <section class="card section-block"><h2 class="section-title">Progress and timeline</h2>
      <div class="project-progress wide">${bar(progress.percent)}<span class="mono">${escapeHtml(percentText(progress.percent))}</span></div>
      ${timelineMarkup}
    </section>

    <div class="two-col">
      <section class="card">
        <div class="card-head"><h2 class="section-title">Milestones</h2>
          <button type="button" class="btn btn-sm" data-action="new-milestone" data-id="${project.id}">${icon('plus', 14)} Add</button></div>
        <ul class="list">${milestoneRows}</ul>
      </section>
      <section class="card">
        <div class="card-head"><h2 class="section-title">Tasks</h2>
          <button type="button" class="btn btn-sm" data-action="new-project-task" data-id="${project.id}">${icon('plus', 14)} Add task</button></div>
        <ul class="list">${openTasks.map(taskRow).join('') || '<li class="list-empty">No open tasks linked to this project.</li>'}</ul>
        ${doneTasks.length ? `<p class="widget-hint section-gap">${doneTasks.length} completed task${doneTasks.length === 1 ? '' : 's'}. Restore them from the Tasks page.</p>` : ''}
      </section>
    </div>

    <div class="two-col">
      <section class="card">
        <h2 class="section-title">Notes</h2>
        <textarea class="notes-area" data-field="notes" data-id="${project.id}" rows="7" placeholder="Decisions, links, blockers and ideas. Saved when you leave this field." aria-label="Project notes">${escapeHtml(project.notes ?? '')}</textarea>
      </section>
      <section class="card">
        <h2 class="section-title">Completion history</h2>
        <ul class="list">${historyRows}</ul>
      </section>
    </div>`;
}

// ---------- Page ----------

export function render(container, route, param) {
  const state = { filter: 'active' };
  let pendingNotes = null;
  let token = 0;
  let timer = null;
  const projectId = param || null;

  container.innerHTML = projectId
    ? '<div data-body></div>'
    : `<section class="page-header">
        <p class="eyebrow">Management</p>
        <div class="header-row">
          <h1>Projects</h1>
          <button type="button" class="btn btn-primary" data-action="new-project">${icon('plus', 16)} New project</button>
        </div>
        <p class="lead">Each project tracks milestones and tasks. Progress comes from what you have completed.</p>
      </section>
      <div class="view-tabs" role="tablist" aria-label="Project status">
        ${LIST_FILTERS.map((item) => `<button type="button" role="tab" class="tab" data-filter="${item.value}" aria-selected="${item.value === state.filter}">${escapeHtml(item.label)}</button>`).join('')}
      </div>
      <div data-body></div>`;

  const body = container.querySelector('[data-body]');

  async function refresh() {
    const current = ++token;
    try {
      const [projects, milestones, tasks] = await Promise.all([repos.projects.list(), repos.milestones.list(), repos.tasks.list()]);
      if (current !== token) return;
      const today = toDateKey();

      if (projectId) {
        const project = projects.find((item) => item.id === projectId);
        body.innerHTML = project
          ? renderWorkspace(project, { milestones, tasks }, today)
          : `<div class="card empty-state"><h2>Project not found</h2><p>It may have been deleted.</p><a class="btn" href="#/projects">Back to projects</a></div>`;
        // Keep text the user is typing when unrelated data changes trigger a re-render.
        if (pendingNotes && pendingNotes.id === projectId) {
          const area = body.querySelector('[data-field="notes"]');
          if (area) area.value = pendingNotes.value;
        }
        return;
      }

      container.querySelectorAll('[data-filter]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.filter === state.filter));
      });
      body.innerHTML = renderList(projects, milestones, tasks, state.filter, today);
    } catch (error) {
      console.error(error);
      body.innerHTML = `<div class="card empty-state"><h2>Projects could not be loaded</h2><p>${escapeHtml(error.message || '')}</p></div>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 40);
  }

  async function handle(action, id) {
    switch (action) {
      case 'new-project':
        return openProjectForm(null);
      case 'edit-project': {
        const project = await repos.projects.get(id);
        if (!project) throw new Error('That project no longer exists.');
        return openProjectForm(project);
      }
      case 'delete-project': {
        const deleted = await deleteProject(id);
        if (deleted) location.hash = '#/projects';
        return undefined;
      }
      case 'new-milestone':
        return openMilestoneForm(id);
      case 'edit-milestone': {
        const milestone = await repos.milestones.get(id);
        if (!milestone) throw new Error('That milestone no longer exists.');
        return openMilestoneForm(milestone.projectId, milestone);
      }
      case 'toggle-milestone': {
        const milestone = await repos.milestones.get(id);
        if (!milestone) throw new Error('That milestone no longer exists.');
        const done = !milestone.done;
        return updateRecord('milestones', id, { done, completedAt: done ? nowIso() : null });
      }
      case 'delete-milestone': {
        const milestone = await repos.milestones.get(id);
        if (!milestone) throw new Error('That milestone no longer exists.');
        const confirmed = await confirmDialog({ title: 'Delete milestone?', message: `Delete ${milestone.title}?`, confirmLabel: 'Delete', danger: true });
        if (confirmed) await deleteRecord('milestones', id);
        return undefined;
      }
      case 'new-project-task':
        return openTaskForm({ projectId: id });
      case 'edit-task': {
        const task = await repos.tasks.get(id);
        if (!task) throw new Error('That task no longer exists.');
        return openTaskForm({ task });
      }
      case 'delete-task':
        return deleteTaskById(id);
      case 'complete-task':
        return completeTaskById(id);
      case 'reopen-task':
        return reopenTaskById(id);
      default:
        return undefined;
    }
  }

  async function saveNotes(id, value) {
    if (value.length > 10000) throw new Error('Notes can be at most 10000 characters.');
    const project = await repos.projects.get(id);
    if (!project) throw new Error('That project no longer exists.');
    if ((project.notes ?? '') !== value) {
      await updateRecord('projects', id, { notes: value });
      toast('Notes saved.', 'success');
    }
    if (pendingNotes && pendingNotes.id === id && pendingNotes.value === value) pendingNotes = null;
  }

  async function changeStatus(id, value) {
    await updateRecord('projects', id, { status: value });
    toast('Status updated.', 'success');
  }

  function onClick(event) {
    const filter = event.target.closest('[data-filter]');
    if (filter && container.contains(filter) && !projectId) {
      state.filter = filter.dataset.filter;
      refresh();
      return;
    }
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !container.contains(trigger)) return;
    safely(() => handle(trigger.dataset.action, trigger.dataset.id));
  }

  function onChange(event) {
    const target = event.target;
    if (target.dataset.field === 'status' && target.dataset.id) {
      safely(() => changeStatus(target.dataset.id, target.value));
    }
  }

  function onInput(event) {
    const target = event.target;
    if (target.dataset.field === 'notes' && target.dataset.id) {
      pendingNotes = { id: target.dataset.id, value: target.value };
    }
  }

  function onBlur(event) {
    const target = event.target;
    if (target.dataset.field === 'notes' && target.dataset.id) {
      safely(() => saveNotes(target.dataset.id, target.value));
    }
  }

  container.addEventListener('click', onClick);
  container.addEventListener('change', onChange);
  container.addEventListener('focusout', onBlur);
  container.addEventListener('input', onInput);
  const unsubscribe = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
    container.removeEventListener('change', onChange);
    container.removeEventListener('focusout', onBlur);
    container.removeEventListener('input', onInput);
  };
}
