// Focus timer controls. Stateless: all state lives in the focus engine, so every mounted copy shows the same session.

import { on } from '../bus.js';
import { escapeHtml } from '../utilities.js';
import { repos } from '../data.js';
import { FOCUS_MODES } from '../domain/constants.js';
import { formatClock } from '../domain/timer.js';
import { sortTasks, isOpen } from '../domain/tasks.js';
import { focusState, startFocus, pauseFocus, resumeFocus, finishFocus, discardFocus } from './focus-engine.js';
import { toast } from './toast.js';

function selectedMinutes(modeSelect, minutesInput) {
  const mode = FOCUS_MODES.find((item) => item.value === modeSelect.value);
  if (mode && mode.minutes) return mode.minutes;
  const value = Number(minutesInput.value);
  if (!Number.isInteger(value) || value < 5 || value > 240) {
    throw new Error('Custom sessions must be between 5 and 240 minutes.');
  }
  return value;
}

function actionsFor(status) {
  if (status === 'running') {
    return `<button type="button" class="btn btn-primary" data-cmd="pause">Pause</button>
      <button type="button" class="btn" data-cmd="finish">Finish now</button>
      <button type="button" class="btn btn-danger-ghost" data-cmd="discard">Discard</button>`;
  }
  if (status === 'paused') {
    return `<button type="button" class="btn btn-primary" data-cmd="resume">Resume</button>
      <button type="button" class="btn" data-cmd="finish">Finish now</button>
      <button type="button" class="btn btn-danger-ghost" data-cmd="discard">Discard</button>`;
  }
  return `<button type="button" class="btn btn-primary" data-cmd="start">Start focus</button>`;
}

export function mountFocusTimer(root, { compact = false } = {}) {
  root.classList.add('focus-timer');
  root.innerHTML = `
    <div class="focus-face">
      <span class="focus-clock mono" data-face aria-live="off">--:--</span>
      <span class="focus-status" data-status></span>
    </div>
    <div class="focus-setup${compact ? ' is-compact' : ''}">
      <label class="focus-field">Mode
        <select data-mode>
          ${FOCUS_MODES.map((mode) => `<option value="${mode.value}">${escapeHtml(mode.label)}${mode.minutes ? ` · ${mode.minutes} min` : ''}</option>`).join('')}
        </select>
      </label>
      <label class="focus-field" data-custom-wrap hidden>Minutes
        <input type="number" min="5" max="240" step="1" value="45" data-minutes />
      </label>
      <label class="focus-field">Working on
        <select data-task><option value="">Nothing specific</option></select>
      </label>
    </div>
    <div class="focus-actions" data-actions></div>
  `;

  const face = root.querySelector('[data-face]');
  const status = root.querySelector('[data-status]');
  const modeSelect = root.querySelector('[data-mode]');
  const minutesInput = root.querySelector('[data-minutes]');
  const customWrap = root.querySelector('[data-custom-wrap]');
  const taskSelect = root.querySelector('[data-task]');
  const actions = root.querySelector('[data-actions]');
  let busy = false;
  let lastActionKey = '';

  function currentMs() {
    try {
      return selectedMinutes(modeSelect, minutesInput) * 60000;
    } catch {
      return 25 * 60000;
    }
  }

  function paint(state) {
    const active = Boolean(state);
    face.textContent = formatClock(active ? state.remainingMs : currentMs());
    status.textContent = !active ? 'Ready' : state.status === 'paused' ? 'Paused' : 'Focusing';
    modeSelect.disabled = active;
    minutesInput.disabled = active;
    taskSelect.disabled = active;
    const key = active ? state.status : 'idle';
    if (key !== lastActionKey) {
      lastActionKey = key;
      actions.innerHTML = actionsFor(key);
    }
  }

  async function loadTasks() {
    const tasks = await repos.tasks.list();
    const open = sortTasks(tasks.filter(isOpen), 'deadline');
    const current = taskSelect.value;
    taskSelect.innerHTML = `<option value="">Nothing specific</option>${open
      .map((task) => `<option value="${escapeHtml(task.id)}">${escapeHtml(task.title)}</option>`)
      .join('')}`;
    if (open.some((task) => task.id === current)) taskSelect.value = current;
  }

  async function command(name) {
    if (busy) return;
    busy = true;
    try {
      if (name === 'start') {
        const minutes = selectedMinutes(modeSelect, minutesInput);
        await startFocus({ type: modeSelect.value, minutes, taskId: taskSelect.value || null });
      } else if (name === 'pause') {
        await pauseFocus();
      } else if (name === 'resume') {
        await resumeFocus();
      } else if (name === 'finish') {
        await finishFocus();
      } else if (name === 'discard') {
        await discardFocus();
      }
    } catch (error) {
      toast(error.message || 'The focus timer could not be updated.', 'error');
    } finally {
      busy = false;
    }
  }

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-cmd]');
    if (button && root.contains(button)) command(button.dataset.cmd);
  });

  modeSelect.addEventListener('change', () => {
    customWrap.hidden = modeSelect.value !== 'custom';
    paint(focusState());
  });
  minutesInput.addEventListener('input', () => paint(focusState()));

  let unsubscribeFocus = null;
  let unsubscribeData = null;
  const cleanup = () => {
    if (unsubscribeFocus) unsubscribeFocus();
    if (unsubscribeData) unsubscribeData();
  };

  unsubscribeFocus = on('focus', (state) => {
    if (!root.isConnected) {
      cleanup();
      return;
    }
    paint(state);
  });
  unsubscribeData = on('data', () => {
    if (!root.isConnected) {
      cleanup();
      return;
    }
    loadTasks().catch((error) => console.error(error));
  });

  customWrap.hidden = modeSelect.value !== 'custom';
  paint(focusState());
  loadTasks().catch((error) => console.error(error));
  return cleanup;
}
