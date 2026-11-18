// Notifications. The badge and panel are built from the same deadline radar as the dashboard, so they always agree.

import { loadSnapshot } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { toDateKey, currentTimeKey } from '../domain/dates.js';
import { resolvePreferences } from '../domain/constants.js';
import { buildAlerts } from '../domain/alerts.js';

const MAX_LISTED = 25;

export function mountNotifications(slot) {
  slot.innerHTML = `
    <div class="notify-wrap">
      <button type="button" class="icon-btn notify-btn" data-notify-toggle aria-label="Notifications" aria-expanded="false" aria-haspopup="true">
        ${icon('bell', 18)}
        <span class="notify-badge" data-badge hidden></span>
      </button>
      <div class="notify-panel" data-panel hidden role="dialog" aria-label="Notifications"></div>
    </div>`;

  const toggle = slot.querySelector('[data-notify-toggle]');
  const badge = slot.querySelector('[data-badge]');
  const panel = slot.querySelector('[data-panel]');
  let alerts = [];
  let timer = null;

  async function load() {
    const snapshot = await loadSnapshot();
    const now = new Date();
    const prefs = resolvePreferences(snapshot.settings.preferences);
    alerts = buildAlerts({ ...snapshot, today: toDateKey(now), nowTime: currentTimeKey(now), prefs });
    badge.hidden = alerts.length === 0;
    badge.textContent = alerts.length > 9 ? '9+' : String(alerts.length);
    badge.setAttribute('aria-label', `${alerts.length} notifications`);
    if (!panel.hidden) paintPanel();
  }

  function paintPanel() {
    if (alerts.length === 0) {
      panel.innerHTML = `<div class="notify-head"><h2>Notifications</h2></div><p class="notify-empty">All clear. Nothing is overdue or inside your lookahead window.</p>`;
      return;
    }
    const rows = alerts
      .slice(0, MAX_LISTED)
      .map(
        (alert) => `<li class="alert-row alert-${escapeHtml(alert.severity)}">
          <span class="severity-dot" aria-hidden="true"></span>
          <a class="alert-main notify-link" href="#/${escapeHtml(alert.route)}" data-close-panel>
            <span class="alert-title">${escapeHtml(alert.title)}</span>
            <span class="alert-detail">${escapeHtml(alert.detail)}</span>
          </a>
        </li>`
      )
      .join('');
    panel.innerHTML = `<div class="notify-head"><h2>Notifications</h2><span class="list-sub">${alerts.length} in total</span></div>
      <ul class="alert-list notify-list">${rows}</ul>
      ${alerts.length > MAX_LISTED ? `<p class="notify-empty">Showing the first ${MAX_LISTED}.</p>` : ''}`;
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      paintPanel();
      load().catch((error) => console.error(error));
    }
  }

  toggle.addEventListener('click', (event) => {
    event.stopPropagation();
    setOpen(panel.hidden);
  });

  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-close-panel]')) setOpen(false);
  });

  document.addEventListener('click', (event) => {
    if (!panel.hidden && !slot.contains(event.target)) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
      toggle.focus();
    }
  });

  on('data', () => {
    clearTimeout(timer);
    timer = setTimeout(() => load().catch((error) => console.error(error)), 80);
  });

  // Overdue status changes with the clock, so recheck once a minute.
  setInterval(() => load().catch((error) => console.error(error)), 60000);
  load().catch((error) => console.error(error));
}
