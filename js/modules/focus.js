// Focus page. Shows the timer and the sessions that were actually recorded.

import { loadSnapshot } from '../data.js';
import { on } from '../bus.js';
import { escapeHtml, icon } from '../utilities.js';
import { toDateKey, dateKeyOfIso, formatDateKey } from '../domain/dates.js';
import { FOCUS_MODES, labelOf } from '../domain/constants.js';
import { focusMinutesOn } from '../domain/analytics.js';
import { mountFocusTimer } from '../components/focus-timer.js';

export function render(container) {
  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow">Intelligence</p>
      <h1>Focus</h1>
      <p class="lead">Timed sessions linked to what you are working on. A session is recorded when it finishes or you finish it early.</p>
    </section>
    <div class="focus-layout">
      <section class="card focus-card"><div data-timer></div></section>
      <section class="card">
        <h2 class="section-title">Today</h2>
        <div class="stat-grid stat-grid-2" data-today></div>
      </section>
    </div>
    <section class="card">
      <h2 class="section-title">Recorded sessions</h2>
      <ul class="list" data-history></ul>
    </section>`;

  const unmountTimer = mountFocusTimer(container.querySelector('[data-timer]'));
  let timer = null;
  let token = 0;

  async function refresh() {
    const current = ++token;
    try {
      const snapshot = await loadSnapshot();
      if (current !== token) return;
      const today = toDateKey();
      const tasks = Object.fromEntries(snapshot.tasks.map((task) => [task.id, task.title]));
      const projects = Object.fromEntries(snapshot.projects.map((project) => [project.id, project.name]));
      const sessions = snapshot.focusSessions.slice().sort((a, b) => b.startedAt.localeCompare(a.startedAt));
      const sessionsToday = sessions.filter((session) => dateKeyOfIso(session.startedAt) === today);
      const minutesToday = Math.round(focusMinutesOn(snapshot.focusSessions, today));
      const target = snapshot.settings.preferences?.dailyFocusMinutes ?? 120;

      container.querySelector('[data-today]').innerHTML = `
        <div class="stat-card"><span class="stat-label">Focus minutes</span><span class="stat-value mono">${minutesToday}<small> / ${escapeHtml(String(target))}</small></span><span class="stat-sub">Daily target</span></div>
        <div class="stat-card"><span class="stat-label">Sessions</span><span class="stat-value mono">${sessionsToday.length}</span><span class="stat-sub">Recorded today</span></div>`;

      const rows = sessions.slice(0, 25).map((session) => {
        const minutes = Math.round((session.focusedSec ?? 0) / 60);
        const linked = session.taskId && tasks[session.taskId]
          ? tasks[session.taskId]
          : session.projectId && projects[session.projectId]
            ? projects[session.projectId]
            : 'No linked item';
        return `<li class="list-item">
          <div class="list-item-main">
            <span class="list-title">${escapeHtml(labelOf(FOCUS_MODES, session.type, 'Focus'))} · ${minutes} min</span>
            <span class="list-sub">${escapeHtml(formatDateKey(dateKeyOfIso(session.startedAt), { weekday: 'short', day: 'numeric', month: 'short' }))} · ${escapeHtml(linked)}</span>
          </div>
          <span class="tag${session.completed ? ' tag-medium' : ''}">${session.completed ? 'Completed' : 'Ended early'}</span>
        </li>`;
      });
      container.querySelector('[data-history]').innerHTML = rows.length
        ? rows.join('')
        : '<li class="list-empty">No sessions recorded yet. Start one above, and it will appear here when it finishes.</li>';
    } catch (error) {
      console.error(error);
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 60);
  }

  const unsubscribeData = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribeData();
    clearTimeout(timer);
    if (typeof unmountTimer === 'function') unmountTimer();
  };
}
