// Short confirmations and errors. Text is set with textContent, so no markup is ever interpreted.

export function toast(message, kind = 'info') {
  const stack = document.getElementById('toasts');
  if (!stack) return;
  const element = document.createElement('div');
  element.className = `toast toast-${kind}`;
  element.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  element.textContent = message;
  stack.appendChild(element);
  setTimeout(() => element.classList.add('leaving'), 3400);
  setTimeout(() => element.remove(), 3800);
}
