// SVG charts. Built in-house instead of bundling Chart.js, so they work offline and need no external asset.
// Values that are null are shown as gaps rather than zeros.

import { escapeHtml } from '../utilities.js';

const WIDTH = 320;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;

export function barChart({ data, height = 160, ariaLabel, unit = '' }) {
  const max = Math.max(1, ...data.map((item) => item.value ?? 0));
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const slot = WIDTH / Math.max(1, data.length);
  const barWidth = Math.max(4, slot * 0.56);

  const bars = data
    .map((item, index) => {
      const value = item.value ?? 0;
      const barHeight = value > 0 ? Math.max(2, (value / max) * plotHeight) : 0;
      const x = index * slot + (slot - barWidth) / 2;
      const y = PAD_TOP + plotHeight - barHeight;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" class="chart-bar">
          <title>${escapeHtml(item.label)}: ${value}${escapeHtml(unit)}</title>
        </rect>
        <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 8}" text-anchor="middle" class="chart-label">${escapeHtml(item.short ?? item.label)}</text>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    <line x1="0" x2="${WIDTH}" y1="${PAD_TOP + plotHeight}" y2="${PAD_TOP + plotHeight}" class="chart-axis" />
    ${bars}
  </svg>`;
}

export function lineChart({ data, height = 160, ariaLabel, max = 100, unit = '%' }) {
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const step = data.length > 1 ? WIDTH / (data.length - 1) : 0;
  const points = data.map((item, index) => {
    if (item.value === null || item.value === undefined) return null;
    const x = data.length > 1 ? index * step : WIDTH / 2;
    const y = PAD_TOP + plotHeight - (Math.min(max, Math.max(0, item.value)) / max) * plotHeight;
    return { x, y, item };
  });

  const segments = [];
  let current = [];
  for (const point of points) {
    if (point) current.push(point);
    else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  const paths = segments
    .map((segment) => `<polyline class="chart-line" points="${segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" />`)
    .join('');

  const dots = points
    .filter(Boolean)
    .map((p) => `<circle class="chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"><title>${escapeHtml(p.item.label)}: ${p.item.value}${escapeHtml(unit)}</title></circle>`)
    .join('');

  const labels = data
    .map((item, index) => {
      if (!item.short) return '';
      const x = data.length > 1 ? index * step : WIDTH / 2;
      return `<text x="${x.toFixed(1)}" y="${height - 8}" text-anchor="${index === 0 ? 'start' : index === data.length - 1 ? 'end' : 'middle'}" class="chart-label">${escapeHtml(item.short)}</text>`;
    })
    .join('');

  return `<svg class="chart" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-label="${escapeHtml(ariaLabel)}" preserveAspectRatio="xMidYMid meet">
    <line x1="0" x2="${WIDTH}" y1="${PAD_TOP + plotHeight}" y2="${PAD_TOP + plotHeight}" class="chart-axis" />
    ${paths}
    ${dots}
    ${labels}
  </svg>`;
}
