// Top bar. The focus pill appears only while a session is running and the Focus page is not open.

import { icon, isMacPlatform, escapeHtml } from '../utilities.js';
import { subscribe, getState } from '../state.js';
import { on } from '../bus.js';
import { formatClock } from '../domain/timer.js';
import { mountNotifications } from './notifications.js';
import { focusState } from './focus-engine.js';

export function mountHeader(root) {
  const modifier = isMacPlatform() ? '⌘' : 'Ctrl';

  root.innerHTML = `
    <button type="button" class="icon-btn" data-action="toggle-sidebar" aria-label="Toggle sidebar">${icon('panel', 18)}</button>
    <h2 class="topbar-title" data-title>${escapeHtml(getState().title)}</h2>
    <div class="topbar-spacer"></div>
    <a class="focus-pill" href="#/focus" data-focus-pill hidden>
      <span class="pulse" aria-hidden="true"></span>
      <span class="mono" data-focus-text></span>
    </a>
    <button type="button" class="search-trigger" data-action="open-palette" aria-label="Search or run a command">
      ${icon('search', 16)}
      <span>Search modules or run a command</span>
      <kbd class="kbd">${modifier} K</kbd>
    </button>
    <button type="button" class="icon-btn" data-action="quick-capture" aria-label="Quick capture" title="Quick capture (Alt+N)">${icon('zap', 18)}</button>
    <span data-notify-slot></span>
    <a class="icon-btn" href="#/settings" aria-label="Settings" title="Settings">${icon('settings', 18)}</a>
  `;

  const titleEl = root.querySelector('[data-title]');
  const pill = root.querySelector('[data-focus-pill]');
  const pillText = root.querySelector('[data-focus-text]');

  subscribe((state) => {
    titleEl.textContent = state.title;
    paintPill(focusState());
  });

  function paintPill(state) {
    const onFocusPage = getState().route === 'focus';
    if (!state || onFocusPage) {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    const label = formatClock(state.remainingMs);
    pillText.textContent = state.status === 'paused' ? `Paused · ${label}` : label;
    pill.setAttribute('aria-label', `Focus session ${state.status === 'paused' ? 'paused' : 'running'}, ${label} remaining`);
  }

  on('focus', paintPill);

  mountNotifications(root.querySelector('[data-notify-slot]'));
}
