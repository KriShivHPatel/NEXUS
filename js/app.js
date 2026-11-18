// Application entry point. Mounts the shell, wires global shortcuts, starts the focus engine and daily progress recording.

import { startRouter } from './router.js';
import { mountSidebar } from './components/sidebar.js';
import { mountHeader } from './components/header.js';
import { mountPalette, openPalette, togglePalette, closePalette, isPaletteOpen } from './components/command-palette.js';
import { openQuickCapture } from './components/quick-capture.js';
import { initFocus } from './components/focus-engine.js';
import { getState, setState, subscribe, writePreference } from './state.js';
import { formatTime } from './utilities.js';
import { on } from './bus.js';
import { toDateKey } from './domain/dates.js';
import { recordDailyProgress } from './data.js';

function isModalOpen() {
  return Boolean(document.querySelector('.modal-backdrop'));
}

function startClock() {
  const tick = () => {
    const text = formatTime(new Date());
    document.querySelectorAll('[data-clock]').forEach((node) => {
      if (node.textContent !== text) node.textContent = text;
    });
  };
  tick();
  setInterval(tick, 1000);
}

function wireGlobalShortcuts() {
  document.addEventListener('keydown', (event) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (modifier && !event.altKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (!isModalOpen()) togglePalette();
    } else if (event.altKey && !modifier && event.code === 'KeyN') {
      if (isModalOpen() || isPaletteOpen()) return;
      event.preventDefault();
      openQuickCapture();
    } else if (event.key === 'Escape' && isPaletteOpen()) {
      closePalette();
    }
  });
}

function wireActions() {
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    switch (trigger.dataset.action) {
      case 'toggle-sidebar':
        setState({ sidebarCollapsed: !getState().sidebarCollapsed });
        break;
      case 'open-palette':
        openPalette();
        break;
      case 'quick-capture':
        openQuickCapture();
        break;
      default:
        break;
    }
  });
}

function persistPreferences() {
  let previous = getState().sidebarCollapsed;
  subscribe((state) => {
    if (state.sidebarCollapsed !== previous) {
      previous = state.sidebarCollapsed;
      writePreference('sidebarCollapsed', previous);
    }
  });
}

// Records today's academic and project progress. Writes are silent, so recording never triggers a refresh loop.
function wireProgressRecording() {
  let timer = null;
  const record = () =>
    recordDailyProgress(toDateKey()).catch((error) => console.error('Progress could not be recorded.', error));
  on('data', () => {
    clearTimeout(timer);
    timer = setTimeout(record, 1500);
  });
  record();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!/^https?:$/.test(location.protocol)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((error) => {
      console.error('Service worker registration failed', error);
    });
  });
}

function init() {
  const sidebarRoot = document.getElementById('sidebar');
  const topbarRoot = document.getElementById('topbar');
  const contentRoot = document.getElementById('content');
  const overlayRoot = document.getElementById('overlays');
  if (!sidebarRoot || !topbarRoot || !contentRoot || !overlayRoot) {
    console.error('NEXUS shell markup is missing required regions.');
    return;
  }

  // Initial preference for the sidebar, then the shell.
  mountSidebar(sidebarRoot);
  mountHeader(topbarRoot);
  mountPalette(overlayRoot);
  wireActions();
  wireGlobalShortcuts();
  persistPreferences();
  startClock();
  startRouter(contentRoot);
  initFocus().catch((error) => console.error('The focus timer could not be restored.', error));
  wireProgressRecording();
  registerServiceWorker();
}

init();
