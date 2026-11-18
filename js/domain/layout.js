// Dashboard layout is an ordered list of { id, visible }. It is normalised on every load so that
// saved layouts survive widget additions and removals without crashing.

export function defaultLayout(defaultOrder) {
  return defaultOrder.map((id) => ({ id, visible: true }));
}

// Drops unknown widget ids, removes duplicates, and appends widgets missing from the saved layout.
export function normaliseLayout(saved, knownIds, defaultOrder) {
  const known = new Set(knownIds);
  const seen = new Set();
  const result = [];
  const entries = Array.isArray(saved?.widgets) ? saved.widgets : [];
  for (const entry of entries) {
    if (!entry || typeof entry.id !== 'string' || !known.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push({ id: entry.id, visible: entry.visible !== false });
  }
  for (const id of defaultOrder) {
    if (seen.has(id)) continue;
    seen.add(id);
    result.push({ id, visible: true });
  }
  return result;
}

// Swaps a widget with its neighbour in the full list. Hidden entries keep their place.
export function moveWidget(layout, id, direction) {
  const index = layout.findIndex((entry) => entry.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= layout.length) return layout;
  const next = [...layout];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function setWidgetVisible(layout, id, visible) {
  return layout.map((entry) => (entry.id === id ? { ...entry, visible } : entry));
}
