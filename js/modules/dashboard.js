// Command Centre. Renders the widget grid, supports customisation, and refreshes whenever stored data changes.

import { loadSnapshot, setSetting } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml, greeting, formatDate, formatTime } from '../utilities.js';
import { toDateKey, currentTimeKey, dayOfYear } from '../domain/dates.js';
import { resolvePreferences } from '../domain/constants.js';
import { buildAlerts } from '../domain/alerts.js';
import { defaultLayout, normaliseLayout, moveWidget, setWidgetVisible } from '../domain/layout.js';
import { WIDGETS } from './dashboard-widgets.js';
import {
  completeTaskById,
  addObjective,
  toggleObjective,
  editObjective,
  deleteObjective,
  toggleHabit,
  addHabit,
  deleteHabit,
} from '../actions.js';
import { toast } from '../components/toast.js';
import { mountFocusTimer } from '../components/focus-timer.js';

const CONTEXT_MESSAGES = [
  'Decide what matters most before anything else competes for your attention.',
  'Three clear objectives beat thirty vague ones.',
  'Progress is quiet. Show up, and the record will speak for itself.',
  'Start with the hardest honest task while your focus is fresh.',
  'Protect one block of uninterrupted time today.',
];

const WIDGET_BY_ID = Object.fromEntries(WIDGETS.map((widget) => [widget.id, widget]));
const DEFAULT_ORDER = WIDGETS.map((widget) => widget.id);

export function render(container) {
  const now = new Date();
  let layout = defaultLayout(DEFAULT_ORDER);
  let editing = false;
  let lastContext = null;
  let refreshToken = 0;
  let refreshTimer = null;
  let statusTimer = null;

  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow mono" data-date-line>${escapeHtml(formatDate(now))}</p>
      <div class="header-row">
        <h1 data-greeting>${escapeHtml(greeting(now))}</h1>
        <span class="clock-readout mono" data-clock>${formatTime(now)}</span>
      </div>
      <p class="lead" data-message>${escapeHtml(CONTEXT_MESSAGES[dayOfYear(now) % CONTEXT_MESSAGES.length])}</p>
    </section>

    <div class="dash-toolbar">
      <button type="button" class="btn" data-toggle-edit aria-pressed="false">${icon('settings', 16)} Customise</button>
      <span class="save-status" data-save-status aria-live="polite"></span>
    </div>
    <div class="layout-panel" data-layout-panel hidden></div>
    <div class="widget-grid" data-grid><p class="loading">Loading your workspace…</p></div>
  `;

  const grid = container.querySelector('[data-grid]');
  const panel = container.querySelector('[data-layout-panel]');
  const toggleButton = container.querySelector('[data-toggle-edit]');
  const saveStatus = container.querySelector('[data-save-status]');

  function renderGrid() {
    if (!lastContext) return;
    const visible = layout.filter((entry) => entry.visible).map((entry) => WIDGET_BY_ID[entry.id]).filter(Boolean);
    grid.classList.toggle('is-editing', editing);

    grid.innerHTML = visible
      .map((widget, index) => {
        let body;
        try {
          body = widget.render(lastContext);
        } catch (error) {
          console.error(`Widget "${widget.id}" failed`, error);
          body = '<p class="widget-hint">This widget could not be displayed. Other widgets are unaffected.</p>';
        }
        const controls = editing
          ? `<div class="widget-controls">
              <button type="button" class="icon-btn" data-layout="up" data-id="${widget.id}" ${index === 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(widget.title)} up">${icon('arrowUp', 16)}</button>
              <button type="button" class="icon-btn" data-layout="down" data-id="${widget.id}" ${index === visible.length - 1 ? 'disabled' : ''} aria-label="Move ${escapeHtml(widget.title)} down">${icon('arrowDown', 16)}</button>
              <button type="button" class="icon-btn" data-layout="hide" data-id="${widget.id}" aria-label="Hide ${escapeHtml(widget.title)}">${icon('eyeOff', 16)}</button>
            </div>`
          : '';
        return `<section class="widget widget-span-${widget.span}" data-widget-id="${widget.id}" aria-label="${escapeHtml(widget.title)}">
          <header class="widget-head"><h2>${escapeHtml(widget.title)}</h2>${controls}</header>
          <div class="widget-body">${body}</div>
        </section>`;
      })
      .join('');

    grid.querySelectorAll('[data-focus-mount]').forEach((element) => mountFocusTimer(element, { compact: true }));

    if (editing) {
      const hidden = layout.filter((entry) => !entry.visible).map((entry) => WIDGET_BY_ID[entry.id]).filter(Boolean);
      panel.hidden = false;
      panel.innerHTML = `<div class="layout-panel-inner">
          <div>
            <h3>Hidden widgets</h3>
            ${hidden.length
              ? `<div class="chip-row">${hidden
                  .map((widget) => `<button type="button" class="chip" data-layout="show" data-id="${widget.id}">${icon('plus', 14)} ${escapeHtml(widget.title)}</button>`)
                  .join('')}</div>`
              : '<p class="widget-hint">Every widget is visible.</p>'}
          </div>
          <div class="layout-actions">
            <button type="button" class="btn" data-layout="reset">${icon('rotate', 16)} Restore default layout</button>
          </div>
        </div>`;
    } else {
      panel.hidden = true;
      panel.innerHTML = '';
    }
  }

  async function refresh() {
    const token = ++refreshToken;
    try {
      const snapshot = await loadSnapshot();
      if (token !== refreshToken) return;

      const prefs = resolvePreferences(snapshot.settings.preferences);
      layout = normaliseLayout(snapshot.settings.dashboardLayout, DEFAULT_ORDER, DEFAULT_ORDER);

      const current = new Date();
      const today = toDateKey(current);
      const nowTime = currentTimeKey(current);
      const alerts = buildAlerts({ ...snapshot, today, nowTime, prefs });
      lastContext = { snapshot, today, nowTime, prefs, alerts };

      container.querySelector('[data-date-line]').textContent = formatDate(current);
      const name = prefs.name ? `, ${prefs.name}` : '';
      container.querySelector('[data-greeting]').textContent = `${greeting(current)}${name}`;

      renderGrid();
    } catch (error) {
      console.error(error);
      grid.innerHTML = `<div class="card empty-state">
        <h2>Your workspace could not be loaded</h2>
        <p>${escapeHtml(error.message || 'An unknown error occurred.')}</p>
      </div>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 60);
  }

  async function persistLayout() {
    saveStatus.textContent = 'Saving…';
    try {
      await setSetting('dashboardLayout', { widgets: layout });
      saveStatus.textContent = 'Layout saved';
    } catch (error) {
      saveStatus.textContent = '';
      toast('Your layout could not be saved. Check that storage is available.', 'error');
    }
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      saveStatus.textContent = '';
    }, 2200);
  }

  async function applyLayout(operation, id) {
    const previous = layout;
    if (operation === 'up') layout = moveWidget(layout, id, -1);
    else if (operation === 'down') layout = moveWidget(layout, id, 1);
    else if (operation === 'hide') layout = setWidgetVisible(layout, id, false);
    else if (operation === 'show') layout = setWidgetVisible(layout, id, true);
    else if (operation === 'reset') layout = defaultLayout(DEFAULT_ORDER);
    else return;
    if (layout === previous) return;
    renderGrid();
    await persistLayout();
  }

  function dispatchAction(action, id) {
    const today = lastContext?.today ?? toDateKey();
    switch (action) {
      case 'complete-task':
        return completeTaskById(id);
      case 'toggle-objective':
        return toggleObjective(id);
      case 'edit-objective':
        return editObjective(id);
      case 'delete-objective':
        return deleteObjective(id);
      case 'add-objective':
        return addObjective(today);
      case 'toggle-habit':
        return toggleHabit(id, today);
      case 'add-habit':
        return addHabit();
      case 'delete-habit':
        return deleteHabit(id);
      default:
        return undefined;
    }
  }

  function onClick(event) {
    const trigger = event.target.closest('[data-action],[data-layout],[data-toggle-edit]');
    if (!trigger || !container.contains(trigger)) return;

    if (trigger.hasAttribute('data-toggle-edit')) {
      editing = !editing;
      toggleButton.setAttribute('aria-pressed', String(editing));
      toggleButton.innerHTML = `${icon(editing ? 'check' : 'settings', 16)} ${editing ? 'Done customising' : 'Customise'}`;
      renderGrid();
      return;
    }
    if (trigger.dataset.layout) {
      applyLayout(trigger.dataset.layout, trigger.dataset.id);
      return;
    }
    if (trigger.dataset.action) {
      dispatchAction(trigger.dataset.action, trigger.dataset.id);
    }
  }

  container.addEventListener('click', onClick);
  const unsubscribe = on('data', scheduleRefresh);
  const minuteTimer = setInterval(scheduleRefresh, 60000);
  refresh();

  return () => {
    unsubscribe();
    clearInterval(minuteTimer);
    clearTimeout(refreshTimer);
    clearTimeout(statusTimer);
    container.removeEventListener('click', onClick);
  };
}
