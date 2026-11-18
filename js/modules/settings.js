// Settings and data management. Imports are validated completely, previewed, protected by an automatic safety export,
// and applied in one transaction. A failed import changes nothing.

import { loadSnapshot, setSetting, exportAllData, replaceAllData } from '../data.js';
import { STORE_NAMES } from '../database.js';
import { icon, escapeHtml } from '../utilities.js';
import { resolvePreferences, PRIORITIES, TASK_CATEGORIES } from '../domain/constants.js';
import { validatePreferences } from '../domain/validation.js';
import { createBackupPayload, validateBackup } from '../domain/backup.js';
import { defaultLayout } from '../domain/layout.js';
import { WIDGETS } from './dashboard-widgets.js';
import { field, readForm, showErrors, openFormModal } from '../components/forms.js';
import { confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { safely } from '../actions.js';
import { toDateKey } from '../domain/dates.js';

export const APP_VERSION = '1.0.0';

const NOTIFICATION_LABELS = [
  ['overdue', 'Overdue tasks'],
  ['dueSoon', 'Tasks due soon'],
  ['exams', 'Upcoming examinations'],
  ['assignments', 'Assignments due or overdue'],
  ['objectives', 'Open objectives today'],
  ['revisions', 'Topics due for revision'],
];

const STORE_LABELS = {
  tasks: 'Tasks',
  objectives: 'Objectives',
  habits: 'Habits',
  habitLogs: 'Habit logs',
  semesters: 'Semesters',
  subjects: 'Subjects',
  units: 'Units',
  topics: 'Topics',
  assignments: 'Assignments',
  exams: 'Examinations',
  leetcodeDays: 'LeetCode days',
  projects: 'Projects',
  milestones: 'Milestones',
  focusSessions: 'Focus sessions',
  journal: 'Journal entries',
  kv: 'Settings and snapshots',
};

function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Downloads the current data before anything destructive happens. Skipped only when there is nothing to protect.
async function safetyExport(label) {
  const stores = await exportAllData();
  const total = Object.entries(stores)
    .filter(([name]) => name !== 'kv')
    .reduce((sum, [, records]) => sum + records.length, 0);
  if (total === 0) return false;
  const payload = createBackupPayload(stores, APP_VERSION);
  download(`nexus-${label}-${stamp()}.json`, JSON.stringify(payload, null, 2));
  return true;
}

function preferenceFields(prefs) {
  return [
    field({ name: 'name', label: 'Your name', value: prefs.name, placeholder: 'Shown in the greeting', full: false }),
    field({ name: 'university', label: 'University', value: prefs.university, placeholder: 'Shown in academic labels' }),
    field({ name: 'dailyFocusMinutes', label: 'Daily focus target (minutes)', type: 'number', value: prefs.dailyFocusMinutes, min: 15, max: 1440, step: 1 }),
    field({ name: 'lookaheadDays', label: 'Deadline lookahead (days)', type: 'number', value: prefs.lookaheadDays, min: 1, max: 14, step: 1, hint: 'How far ahead due tasks and assignments are flagged.' }),
    field({ name: 'examDays', label: 'Exam warning window (days)', type: 'number', value: prefs.examDays, min: 1, max: 60, step: 1 }),
    field({ name: 'defaultCategory', label: 'Default task category', type: 'select', value: prefs.defaultCategory, options: TASK_CATEGORIES }),
    field({
      name: 'defaultPriority',
      label: 'Default task priority',
      type: 'select',
      value: prefs.defaultPriority,
      options: PRIORITIES.map((item) => ({ value: item.value, label: item.label })),
    }),
  ].join('');
}

function notificationToggles(prefs) {
  return NOTIFICATION_LABELS.map(([key, label]) =>
    field({ name: `notif_${key}`, label, type: 'checkbox', value: prefs.notifications[key] })
  ).join('');
}

function summaryTable(counts) {
  const rows = STORE_NAMES.filter((name) => name !== 'kv')
    .map((name) => `<tr><td>${escapeHtml(STORE_LABELS[name] ?? name)}</td><td class="mono num">${counts[name] ?? 0}</td></tr>`)
    .join('');
  return `<table class="data-table"><tbody>${rows}</tbody></table>`;
}

export function render(container) {
  let pendingPayload = null;
  let pendingMode = 'merge';
  let token = 0;

  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow">System</p>
      <h1>Settings</h1>
      <p class="lead">Preferences, notifications, and ownership of your data. Your data stays in this browser unless you export it.</p>
    </section>

    <section class="card settings-section">
      <h2 class="section-title">Preferences and notifications</h2>
      <form class="form" data-prefs-form novalidate>
        <div class="form-grid">${''}</div>
        <p class="form-error" data-form-error hidden></p>
        <div class="modal-actions">
          <button type="submit" class="btn btn-primary" data-save-prefs>Save preferences</button>
        </div>
      </form>
    </section>

    <section class="card settings-section">
      <h2 class="section-title">Dashboard</h2>
      <p class="widget-hint">Widgets can be moved, hidden and shown from the Command Centre. This restores the original arrangement.</p>
      <div class="modal-actions" style="justify-content:flex-start">
        <button type="button" class="btn" data-action="restore-layout">${icon('rotate', 16)} Restore default dashboard</button>
      </div>
    </section>

    <section class="card settings-section">
      <h2 class="section-title">Your data</h2>
      <div data-data-summary></div>
      <div class="data-actions">
        <button type="button" class="btn btn-primary" data-action="export-data">${icon('download', 16)} Export all data</button>
      </div>

      <h3 class="sub-heading">Import a backup</h3>
      <p class="widget-hint">Import checks the whole file before anything changes. Your current data is saved to a file first. Choose Merge to add or update records, or Replace to make the file the only data.</p>
      <div class="import-grid">
        <label class="file-input">
          <span>Backup file (.json)</span>
          <input type="file" accept="application/json,.json" data-import-file />
        </label>
        <fieldset class="mode-group">
          <legend>Import mode</legend>
          <label class="check-label"><input type="radio" name="import-mode" value="merge" checked /> Merge: add and update records, keep the rest</label>
          <label class="check-label"><input type="radio" name="import-mode" value="replace" /> Replace: remove all current data first</label>
        </fieldset>
      </div>
      <div data-import-preview class="import-preview" aria-live="polite"></div>
      <div class="data-actions" data-import-actions hidden>
        <label class="check-label" data-confirm-wrap hidden><input type="checkbox" data-confirm-replace /> I understand that Replace removes all current data.</label>
        <button type="button" class="btn btn-primary" data-action="apply-import" disabled>Apply import</button>
      </div>

      <h3 class="sub-heading danger-heading">Erase all data</h3>
      <p class="widget-hint">Removes every record in NEXUS on this browser. A backup is saved first.</p>
      <div class="data-actions">
        <button type="button" class="btn btn-danger-ghost" data-action="erase-data">${icon('trash', 16)} Erase all data</button>
      </div>
    </section>

    <p class="widget-hint version-line">NEXUS ${APP_VERSION} · backup format 1</p>`;

  const prefsForm = container.querySelector('[data-prefs-form]');
  const summaryEl = container.querySelector('[data-data-summary]');
  const previewEl = container.querySelector('[data-import-preview]');
  const applyButton = container.querySelector('[data-action="apply-import"]');
  const importActions = container.querySelector('[data-import-actions]');
  const confirmWrap = container.querySelector('[data-confirm-wrap]');
  const confirmBox = container.querySelector('[data-confirm-replace]');

  async function paintForms() {
    const current = ++token;
    const snapshot = await loadSnapshot();
    if (current !== token) return;
    const prefs = resolvePreferences(snapshot.settings.preferences);
    prefsForm.querySelector('.form-grid').innerHTML = `${preferenceFields(prefs)}
      <div class="notify-fields"><h3 class="sub-heading">Notifications</h3>${notificationToggles(prefs)}</div>`;

    const counts = Object.fromEntries(
      STORE_NAMES.map((name) => [name, name === 'kv' ? 0 : snapshot[name].length])
    );
    summaryEl.innerHTML = summaryTable(counts);
  }

  async function savePreferences(event) {
    event.preventDefault();
    const values = readForm(prefsForm);
    const outcome = validatePreferences(values);
    showErrors(prefsForm, outcome.errors);
    if (!outcome.valid) return;
    const notifications = Object.fromEntries(NOTIFICATION_LABELS.map(([key]) => [key, Boolean(values[`notif_${key}`])]));
    await setSetting('preferences', { ...outcome.value, notifications });
    toast('Preferences saved.', 'success');
  }

  async function restoreLayout() {
    const confirmed = await confirmDialog({
      title: 'Restore default dashboard?',
      message: 'All widgets return to their original order and visibility.',
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;
    await setSetting('dashboardLayout', { widgets: defaultLayout(WIDGETS.map((widget) => widget.id)) });
    toast('Default dashboard restored.', 'success');
  }

  async function exportData() {
    const stores = await exportAllData();
    const payload = createBackupPayload(stores, APP_VERSION);
    download(`nexus-backup-${toDateKey()}.json`, JSON.stringify(payload, null, 2));
    toast('Backup downloaded.', 'success');
  }

  async function readImportFile(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) throw new Error('This file is larger than 50 MB and cannot be imported.');
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      throw new Error('This file is not valid JSON.');
    }
    const result = validateBackup(parsed, STORE_NAMES);
    if (!result.ok) {
      pendingPayload = null;
      applyButton.disabled = true;
      importActions.hidden = true;
      previewEl.innerHTML = `<div class="form-error-block"><h3>This backup cannot be imported</h3>
        <ul>${result.errors.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
        <p>Nothing has been changed.</p></div>`;
      return;
    }
    pendingPayload = parsed;
    previewEl.innerHTML = `<div class="preview-block">
      <h3>Backup is valid</h3>
      <p class="widget-hint">Exported ${escapeHtml(result.exportedAt ? new Date(result.exportedAt).toLocaleString() : 'unknown date')} · ${result.totalRecords} records</p>
      ${summaryTable(result.counts)}
    </div>`;
    importActions.hidden = false;
    refreshApplyState();
  }

  function refreshApplyState() {
    const replace = pendingMode === 'replace';
    confirmWrap.hidden = !replace;
    applyButton.disabled = !pendingPayload || (replace && !confirmBox.checked);
  }

  async function applyImport() {
    if (!pendingPayload) return;
    const mode = pendingMode;
    const saved = await safetyExport('before-import');
    const payloadStores = pendingPayload.stores;
    const count = await replaceAllData(payloadStores, mode);
    pendingPayload = null;
    previewEl.innerHTML = '';
    importActions.hidden = true;
    container.querySelector('[data-import-file]').value = '';
    toast(`Import complete. ${count} records written${saved ? ', and a safety backup was downloaded' : ''}.`, 'success');
    await paintForms();
  }

  async function eraseData() {
    const snapshot = await loadSnapshot();
    const total = STORE_NAMES.filter((name) => name !== 'kv').reduce((sum, name) => sum + snapshot[name].length, 0);
    if (total === 0) {
      toast('There is no data to erase.', 'info');
      return;
    }
    openFormModal({
      title: 'Erase all data',
      html: `<p class="confirm-text">This permanently removes ${total} records. A backup is downloaded first. Type DELETE to continue.</p>
        ${field({ name: 'confirm', label: 'Type DELETE', required: true, full: true, placeholder: 'DELETE' })}`,
      size: 'sm',
      submitLabel: 'Erase everything',
      validate: (values) => {
        const valid = values.confirm === 'DELETE';
        return {
          valid,
          errors: valid ? {} : { confirm: 'Type DELETE exactly to confirm.' },
          value: values,
        };
      },
      onSubmit: async () => {
        await safetyExport('before-erase');
        const empty = Object.fromEntries(STORE_NAMES.map((name) => [name, []]));
        await replaceAllData(empty, 'replace');
        toast('All data erased.', 'success');
        await paintForms();
      },
    });
  }

  function onSubmit(event) {
    if (event.target === prefsForm) {
      safely(() => savePreferences(event));
    }
  }

  function onClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !container.contains(trigger)) return;
    switch (trigger.dataset.action) {
      case 'restore-layout':
        safely(restoreLayout);
        break;
      case 'export-data':
        safely(exportData);
        break;
      case 'apply-import':
        safely(applyImport);
        break;
      case 'erase-data':
        safely(eraseData);
        break;
      default:
        break;
    }
  }

  function onChange(event) {
    const target = event.target;
    if (target.matches('[data-import-file]')) {
      safely(() => readImportFile(target.files?.[0]));
    } else if (target.name === 'import-mode') {
      pendingMode = target.value;
      refreshApplyState();
    } else if (target.matches('[data-confirm-replace]')) {
      refreshApplyState();
    }
  }

  container.addEventListener('click', onClick);
  container.addEventListener('submit', onSubmit);
  container.addEventListener('change', onChange);
  paintForms().catch((error) => {
    console.error(error);
    toast('Settings could not be loaded.', 'error');
  });

  return () => {
    container.removeEventListener('click', onClick);
    container.removeEventListener('submit', onSubmit);
    container.removeEventListener('change', onChange);
  };
}
