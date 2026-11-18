// Single modal at a time. Escape and backdrop clicks close it. Focus is trapped while open and returned on close.

import { icon, escapeHtml } from '../utilities.js';

let current = null;

function trapFocus(event, root) {
  const items = [...root.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
  if (items.length === 0) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function closeModal() {
  if (!current) return;
  const { backdrop, onKey, returnFocus, onClose } = current;
  document.removeEventListener('keydown', onKey, true);
  backdrop.remove();
  current = null;
  if (returnFocus && typeof returnFocus.focus === 'function' && document.contains(returnFocus)) {
    returnFocus.focus({ preventScroll: true });
  }
  if (onClose) onClose();
}

export function openModal({ title, content, size = 'md', onClose = null }) {
  closeModal();
  const overlays = document.getElementById('overlays');
  if (!overlays) throw new Error('The dialog layer is missing from the page.');

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <header class="modal-header">
        <h2 id="modal-title">${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn" data-modal-close aria-label="Close">${icon('x', 18)}</button>
      </header>
      <div class="modal-body"></div>
    </div>`;

  const body = backdrop.querySelector('.modal-body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.append(content);

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop || event.target.closest('[data-modal-close]')) closeModal();
  });

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      closeModal();
    } else if (event.key === 'Tab') {
      trapFocus(event, backdrop.querySelector('.modal'));
    }
  };
  document.addEventListener('keydown', onKey, true);

  overlays.appendChild(backdrop);
  current = { backdrop, onKey, returnFocus: document.activeElement, onClose };

  requestAnimationFrame(() => {
    const first = body.querySelector('input:not([type="hidden"]), select, textarea');
    (first || backdrop.querySelector('[data-modal-close]')).focus({ preventScroll: true });
  });

  return { body, close: closeModal };
}

// Resolves true when the user confirms, false when they cancel or dismiss the dialog.
export function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <p class="confirm-text">${escapeHtml(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-cancel>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>`;
    wrapper.querySelector('[data-cancel]').addEventListener('click', () => {
      settle(false);
      closeModal();
    });
    wrapper.querySelector('[data-confirm]').addEventListener('click', () => {
      settle(true);
      closeModal();
    });
    openModal({ title, content: wrapper, size: 'sm', onClose: () => settle(false) });
  });
}
