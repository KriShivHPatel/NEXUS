// Dashboard widgets. Each renderer receives a context and returns markup. Interactive controls carry data-action attributes
// that the dashboard dispatches to shared actions. Widgets never write data themselves.

import { icon, escapeHtml } from '../utilities.js';
import { relativeDayLabel, weekdayShort, lastDays, formatDateKey } from '../domain/dates.js';
import { completionsOn, focusMinutesOn, habitStreak, habitLogSet } from '../domain/analytics.js';
import { isOpen, isOverdue, sortTasks } from '../domain/tasks.js';
import { projectProgress, nextActionFor } from '../domain/projects.js';
import { subjectProgress, pendingAssignments, nextExam } from '../domain/academics.js';
import { priorityLabel } from '../domain/constants.js';
import { barChart } from '../components/charts.js';
import { MAX_OBJECTIVES_PER_DAY } from '../actions.js';

function emptyState(message, link = null, linkLabel = '') {
  return `<div class="widget-empty">
    <p>${escapeHtml(message)}</p>
    ${link ? `<a class="btn btn-sm" href="${escapeHtml(link)}">${escapeHtml(linkLabel)}</a>` : ''}
  </div>`;
}

function checkButton(action, id, done, label) {
  return `<button type="button" class="check-btn${done ? ' is-done' : ''}" data-action="${action}" data-id="${escapeHtml(id)}" aria-pressed="${done}" aria-label="${escapeHtml(label)}">${done ? icon('check', 14) : ''}</button>`;
}

function renderStats({ snapshot, today }) {
  const openTasks = snapshot.tasks.filter(isOpen).length;
  const completed = completionsOn(snapshot.tasks, today);
  const focus = Math.round(focusMinutesOn(snapshot.focusSessions, today));
  const activeProjects = snapshot.projects.filter((project) => project.status === 'active').length;
  const streak = habitStreak(snapshot.habits, snapshot.habitLogs, today);

  const cards = [
    { label: 'Completed today', value: completed, sub: completed ? 'Tasks finished today' : 'Nothing finished yet' },
    { label: 'Pending', value: openTasks, sub: 'Open tasks' },
    { label: 'Focus today', value: focus, unit: 'min', sub: focus ? 'Recorded focus time' : 'No sessions yet' },
    { label: 'Active projects', value: activeProjects, sub: activeProjects ? 'In progress' : 'None marked active' },
    { label: 'Habit streak', value: streak, unit: 'days', sub: snapshot.habits.length ? 'Consecutive complete days' : 'No habits yet' },
  ];

  return `<div class="stat-grid">${cards
    .map(
      (card) => `<div class="stat-card">
        <span class="stat-label">${escapeHtml(card.label)}</span>
        <span class="stat-value mono">${card.value}${card.unit ? `<small> ${escapeHtml(card.unit)}</small>` : ''}</span>
        <span class="stat-sub">${escapeHtml(card.sub)}</span>
      </div>`
    )
    .join('')}</div>`;
}

function renderMission({ snapshot, today }) {
  const items = snapshot.objectives
    .filter((objective) => objective.date === today)
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));
  const done = items.filter((objective) => objective.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;

  const rows = items
    .map(
      (objective) => `<li class="objective${objective.done ? ' is-done' : ''}">
        ${checkButton('toggle-objective', objective.id, objective.done, objective.done ? 'Mark objective incomplete' : 'Mark objective complete')}
        <div class="objective-text">
          <span>${escapeHtml(objective.text)}</span>
          <span class="tag tag-${escapeHtml(objective.priority)}">${escapeHtml(priorityLabel(objective.priority))}</span>
        </div>
        <div class="row-actions">
          <button type="button" class="icon-btn" data-action="edit-objective" data-id="${escapeHtml(objective.id)}" aria-label="Edit objective">${icon('edit', 16)}</button>
          <button type="button" class="icon-btn" data-action="delete-objective" data-id="${escapeHtml(objective.id)}" aria-label="Remove objective">${icon('trash', 16)}</button>
        </div>
      </li>`
    )
    .join('');

  const footer =
    items.length < MAX_OBJECTIVES_PER_DAY
      ? `<button type="button" class="btn btn-block" data-action="add-objective">${icon('plus', 16)} Add objective</button>`
      : '<p class="widget-hint">All three objectives are set for today.</p>';

  return `<div class="progress-line">
      <span class="mono">${done}/${MAX_OBJECTIVES_PER_DAY}</span>
      <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
    </div>
    ${items.length ? `<ul class="objective-list">${rows}</ul>` : '<p class="widget-hint">Set up to three objectives that define a successful day.</p>'}
    ${footer}`;
}

function renderToday({ snapshot, today, nowTime }) {
  const due = sortTasks(
    snapshot.tasks.filter((task) => isOpen(task) && task.dueDate && task.dueDate <= today),
    'deadline'
  ).slice(0, 7);

  if (due.length === 0) {
    return emptyState('Nothing due today. Capture a task or open Tasks to plan the week.', '#/tasks', 'Open tasks');
  }

  const rows = due
    .map((task) => {
      const overdue = isOverdue(task, today, nowTime);
      const when = `${relativeDayLabel(task.dueDate, today)}${task.dueTime ? ` · ${task.dueTime}` : ''}`;
      return `<li class="task-row">
        ${checkButton('complete-task', task.id, false, `Complete ${task.title}`)}
        <div class="task-main">
          <span class="task-title">${escapeHtml(task.title)}</span>
          <span class="task-meta">
            <span class="tag tag-${escapeHtml(task.priority)}">${escapeHtml(priorityLabel(task.priority))}</span>
            <span class="${overdue ? 'text-danger' : ''}">${escapeHtml(when)}</span>
          </span>
        </div>
      </li>`;
    })
    .join('');

  return `<ul class="task-list">${rows}</ul><a class="widget-link" href="#/tasks">All tasks ${icon('chevron', 14)}</a>`;
}

function renderProductivity({ snapshot, today, prefs }) {
  const focusToday = Math.round(focusMinutesOn(snapshot.focusSessions, today));
  const completed = completionsOn(snapshot.tasks, today);
  const active = snapshot.habits;
  const logged = habitLogSet(snapshot.habitLogs);
  const doneHabits = active.filter((habit) => logged.has(`${habit.id}|${today}`)).length;

  const week = lastDays(7, today).map((day) => ({
    label: formatDateKey(day, { weekday: 'long', day: 'numeric', month: 'short' }),
    short: weekdayShort(day),
    value: Math.round(focusMinutesOn(snapshot.focusSessions, day)),
  }));

  const habitRows = active
    .map((habit) => {
      const checked = logged.has(`${habit.id}|${today}`);
      return `<li class="habit-row">
        ${checkButton('toggle-habit', habit.id, checked, `${checked ? 'Unmark' : 'Mark'} ${habit.name} for today`)}
        <span class="habit-name">${escapeHtml(habit.name)}</span>
        <button type="button" class="icon-btn" data-action="delete-habit" data-id="${escapeHtml(habit.id)}" aria-label="Delete habit ${escapeHtml(habit.name)}">${icon('x', 14)}</button>
      </li>`;
    })
    .join('');

  return `<div class="metric-row">
      <div class="metric"><span class="metric-label">Focus</span><span class="metric-value mono">${focusToday}<small> / ${prefs.dailyFocusMinutes} min</small></span></div>
      <div class="metric"><span class="metric-label">Tasks done</span><span class="metric-value mono">${completed}</span></div>
      <div class="metric"><span class="metric-label">Habits</span><span class="metric-value mono">${doneHabits}/${active.length}</span></div>
    </div>
    <div class="chart-wrap">${barChart({ data: week, ariaLabel: 'Focus minutes per day over the last seven days', unit: ' minutes' })}</div>
    <div class="section-head">
      <h3>Habits today</h3>
      <button type="button" class="btn btn-sm" data-action="add-habit">${icon('plus', 14)} Add habit</button>
    </div>
    ${active.length ? `<ul class="habit-list">${habitRows}</ul>` : '<p class="widget-hint">Track a daily habit. A streak counts consecutive days when every habit is completed.</p>'}`;
}

function renderAcademics({ snapshot, today }) {
  if (snapshot.subjects.length === 0) {
    return emptyState('No subjects yet. Add your semester and subjects to track syllabus progress.', '#/academics', 'Set up academics');
  }
  const rows = snapshot.subjects
    .slice(0, 4)
    .map((subject) => {
      const topics = snapshot.topics.filter((topic) => topic.subjectId === subject.id);
      const progress = subjectProgress(topics);
      const pending = pendingAssignments(snapshot.assignments, subject.id).length;
      const exam = nextExam(snapshot.exams, subject.id, today);
      return `<li class="compact-item">
        <div class="compact-head"><span class="compact-title">${escapeHtml(subject.name)}</span><span class="mono">${progress.percent ?? '–'}${progress.percent !== null ? '%' : ''}</span></div>
        <div class="bar"><span style="width:${progress.percent ?? 0}%"></span></div>
        <div class="compact-meta">
          <span>${pending} pending assignment${pending === 1 ? '' : 's'}</span>
          ${exam ? `<span>Next exam: ${escapeHtml(exam.name)}, ${escapeHtml(formatDateKey(exam.date))}</span>` : '<span>No exam scheduled</span>'}
        </div>
      </li>`;
    })
    .join('');
  return `<ul class="compact-list">${rows}</ul><a class="widget-link" href="#/academics">Academics ${icon('chevron', 14)}</a>`;
}

function renderProjects({ snapshot }) {
  const active = snapshot.projects.filter((project) => project.status === 'active').slice(0, 4);
  if (active.length === 0) {
    return emptyState('No active projects. Mark a project as active to follow its progress here.', '#/projects', 'Open projects');
  }
  const rows = active
    .map((project) => {
      const milestones = snapshot.milestones.filter((milestone) => milestone.projectId === project.id);
      const tasks = snapshot.tasks.filter((task) => task.projectId === project.id);
      const progress = projectProgress(milestones, tasks);
      const nextAction = nextActionFor(milestones, tasks);
      return `<li class="compact-item">
        <div class="compact-head"><a class="compact-title" href="#/projects/${escapeHtml(project.id)}">${escapeHtml(project.name)}</a><span class="mono">${progress.percent ?? '–'}${progress.percent !== null ? '%' : ''}</span></div>
        <div class="bar"><span style="width:${progress.percent ?? 0}%"></span></div>
        <div class="compact-meta"><span>Next: ${escapeHtml(nextAction ?? 'Add a milestone to define the next step')}</span></div>
      </li>`;
    })
    .join('');
  return `<ul class="compact-list">${rows}</ul><a class="widget-link" href="#/projects">Projects ${icon('chevron', 14)}</a>`;
}

function renderRadar({ alerts }) {
  if (alerts.length === 0) {
    return emptyState('All clear. Nothing is overdue or due within your lookahead window.');
  }
  const rows = alerts
    .slice(0, 6)
    .map(
      (alert) => `<li class="alert-row alert-${escapeHtml(alert.severity)}">
        <span class="severity-dot" aria-hidden="true"></span>
        <div class="alert-main">
          <a class="alert-title" href="#/${escapeHtml(alert.route)}">${escapeHtml(alert.title)}</a>
          <span class="alert-detail">${escapeHtml(alert.detail)}</span>
        </div>
      </li>`
    )
    .join('');
  return `<ul class="alert-list">${rows}</ul>${alerts.length > 6 ? `<p class="widget-hint">${alerts.length - 6} more in the notifications panel.</p>` : ''}`;
}

export const WIDGETS = [
  { id: 'stats', title: 'Today at a glance', span: 2, render: renderStats },
  { id: 'mission', title: 'Mission Control', span: 1, render: renderMission },
  { id: 'today', title: 'Due today', span: 1, render: renderToday },
  { id: 'productivity', title: 'Productivity and habits', span: 2, render: renderProductivity },
  { id: 'academics', title: 'Academic overview', span: 1, render: renderAcademics },
  { id: 'projects', title: 'Project overview', span: 1, render: renderProjects },
  { id: 'radar', title: 'Deadline radar', span: 2, render: renderRadar },
  { id: 'focus', title: 'Focus timer', span: 1, render: () => '<div class="focus-mount" data-focus-mount></div>' },
];

