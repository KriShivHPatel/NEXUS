// Hash router. URLs look like #/tasks or #/projects/<id>. The first segment picks the page; the second is passed as a parameter.
// A module's render(container, route, param) may return a cleanup function, which runs before the next page.

import * as dashboard from './modules/dashboard.js';
import * as tasks from './modules/tasks.js';
import * as academics from './modules/academics.js';
import * as projects from './modules/projects.js';
import * as performance from './modules/performance.js';
import * as journal from './modules/journal.js';
import * as focus from './modules/focus.js';
import * as settings from './modules/settings.js';
import { setState } from './state.js';

export const GROUPS = [
  { key: 'command', label: 'Command' },
  { key: 'management', label: 'Management' },
  { key: 'intelligence', label: 'Intelligence' },
  { key: 'system', label: 'System' },
];

const DEFINITIONS = [
  { id: 'overview', title: 'Command Centre', group: 'command', icon: 'layout', module: dashboard },
  {
    id: 'tasks',
    title: 'Tasks',
    group: 'management',
    icon: 'checkSquare',
    module: tasks,
    description: 'Create, schedule and complete tasks with priorities, categories and recurrence.',
  },
  {
    id: 'academics',
    title: 'Academics',
    group: 'management',
    icon: 'graduation',
    module: academics,
    description: 'Semesters, subjects, units, topics, assignments, exams and a LeetCode tracker.',
  },
  {
    id: 'projects',
    title: 'Projects',
    group: 'management',
    icon: 'folder',
    module: projects,
    description: 'Project workspaces with milestones, tasks, timelines and derived progress.',
  },
  {
    id: 'performance',
    title: 'Performance',
    group: 'intelligence',
    icon: 'chart',
    module: performance,
    description: 'Daily, weekly and monthly analytics calculated from stored records only.',
  },
  {
    id: 'journal',
    title: 'Journal',
    group: 'intelligence',
    icon: 'book',
    module: journal,
    description: 'Thoughts, decisions and lessons, with search, tags and Quick Capture.',
  },
  {
    id: 'focus',
    title: 'Focus',
    group: 'intelligence',
    icon: 'clock',
    module: focus,
    description: 'Focus timer with Pomodoro, 50-minute, 90-minute and custom sessions.',
    hidden: true,
  },
  {
    id: 'settings',
    title: 'Settings',
    group: 'system',
    icon: 'settings',
    module: settings,
    description: 'Preferences, notifications, and backup and restore of all your data.',
  },
];

export const ROUTES = DEFINITIONS.map((definition) => ({
  ...definition,
  render: definition.module.render,
}));

const DEFAULT_ROUTE = 'overview';
let activeCleanup = null;
let activeContainer = null;

function parseHash() {
  const segments = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const requested = segments[0] ?? '';
  const route = ROUTES.find((item) => item.id === requested) ?? ROUTES.find((item) => item.id === DEFAULT_ROUTE);
  return { route, param: segments[1] ?? null };
}

function renderCurrent() {
  if (!activeContainer) return;
  const { route, param } = parseHash();

  if (typeof activeCleanup === 'function') {
    try {
      activeCleanup();
    } catch (error) {
      console.error(`Cleanup failed for page "${route.id}"`, error);
    }
  }
  activeCleanup = null;

  activeContainer.innerHTML = '';
  activeContainer.classList.remove('page-enter');
  void activeContainer.offsetWidth;
  activeContainer.classList.add('page-enter');

  try {
    const cleanup = route.render(activeContainer, route, param);
    activeCleanup = typeof cleanup === 'function' ? cleanup : null;
  } catch (error) {
    console.error(`Render failed for page "${route.id}"`, error);
    activeContainer.innerHTML = `<section class="card empty-state">
      <h2>This page could not be displayed</h2>
      <p>An unexpected error occurred. Other pages are unaffected. Open the browser console for details.</p>
    </section>`;
  }

  activeContainer.scrollTop = 0;
  window.scrollTo({ top: 0 });
  setState({ route: route.id, title: route.title });
  document.title = `${route.title} · NEXUS`;
}

export function startRouter(container) {
  activeContainer = container;
  window.addEventListener('hashchange', renderCurrent);
  if (!location.hash) {
    history.replaceState(null, '', `#/${DEFAULT_ROUTE}`);
  }
  renderCurrent();
}
