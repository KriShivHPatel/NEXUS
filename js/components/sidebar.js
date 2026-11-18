// Persistent sidebar: brand, grouped navigation, collapse control and user section.

import { ROUTES, GROUPS } from '../router.js';
import { icon, escapeHtml } from '../utilities.js';
import { getState, subscribe } from '../state.js';

export function mountSidebar(root) {
  root.innerHTML = `
    <div class="sidebar-brand">
      <div class="brand-mark mono">N</div>
      <div class="brand-text">
        <span class="brand-name">NEXUS</span>
        <span class="brand-sub">Personal command centre</span>
      </div>
    </div>

    <nav class="sidebar-nav" aria-label="Primary">
      ${GROUPS.map((group) => {
        const items = ROUTES.filter((route) => route.group === group.key && !route.hidden);
        return `
          <div class="nav-group">
            <p class="nav-label">${escapeHtml(group.label)}</p>
            ${items.map((route) => `
              <a class="nav-item" href="#/${route.id}" data-route="${route.id}" title="${escapeHtml(route.title)}">
                ${icon(route.icon, 18)}
                <span class="nav-text">${escapeHtml(route.title)}</span>
              </a>`).join('')}
          </div>`;
      }).join('')}
    </nav>

    <div class="sidebar-footer">
      <div class="profile">
        <div class="avatar mono">NX</div>
        <div class="profile-meta">
          <span class="profile-name">Personal workspace</span>
          <span class="profile-sub mono" data-clock>--:--:--</span>
        </div>
      </div>
      <button class="icon-btn" data-action="toggle-sidebar" aria-label="Collapse sidebar" aria-expanded="true">
        ${icon('panel', 18)}
      </button>
    </div>
  `;

  const toggleButton = root.querySelector('[data-action="toggle-sidebar"]');

  function syncActive(state) {
    root.querySelectorAll('.nav-item').forEach((link) => {
      const isActive = link.dataset.route === state.route;
      link.classList.toggle('active', isActive);
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function syncCollapsed(state) {
    const collapsed = state.sidebarCollapsed;
    root.closest('.app')?.classList.toggle('collapsed', collapsed);
    toggleButton.setAttribute('aria-expanded', String(!collapsed));
    toggleButton.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  }

  // Clicks are handled by the global data-action delegate in app.js.

  syncActive(getState());
  syncCollapsed(getState());

  subscribe((state) => {
    syncActive(state);
    syncCollapsed(state);
  });
}
