// Journal. Entries keep their creation date and last-modified date. Search covers title, content and tags.

import { repos, createRecord, updateRecord, deleteRecord } from '../data.js';
import { on } from '../bus.js';
import { icon, escapeHtml } from '../utilities.js';
import { formatDateKey, dateKeyOfIso, relativeDayLabel, toDateKey } from '../domain/dates.js';
import { JOURNAL_CATEGORIES, labelOf } from '../domain/constants.js';
import { validateJournal } from '../domain/validation.js';
import { field, openFormModal } from '../components/forms.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { safely } from '../actions.js';

function stamp(iso) {
  const key = dateKeyOfIso(iso);
  return key ? formatDateKey(key, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

function entryFields(initial = {}) {
  return [
    field({ name: 'title', label: 'Title', value: initial.title ?? '', full: true, placeholder: 'Optional. Taken from the first line if empty.' }),
    field({ name: 'category', label: 'Category', type: 'select', value: initial.category ?? 'thought', options: JOURNAL_CATEGORIES }),
    field({ name: 'tags', label: 'Tags', value: (initial.tags ?? []).join(', '), placeholder: 'exam, habits', hint: 'Separate with commas.' }),
    field({ name: 'content', label: 'Entry', type: 'textarea', value: initial.content ?? '', rows: 10, full: true, placeholder: 'Write freely.' }),
  ].join('');
}

function openEntryForm(entry = null) {
  return openFormModal({
    title: entry ? 'Edit entry' : 'New journal entry',
    html: entryFields(entry ?? {}),
    validate: validateJournal,
    size: 'lg',
    submitLabel: entry ? 'Save changes' : 'Save entry',
    onSubmit: async (value) => {
      if (entry) {
        await updateRecord('journal', entry.id, value);
        toast('Entry updated.', 'success');
      } else {
        await createRecord('journal', value);
        toast('Entry saved.', 'success');
      }
    },
  });
}

function openEntryView(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'entry-view';
  wrapper.innerHTML = `
    <div class="entry-meta">
      <span class="tag">${escapeHtml(labelOf(JOURNAL_CATEGORIES, entry.category, 'Note'))}</span>
      <span class="list-sub">Created ${escapeHtml(stamp(entry.createdAt))}${entry.updatedAt && entry.updatedAt !== entry.createdAt ? ` · last edited ${escapeHtml(stamp(entry.updatedAt))}` : ''}</span>
    </div>
    <div class="entry-body">${escapeHtml(entry.content)}</div>
    ${(entry.tags ?? []).length ? `<div class="chip-row">${entry.tags.map((tag) => `<span class="tag tag-ghost">#${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
    <div class="modal-actions">
      <button type="button" class="btn" data-modal-close>Close</button>
      <button type="button" class="btn btn-primary" data-open-edit>${icon('edit', 16)} Edit</button>
    </div>`;
  const dialog = openModal({ title: entry.title, content: wrapper, size: 'lg' });
  wrapper.querySelector('[data-open-edit]').addEventListener('click', () => {
    dialog.close();
    openEntryForm(entry);
  });
}

export function render(container) {
  const state = { query: '', category: '', tag: '', sort: 'updated' };
  let token = 0;
  let timer = null;

  container.innerHTML = `
    <section class="page-header">
      <p class="eyebrow">Intelligence</p>
      <div class="header-row">
        <h1>Journal</h1>
        <button type="button" class="btn btn-primary" data-action="new-entry">${icon('plus', 16)} New entry</button>
      </div>
      <p class="lead">Thoughts, ideas, decisions and lessons. Everything you write here is kept until you delete it.</p>
    </section>
    <div class="filter-bar">
      <label class="search-field">${icon('search', 16)}<input type="search" placeholder="Search title, content or tags" data-field="query" aria-label="Search journal" /></label>
      <select data-field="category" aria-label="Filter by category"><option value="">All categories</option>${JOURNAL_CATEGORIES.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join('')}</select>
      <select data-field="tag" aria-label="Filter by tag"><option value="">All tags</option></select>
      <select data-field="sort" aria-label="Sort entries"><option value="updated">Last edited</option><option value="created">Created</option></select>
    </div>
    <div class="results-meta" data-count aria-live="polite"></div>
    <ul class="entry-stack" data-results></ul>`;

  const results = container.querySelector('[data-results]');
  const count = container.querySelector('[data-count]');
  const tagSelect = container.querySelector('[data-field="tag"]');

  async function refresh() {
    const current = ++token;
    try {
      const entries = await repos.journal.list();
      if (current !== token) return;

      const allTags = [...new Set(entries.flatMap((entry) => entry.tags ?? []))].sort();
      const selectedTag = state.tag;
      tagSelect.innerHTML = `<option value="">All tags</option>${allTags.map((tag) => `<option value="${escapeHtml(tag)}" ${tag === selectedTag ? 'selected' : ''}>#${escapeHtml(tag)}</option>`).join('')}`;
      if (selectedTag && !allTags.includes(selectedTag)) state.tag = '';

      const needle = state.query.trim().toLowerCase();
      let list = entries.filter((entry) => {
        if (state.category && entry.category !== state.category) return false;
        if (state.tag && !(entry.tags ?? []).includes(state.tag)) return false;
        if (needle) {
          const haystack = [entry.title, entry.content, ...(entry.tags ?? [])].join(' ').toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      });
      const key = state.sort === 'created' ? 'createdAt' : 'updatedAt';
      list = list.sort((a, b) => (b[key] ?? '').localeCompare(a[key] ?? ''));

      count.textContent = `${list.length} ${list.length === 1 ? 'entry' : 'entries'}`;
      if (list.length === 0) {
        const filtered = needle || state.category || state.tag;
        results.innerHTML = `<li class="empty-block"><p>${filtered ? 'No entries match these filters.' : 'No entries yet. Write your first thought, or use Quick Capture (Alt+N).'}</p></li>`;
        return;
      }

      const today = toDateKey();
      results.innerHTML = list
        .map((entry) => {
          const edited = entry.updatedAt && entry.updatedAt !== entry.createdAt;
          return `<li class="entry-card">
            <button type="button" class="entry-open" data-action="view-entry" data-id="${entry.id}">
              <span class="entry-title">${escapeHtml(entry.title)}</span>
              <span class="entry-excerpt">${escapeHtml((entry.content ?? '').slice(0, 220))}</span>
            </button>
            <div class="entry-foot">
              <span class="tag">${escapeHtml(labelOf(JOURNAL_CATEGORIES, entry.category, 'Note'))}</span>
              <span class="list-sub">${edited ? `Edited ${escapeHtml(relativeDayLabel(dateKeyOfIso(entry.updatedAt), today).toLowerCase())}` : `Created ${escapeHtml(relativeDayLabel(dateKeyOfIso(entry.createdAt), today).toLowerCase())}`}</span>
              ${(entry.tags ?? []).slice(0, 4).map((tag) => `<span class="tag tag-ghost">#${escapeHtml(tag)}</span>`).join('')}
              <div class="row-actions">
                <button type="button" class="icon-btn" data-action="edit-entry" data-id="${entry.id}" aria-label="Edit entry">${icon('edit', 16)}</button>
                <button type="button" class="icon-btn" data-action="delete-entry" data-id="${entry.id}" aria-label="Delete entry">${icon('trash', 16)}</button>
              </div>
            </div>
          </li>`;
        })
        .join('');
    } catch (error) {
      console.error(error);
      results.innerHTML = `<li class="empty-block"><p>The journal could not be loaded. ${escapeHtml(error.message || '')}</p></li>`;
    }
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(refresh, 40);
  }

  async function handle(action, id) {
    switch (action) {
      case 'new-entry':
        return openEntryForm(null);
      case 'view-entry':
      case 'edit-entry':
      case 'delete-entry': {
        const entry = await repos.journal.get(id);
        if (!entry) throw new Error('That entry no longer exists.');
        if (action === 'view-entry') return openEntryView(entry);
        if (action === 'edit-entry') return openEntryForm(entry);
        const confirmed = await confirmDialog({ title: 'Delete entry?', message: `"${entry.title}" will be permanently deleted.`, confirmLabel: 'Delete', danger: true });
        if (confirmed) {
          await deleteRecord('journal', id);
          toast('Entry deleted.', 'success');
        }
        return undefined;
      }
      default:
        return undefined;
    }
  }

  function onClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger || !container.contains(trigger)) return;
    safely(() => handle(trigger.dataset.action, trigger.dataset.id));
  }

  function onInput(event) {
    if (event.target.dataset.field === 'query') {
      state.query = event.target.value;
      refresh();
    }
  }

  function onChange(event) {
    const field = event.target.dataset.field;
    if (!field || field === 'query') return;
    state[field] = event.target.value;
    refresh();
  }

  container.addEventListener('click', onClick);
  container.addEventListener('input', onInput);
  container.addEventListener('change', onChange);
  const unsubscribe = on('data', scheduleRefresh);
  refresh();

  return () => {
    unsubscribe();
    clearTimeout(timer);
    container.removeEventListener('click', onClick);
    container.removeEventListener('input', onInput);
    container.removeEventListener('change', onChange);
  };
}
