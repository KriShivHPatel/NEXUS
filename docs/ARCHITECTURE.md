# NEXUS Architecture

## 1. Architecture overview

NEXUS is a static, dependency-free PWA. Vanilla ES modules are loaded directly by the browser, so there is no build step. Everything lives in four layers:

| Layer | Responsibility | Files |
|---|---|---|
| Shell | Layout, sidebar, top bar, command palette, clock | `js/app.js`, `js/components/*` |
| Routing | Hash routes, module lifecycle (render and cleanup) | `js/router.js` |
| State | Small observable store for UI state (route, sidebar, palette) | `js/state.js` |
| Data (M2+) | IndexedDB repository per entity, schema versioning, backup | `js/database.js` (not yet built) |

Modules never talk to each other directly. They talk through the state store and, later, through repositories and an event bus. This keeps modules independent and prevents duplicated logic.

## 2. Module contract

Every route exports a `render(container, route)` function. It may return a cleanup function, which the router calls before the next route renders. This is the only contract a module must satisfy.

## 3. Proposed IndexedDB schema (database `nexus`, version 1)

The schema is fixed now so later milestones add stores rather than restructure data.

| Store | Key | Indexes | Notes |
|---|---|---|---|
| `tasks` | `id` | `dueDate`, `status`, `category`, `priority` | Recurrence stored as a rule, not expanded copies |
| `objectives` | `id` | `date` | Mission Control: three daily objectives per date |
| `habits` | `id` | `active` | Habit definitions |
| `habitLogs` | `[habitId+date]` | `habitId`, `date` | One record per completion |
| `subjects` | `id` | `semesterId` | Subject code, credits, target and current marks |
| `units` | `id` | `subjectId` | Ordered within subject |
| `topics` | `id` | `unitId`, `nextRevisionDate` | Understanding level and revision dates |
| `assignments` | `id` | `subjectId`, `dueDate` | |
| `exams` | `id` | `subjectId`, `date` | |
| `academicYears` / `semesters` | `id` | `academicYearId` | University > Year > Semester hierarchy |
| `projects` | `id` | `status` | |
| `milestones` | `id` | `projectId` | |
| `journal` | `id` | `createdAt`, `category` | Tags as a multiEntry index |
| `focusSessions` | `id` | `startedAt`, `taskId`, `projectId` | Persistent focus history |
| `leetcodeDays` | `date` | | Manual daily practice log plus per-difficulty totals |
| `settings` | `key` | | Key/value: dashboard layout, notification prefs, etc. |

Every record carries `createdAt` and `updatedAt` ISO timestamps. Every store carries a `schemaVersion` implicitly through the database version number.

Analytics (M6) are derived by querying these stores. Nothing analytical is stored as a hardcoded number.

## 4. Technical challenges identified

1. **Offline caching versus updates.** A cache-first service worker serves stale code after an update. Mitigation: a versioned cache name (`nexus-shell-vN`) that must be bumped on every release, plus `skipWaiting` and `clients.claim`.
2. **ES modules require HTTP.** They fail on `file://`. The README documents a local server, and the service worker only registers on `http(s)`.
3. **Backup safety (M8).** Imports must validate schema versions, show a diff summary, and never overwrite silently. A pre-import automatic export is planned.
4. **Dashboard widget persistence (M2).** Layouts must survive schema changes. Widgets are identified by stable string IDs, and unknown IDs are ignored rather than crashing.
5. **Derived project progress (M5).** Progress comes from completed milestones and tasks, weighted and documented, not from a stored percentage.
6. **Timer accuracy (M7).** Focus sessions store wall-clock start and end times and compute elapsed time from timestamps, so background tabs cannot drift the timer.
7. **Fonts and vendored libraries.** Manrope, Inter, Chart.js and Lucide must be bundled locally for true offline use. M1 uses system fallbacks and inline SVG icons, so it has no external dependencies yet.

## 5. Visual design system

Colours are CSS custom properties in `css/base.css` and are the single source of truth.

| Token | Value | Use |
|---|---|---|
| `--bg-0` | `#080D18` | App background |
| `--bg-1` | `#0E1626` | Sidebar and secondary surfaces |
| `--bg-card` | `#121D30` | Cards |
| `--bg-elevated` | `#18253A` | Popovers, palette, hover states |
| `--accent` | `#438CFF` | Primary actions, active navigation |
| `--accent-2` | `#36C8E8` | Secondary highlights |
| `--text` / `--text-2` | `#EDF3FF` / `#91A0B8` | Primary and secondary text |
| `--success` / `--warning` / `--danger` | `#35C98A` / `#F4B942` / `#F16C76` | Status only |

One tertiary text tone (`--text-3`) is derived for captions and disabled states. It is a deliberate addition, not a palette change.

Typography: Manrope for display, Inter for body, a monospace stack for numbers and system readouts. Spacing and radii are fixed scales. Motion is limited to 200 ms transitions with one easing curve.

## 6. Reusable component system (M1)

| Component | Purpose |
|---|---|
| `icon(name)` | Inline SVG icon registry, stroke style matching Lucide |
| `mountSidebar` | Navigation, active state, collapse, live clock |
| `mountHeader` | Page title, search trigger, settings shortcut |
| `mountPalette` / `openPalette` | Command palette with keyboard navigation |
| `page-header`, `card`, `empty-state` | CSS patterns shared by all modules |

Components are functions that render into a container they are given. None of them reads the DOM outside that container.

## 7. Roadmap

| Milestone | Scope | Status |
|---|---|---|
| M1 | Application shell, design system, routing, command palette | Built |
| M2 | Dashboard, widget system, IndexedDB foundation, Mission Control | Built |
| M3 | Task management | Built |
| M4 | Academic intelligence and LeetCode tracker | Built |
| M5 | Project management | Built |
| M6 | Performance intelligence | Built |
| M7 | Journal, Quick Capture, Focus Timer | Built |
| M8 | Notifications, settings, backup and restore | Built |
| M9 | PWA hardening, offline cache, structural and integration tests | Built (browser testing still pending) |

Every control in the interface performs its action. Pages without a finished feature are not shown.

## 8. Deviations from the specification

- Chart.js is replaced by inline SVG charts, so charts work offline without bundling a library.
- Lucide is replaced by inline SVG icons drawn in the same style.
- Manrope, Inter and JetBrains Mono are not bundled yet. System fonts are used until the font files are added.
- Academic and project trends depend on daily snapshots recorded while the app runs. Earlier history cannot be reconstructed.
