// Form helpers. Each form validates through a domain validator, shows field errors inline,
// and never closes until the save has succeeded.

import { escapeHtml } from '../utilities.js';
import { openModal, closeModal } from './modal.js';

export function field({ name, label, type = 'text', value = '', required = false, hint = '', options = null, rows = 3, placeholder = '', min, max, step, full = false }) {
  const id = `f-${name}`;
  const requiredMark = required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const wrapperClass = `field${full ? ' field-full' : ''}`;

  if (type === 'checkbox') {
    return `<div class="${wrapperClass} check-field">
      <label class="check-label"><input type="checkbox" id="${id}" name="${name}" ${value ? 'checked' : ''} /> <span>${escapeHtml(label)}</span></label>
      <p class="field-error" data-error-for="${name}" hidden></p>
    </div>`;
  }

  let control;
  if (type === 'select') {
    const choices = options.map((option) => `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
    control = `<select id="${id}" name="${name}" ${required ? 'required' : ''}>${choices}</select>`;
  } else if (type === 'textarea') {
    control = `<textarea id="${id}" name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value)}</textarea>`;
  } else {
    const extra = [
      min !== undefined ? `min="${escapeHtml(min)}"` : '',
      max !== undefined ? `max="${escapeHtml(max)}"` : '',
      step !== undefined ? `step="${escapeHtml(step)}"` : '',
      required ? 'required' : '',
    ].join(' ');
    control = `<input id="${id}" name="${name}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" ${extra} />`;
  }

  return `<div class="${wrapperClass}">
    <label for="${id}">${escapeHtml(label)}${requiredMark}</label>
    ${control}
    ${hint ? `<p class="field-hint">${escapeHtml(hint)}</p>` : ''}
    <p class="field-error" data-error-for="${name}" hidden></p>
  </div>`;
}

export function readForm(form) {
  const values = {};
  for (const element of form.elements) {
    if (!element.name) continue;
    values[element.name] = element.type === 'checkbox' ? element.checked : element.value;
  }
  return values;
}

export function setFormError(form, message) {
  const holder = form.querySelector('[data-form-error]');
  if (!holder) return;
  holder.textContent = message || '';
  holder.hidden = !message;
}

export function showErrors(form, errors) {
  form.querySelectorAll('[data-error-for]').forEach((holder) => {
    const message = errors[holder.dataset.errorFor] || '';
    holder.textContent = message;
    holder.hidden = !message;
    holder.closest('.field')?.classList.toggle('field-invalid', Boolean(message));
  });
  setFormError(form, '');
  const first = Object.keys(errors)[0];
  if (first) {
    const target = form.querySelector(`[name="${first}"]`);
    target?.focus();
  }
}

// Opens a modal containing `html` fields. `validate` returns { valid, errors, value }.
// `onSubmit(value)` performs the save and may throw; the dialog then stays open and shows the error.
export function openFormModal({ title, html, validate, onSubmit, size = 'md', submitLabel = 'Save' }) {
  const form = document.createElement('form');
  form.className = 'form';
  form.noValidate = true;
  form.innerHTML = `
    <div class="form-grid">${html}</div>
    <p class="form-error" data-form-error hidden></p>
    <div class="modal-actions">
      <button type="button" class="btn" data-modal-close>Cancel</button>
      <button type="submit" class="btn btn-primary" data-submit>${escapeHtml(submitLabel)}</button>
    </div>`;

  let busy = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    const values = readForm(form);
    const outcome = validate ? validate(values) : { valid: true, errors: {}, value: values };
    showErrors(form, outcome.errors);
    if (!outcome.valid) return;

    busy = true;
    const submit = form.querySelector('[data-submit]');
    submit.disabled = true;
    try {
      await onSubmit(outcome.value);
      closeModal();
    } catch (error) {
      setFormError(form, error.message || 'The changes could not be saved. Please try again.');
      submit.disabled = false;
    } finally {
      busy = false;
    }
  });

  return openModal({ title, content: form, size });
}
