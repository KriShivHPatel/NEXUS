// Performance intelligence. Every figure is either measured (counted from stored records) or calculated (a documented formula).
// Each card is labelled so you can tell which is which.

import { loadSnapshot } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { toDateKey, currentTimeKey, addDays, lastDays, formatDateKey, weekdayShort, dateKeyOfIso, relativeDayLabel } from '../domain/dates.js';
import { resolvePreferences, FOCUS_MODES, labelOf } from '../domain/constants.js';
import { daySummary, windowSummary, habitLogSet } from '../domain/analytics.js';
import { barChart, lineChart } from '../components/charts.js';

const MODES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

function percent(value) {
  return value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`;
}

function measured() {
  return '<span class="tag tag-measured">Measured</span>';
}

function calculated() {
  return '<span class="tag tag-calculated">Calculated</span>';
}

function metricCard(label, value, sub, badge) {
  return `<div class="stat-card">
    <div class="stat-head"><span class="stat-label">${escapeHtml(label)}</span>${badge}</div>
    <span class="stat-value mono">${escapeHtml(String(value))}</span>
    <span class="stat-sub">${escapeHtml(sub)}</span>
  </div>`;
}

const METHOD_NOTE = `<details class="method">
  <summary>How the productivity score is calculated</summary>
  <p>The score is a weighted average of the components that have data for the period: task completion rate (40%), habit completion rate (30%) and focus against your daily target (30%). A component with no data is left out and the remaining weights are rescaled. If nothing has data, the score is shown as a dash rather than a guess.</p>
  <p>Task completion rate is completions divided by the sum of completions and open tasks that were past due on that day. Habit completion is habits logged divided by active habits. Focus rate is focused minutes divided by your daily target, capped at 100%.</p>
</details>`;

function renderDaily(ctx, day) {
  const summary = daySummary(day, ctx);
  const completed = ctx.tasks
    .flatMap((task) =>
      (task.completions ?? [])
        .filter((iso) => dateKeyOfIso(iso) === day)
        .map((iso) => ({ title: task.title, at: iso }))
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const sessions = ctx.sessions
    .filter((session) => dateKeyOfIso(session.startedAt) === day)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));

  const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

  return `<div class="stat-grid stat-grid-5">
      ${metricCard('Tasks completed', summary.tasksCompleted, 'Completions recorded this day', measured())}
      ${metricCard('Tasks missed', summary.tasksMissed, 'Open tasks past their due date', measured())}
      ${metricCard('Focus', Math.round(summary.focusMinutes), `minutes against a ${ctx.focusTarget} minute target`, measured())}
      ${metricCard('Habits', `${summary.habitsDone}/${summary.habitsActive}`, 'Habits logged this day', measured())}
      ${metricCard('Productivity score', summary.score === null ? '–' : summary.score, summary.score === null ? 'No data for this day' : 'Out of 100', calculated())}
    </div>
    <div class="two-col">
      <section class="card">
        <h2 class="section-title">Score components</h2>
        <ul class="breakdown">
          <li><span>Task completion (40%)</span><span class="mono">${percent(summary.taskRate)}</span></li>
          <li><span>Habit completion (30%)</span><span class="mono">${percent(summary.habitRate)}</span></li>
          <li><span>Focus against target (30%)</span><span class="mono">${percent(summary.focusRate)}</span></li>
        </ul>
        ${METHOD_NOTE}
      </section>
      <section class="card">
        <h2 class="section-title">What happened</h2>
        <ul class="list">
          ${completed.length
            ? completed.map((item) => `<li class="list-item"><span class="mono meta">${escapeHtml(timeOf(item.at))}</span><span class="list-title">${escapeHtml(item.title)}</span></li>`).join('')
            : '<li class="list-empty">No tasks were completed on this day.</li>'}
        </ul>
        <h3 class="sub-heading">Focus sessions</h3>
        <ul class="list">
          ${sessions.length
            ? sessions
                .map((session) => `<li class="list-item">
                  <span class="mono meta">${escapeHtml(timeOf(session.startedAt))}</span>
                  <div class="list-item-main"><span class="list-title">${escapeHtml(labelOf(FOCUS_MODES, session.type, 'Focus'))} · ${Math.round((session.focusedSec ?? 0) / 60)} min</span>
                  <span class="list-sub">${session.completed ? 'Completed' : 'Ended early'}</span></div>
                </li>`)
                .join('')
            : '<li class="list-empty">No focus sessions on this day.</li>'}
        </ul>
      </section>
    </div>`;
}

function snapshotSeries(snapshotValues, days, key) {
  return days.map((day) => {
    const record = snapshotValues[`progress:${day}`];
    return { day, value: record && record[key] !== null && record[key] !== undefined ? record[key] : null };
  });
}

function renderWindow(days, summary, settings, mode, currentAcademic) {
  const focusData = summary.summaries.map((item, index) => ({
    label: formatDateKey(item.day, { weekday: 'long', day: 'numeric', month: 'short' }),
    short: mode === 'weekly' ? weekdayShort(item.day) : (index % 5 === 0 || index === days.length - 1 ? formatDateKey(item.day, { day: 'numeric', month: 'short' }) : ''),
    value: Math.round(item.focusMinutes),
  }));
  const completionData = summary.summaries.map((item, index) => ({
    label: formatDateKey(item.day, { weekday: 'long', day: 'numeric', month: 'short' }),
    short: mode === 'weekly' ? weekdayShort(item.day) : (index % 5 === 0 || index === days.length - 1 ? formatDateKey(item.day, { day: 'numeric', month: 'short' }) : ''),
    value: item.tasksCompleted,
  }));
  const scoreData = summary.summaries.map((item, index) => ({
    label: formatDateKey(item.day, { weekday: 'long', day: 'numeric', month: 'short' }),
    short: mode === 'weekly' ? weekdayShort(item.day) : (index % 5 === 0 || index === days.length - 1 ? formatDateKey(item.day, { day: 'numeric', month: 'short' }) : ''),
    value: item.score,
  }));

  const academicSeries = snapshotSeries(settings, days, 'academic');
  const projectSeries = snapshotSeries(settings, days, 'projects');
  const recordedAcademic = academicSeries.filter((item) => item.value !== null);
  const recordedProjects = projectSeries.filter((item) => item.value !== null);

  const academicChart = academicSeries.map((item, index) => ({
    label: formatDateKey(item.day, { day: 'numeric', month: 'short' }),
    short: mode === 'weekly' ? weekdayShort(item.day) : (index % 5 === 0 || index === days.length - 1 ? formatDateKey(item.day, { day: 'numeric', month: 'short' }) : ''),
    value: item.value,
  }));
  const projectChart = projectSeries.map((item, index) => ({
    label: formatDateKey(item.day, { day: 'numeric', month: 'short' }),
    short: mode === 'weekly' ? weekdayShort(item.day) : (index % 5 === 0 || index === days.length - 1 ? formatDateKey(item.day, { day: 'numeric', month: 'short' }) : ''),
    value: item.value,
  }));

  const best = summary.mostProductiveDay ? formatDateKey(summary.mostProductiveDay, { weekday: 'short', day: 'numeric', month: 'short' }) : '–';

  return `<div class="stat-grid stat-grid-5">
      ${metricCard('Focus total', Math.round(summary.focusMinutes), `minutes across ${days.length} days`, measured())}
      ${metricCard('Tasks completed', summary.completed, `${summary.missed} still past due`, measured())}
      ${metricCard('Completion rate', percent(summary.completionRate), 'Completed ÷ (completed + past due)', calculated())}
      ${metricCard('Habit consistency', percent(summary.habitConsistency), 'Days with at least one habit logged', calculated())}
      ${metricCard('Most productive day', best, summary.averageScore === null ? 'No scored days yet' : `Average score ${summary.averageScore}`, calculated())}
    </div>
    <div class="chart-grid">
      <section class="card"><h2 class="section-title">Focus minutes per day</h2>
        <div class="chart-wrap">${barChart({ data: focusData, height: 170, ariaLabel: `Focus minutes per day, ${mode} view`, unit: ' minutes' })}</div></section>
      <section class="card"><h2 class="section-title">Tasks completed per day</h2>
        <div class="chart-wrap">${barChart({ data: completionData, height: 170, ariaLabel: `Tasks completed per day, ${mode} view` })}</div></section>
      <section class="card"><h2 class="section-title">Productivity score ${calculated()}</h2>
        <div class="chart-wrap">${lineChart({ data: scoreData, height: 170, max: 100, unit: '', ariaLabel: `Productivity score per day, ${mode} view` })}</div>
        <p class="widget-hint">Gaps mean the day had no data for the score.</p></section>
      <section class="card"><h2 class="section-title">Academic progress ${measured()}</h2>
        ${recordedAcademic.length
          ? `<div class="chart-wrap">${lineChart({ data: academicChart, height: 170, max: 100, ariaLabel: 'Syllabus completion over recorded days' })}</div>`
          : '<p class="widget-hint">No recorded values in this period. A value is recorded each day you open NEXUS, so this trend builds over time.</p>'}
        <p class="widget-hint">Current: ${escapeHtml(percent(currentAcademic === null ? null : currentAcademic / 100))}</p></section>
      <section class="card"><h2 class="section-title">Project progress ${measured()}</h2>
        ${recordedProjects.length
          ? `<div class="chart-wrap">${lineChart({ data: projectChart, height: 170, max: 100, ariaLabel: 'Average active project progress over recorded days' })}</div>`
          : '<p class="widget-hint">No recorded project values in this period yet.</p>'}
      </section>
    </div>
    ${METHOD_NOTE}`;
}

// ---------- Page ----------

export function render(container) {
  const state = { mode: 'daily', anchor: toDateKey() };
  let token = 0;
  let timer = null;

  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow">Intelligence</p>
      <h1>Performance</h1>
      <p class="lead">Measured activity and calculated indicators from your records. Nothing is estimated or invented.</p>
    </section>
    <div class="toolbar-row">
      <div class="view-tabs" role="tablist" aria-label="Period">
        ${MODES.map((mode) => `<button type="button" role="tab" class="tab" data-mode="${mode.value}" aria-selected="${mode.value === state.mode}">${escapeHtml(mode.label)}</button>`).join('')}
      </div>
      <div class="date-nav">
        <button type="button" class="icon-btn" data-nav="prev" aria-label="Previous period">${icon('chevronLeft', 16)}</button>
        <span class="date-label mono" data-range></span>
        <button type="button" class="icon-btn" data-nav="next" aria-label="Next period">${icon('chevron', 16)}</button>
        <button type="button" class="btn btn-sm" data-nav="today">Today</button>
      </div>
    </div>
    <div data-body></div>`;

  const body = container.querySelector('[data-body]');
  const rangeLabel = container.querySelector('[data-range]');

  function windowDays() {
    if (state.mode === 'daily') return [state.anchor];
    if (state.mode === 'weekly') return lastDays(7, state.anchor);
    return lastDays(30, state.anchor);
  }

  async function refresh() {
    const current = ++token;
    try {
      const snapshot = await loadSnapshot();
      if (current !== token) return;
      const now = new Date();
      const today = toDateKey(now);
      const prefs = resolvePreferences(snapshot.settings.preferences);
      const ctx = {
        tasks: snapshot.tasks,
        sessions: snapshot.focusSessions,
        habits: snapshot.habits,
        logs: snapshot.habitLogs,
        focusTarget: prefs.dailyFocusMinutes,
        today,
        nowTime: currentTimeKey(now),
      };

      container.querySelectorAll('[data-mode]').forEach((tab) => {
        tab.setAttribute('aria-selected', String(tab.dataset.mode === state.mode));
      });

      const days = windowDays();
      rangeLabel.textContent = days.length === 1
        ? `${relativeDayLabel(days[0], today)} · ${formatDateKey(days[0], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}`
        : `${formatDateKey(days[0])} – ${formatDateKey(days[days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`;

      if (state.mode === 'daily') {
        body.innerHTML = renderDaily(ctx, state.anchor);
      } else {
        const summary = windowSummary(days, ctx);
        const completedTopics = snapshot.topics.filter((topic) => topic.completed).length;
        const currentAcademic = snapshot.topics.length ? Math.round((completedTopics / snapshot.topics.length) * 100) : null;
        body.innerHTML = renderWindow(days, summary, snapshot.settings, state.mode, currentAcademic);
      }
    } catch (error) {
      console.error(error);
      body.innerHTML = `<div class="card empty-state"><h2>Performance could not be calculated</h2><p>${escapeHtml(error.message || '')}</p></div>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 60);
  }

  function shift(direction) {
    if (direction === 'today') state.anchor = toDateKey();
    else {
      const step = state.mode === 'daily' ? 1 : state.mode === 'weekly' ? 7 : 30;
      state.anchor = addDays(state.anchor, direction === 'next' ? step : -step);
    }
    refresh();
  }

  function onClick(event) {
    const mode = event.target.closest('[data-mode]');
    if (mode && container.contains(mode)) {
      state.mode = mode.dataset.mode;
      refresh();
      return;
    }
    const nav = event.target.closest('[data-nav]');
    if (nav && container.contains(nav)) shift(nav.dataset.nav);
  }

  container.addEventListener('click', onClick);
  const unsubscribe = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
  };
}
