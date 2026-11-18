// Command palette (Ctrl/Cmd + K). Searches modules and runs commands.
// Commands are data: each has a label, an optional hint and a run() function.
// Task, project and academic search are added to this same registry in later milestones.

import { ROUTES } from '../router.js';
import { icon, escapeHtml } from '../utilities.js';
import { getState, setState } from '../state.js';
import { openQuickCapture } from './quick-capture.js';

let backdrop = null;
let input = null;
let list = null;
let commands = [];
let visible = [];
let activeIndex = 0;
let returnFocusTo = null;

function buildCommands() {
  const navigation = ROUTES.map((route) => ({
    id: `go-${route.id}`,
    label: `Go to ${route.title}`,
    hint: route.milestone ? `Built in ${route.milestone}` : 'Module',
    icon: route.icon,
    keywords: `${route.title} ${route.id} navigate open`,
    run: () => {
      location.hash = `#/${route.id}`;
    },
  }));

  const system = [
    {
      id: 'toggle-sidebar',
      label: 'Toggle sidebar',
      hint: 'Layout',
      icon: 'panel',
      keywords: 'sidebar collapse expand menu',
      run: () => setState({ sidebarCollapsed: !getState().sidebarCollapsed }),
    },
  ];

  system.push({
    id: 'quick-capture',
    label: 'Quick capture',
    hint: 'Alt+N',
    icon: 'zap',
    keywords: 'capture note task idea reflection write',
    run: () => openQuickCapture(),
  });

  return [...navigation, ...system];
}

function filterCommands(query) {
  const normalised = query.trim().toLowerCase();
  if (!normalised) return commands;
  const terms = normalised.split(/\s+/);
  return commands.filter((command) => {
    const haystack = `${command.label} ${command.keywords}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

function renderList() {
  if (visible.length === 0) {
    list.innerHTML = `<li class="palette-empty">No matching modules or commands.</li>`;
    return;
  }

  list.innerHTML = visible.map((command, index) => `
    <li class="palette-item ${index === activeIndex ? 'active' : ''}"
        role="option"
        aria-selected="${index === activeIndex}"
        data-index="${index}">
      ${icon(command.icon, 16)}
      <span>${escapeHtml(command.label)}</span>
      <span class="hint">${escapeHtml(command.hint || '')}</span>
    </li>`).join('');

  const active = list.querySelector('.palette-item.active');
  active?.scrollIntoView({ block: 'nearest' });
}

function refresh(query) {
  visible = filterCommands(query);
  activeIndex = 0;
  renderList();
}

function runCommand(index) {
  const command = visible[index];
  if (!command) return;
  closePalette();
  command.run();
}

export function isPaletteOpen() {
  return backdrop !== null && !backdrop.hidden;
}

export function openPalette(prefill = '') {
  if (!backdrop) return;
  returnFocusTo = document.activeElement;
  backdrop.hidden = false;
  input.value = prefill;
  refresh(prefill);
  input.focus();
}

export function closePalette() {
  if (!backdrop || backdrop.hidden) return;
  backdrop.hidden = true;
  if (returnFocusTo && typeof returnFocusTo.focus === 'function') {
    returnFocusTo.focus({ preventScroll: true });
  }
  returnFocusTo = null;
}

export function togglePalette() {
  if (isPaletteOpen()) {
    closePalette();
  } else {
    openPalette();
  }
}

export function mountPalette(container) {
  commands = buildCommands();

  container.innerHTML = `
    <div class="palette-backdrop" data-palette-backdrop hidden>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-input-row">
          ${icon('search', 18)}
          <input type="text"
                 placeholder="Search modules or run a command"
                 aria-label="Search modules or run a command"
                 aria-controls="palette-list"
                 autocomplete="off"
                 spellcheck="false" />
          <kbd class="kbd">Esc</kbd>
        </div>
        <ul class="palette-list" id="palette-list" role="listbox"></ul>
        <div class="palette-footer mono">
          <span>↑ ↓ navigate</span>
          <span>↵ open</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  `;

  backdrop = container.querySelector('[data-palette-backdrop]');
  input = container.querySelector('input');
  list = container.querySelector('#palette-list');

  input.addEventListener('input', () => refresh(input.value));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (visible.length) {
        activeIndex = (activeIndex + 1) % visible.length;
        renderList();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (visible.length) {
        activeIndex = (activeIndex - 1 + visible.length) % visible.length;
        renderList();
      }
    } else if (event.key === 'Enter') {
      event.preventDefault();
      runCommand(activeIndex);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
    }
  });

  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-index]');
    if (item) runCommand(Number(item.dataset.index));
  });

  list.addEventListener('mousemove', (event) => {
    const item = event.target.closest('[data-index]');
    if (!item) return;
    const index = Number(item.dataset.index);
    if (index !== activeIndex) {
      activeIndex = index;
      renderList();
    }
  });

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closePalette();
  });
}
