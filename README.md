# NEXUS

Personal command centre. Vanilla HTML, CSS and ES modules. No build step, no runtime dependencies.

## Run

ES modules and the service worker require HTTP. Opening `index.html` directly will not work.

    npm start            # python -m http.server 5173
    open http://localhost:5173    (Chrome or Edge recommended)

To install on Windows 11, use the browser's "Install app" option.

## Test

    npm test             # 65 tests: domain rules, route structure, backup round trip

## What is built

| Page | What it does |
|---|---|
| Command Centre | Live stats, Mission Control (three objectives a day), due-today list, productivity and habits, academic and project overview, deadline radar, focus timer. Widgets can be moved, hidden, shown and restored. |
| Tasks | All, Today, Upcoming, Overdue and Completed views. Search, category and priority filters, sorting, recurring tasks, restore. |
| Academics | Semester and subject management, units and topics with completion and understanding levels, revision scheduling, assignments, exams, marks targets, LeetCode tracker. |
| Projects | Status filters. Per-project workspace with derived progress, timeline, milestones, linked tasks, notes, completion history. |
| Performance | Daily, weekly and monthly views. Every figure is marked Measured or Calculated. Trends use recorded daily snapshots. |
| Journal | Searchable entries with categories and tags. Creation and last-edit dates. |
| Focus | Pomodoro, 50 and 90 minute, and custom sessions. Persisted across reloads. Recorded on finish. |
| Settings | Preferences, notification toggles, dashboard reset, export, validated import with preview and safety backup, erase. |

Also: Quick Capture (Alt+N), command palette (Ctrl/Cmd+K), notifications bell with real deadline alerts, and a live focus pill in the top bar.

## Data

All data is stored in IndexedDB in this browser. Nothing is sent anywhere. Use Settings → Export to keep a copy.

Import validates the whole file before changing anything, shows a preview, saves your current data to a file first, and applies the change in one transaction.

## Known limits

- Fonts (Manrope, Inter, JetBrains Mono) are not bundled. The app falls back to system fonts. Bundle the font files into `assets/fonts/` to match the design exactly.
- Charts are drawn with inline SVG instead of Chart.js, so they need no external file and work offline.
- Icons are inline SVG in a Lucide style, not the Lucide package.
- Academic and project trends only exist for days the app was opened. Past values cannot be reconstructed.
- Cache updates: the service worker is cache-first. Bump `CACHE_VERSION` in `service-worker.js` on every release, or users will keep old files.

## Documentation

`docs/ARCHITECTURE.md`: architecture, IndexedDB schema, design tokens and roadmap.
