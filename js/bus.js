// Minimal publish/subscribe bus. Views subscribe to 'data' and re-read the records they display.

const handlers = new Map();

export function on(event, handler) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(handler);
  return () => handlers.get(event)?.delete(handler);
}

export function emit(event, detail = {}) {
  const set = handlers.get(event);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(detail);
    } catch (error) {
      console.error(`Handler for "${event}" failed`, error);
    }
  }
}
