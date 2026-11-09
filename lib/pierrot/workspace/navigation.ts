export type WorkspaceNavProject = {
  id: string;
  slug: string;
  name: string;
  historyId: string | null;
  href: string;
};

export type WorkspaceRouteItem = {
  key: string;
  path: string;
  label: string;
  shortcut: string;
};

export const WORKSPACE_CHAT_ROUTE: WorkspaceRouteItem = {
  key: 'chat',
  path: '/admin/pierrot',
  label: 'Чат',
  shortcut: '1',
};

/**
 * The PWA menu starts with the mega chat, then lists the big canonical chat of
 * every project. It is a chat menu, not a set of links to project pages.
 */
export function buildWorkspaceRoutes(projects: WorkspaceNavProject[]): WorkspaceRouteItem[] {
  return [
    WORKSPACE_CHAT_ROUTE,
    ...projects.map((project, index) => ({
      key: `project:${project.id}`,
      path: project.href,
      label: project.name,
      shortcut: index < 9 ? String(index + 2) : '',
    })),
  ];
}

export function activeWorkspaceKey(
  pathname: string,
  projects: WorkspaceNavProject[],
  historyId: string | null,
  projectSlug: string | null
): string {
  if (pathname !== '/admin/pierrot') return 'chat';

  const activeProject =
    projects.find((project) => {
      if (historyId) return project.historyId === historyId;
      if (projectSlug) return project.slug === projectSlug;
      return false;
    }) || null;

  return activeProject ? `project:${activeProject.id}` : 'chat';
}

/**
 * Shortcuts must not steal Cmd/Ctrl+N or Cmd/Ctrl+1..N while the owner is
 * typing into a field, a contenteditable surface or a native select.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;

  const element = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    closest?: unknown;
  };
  const tag = typeof element.tagName === 'string' ? element.tagName.toLowerCase() : '';

  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  if (element.isContentEditable === true) return true;

  if (typeof element.closest === 'function') {
    try {
      return Boolean(
        (element as Element).closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"]'
        )
      );
    } catch {
      return false;
    }
  }

  return false;
}

export function shortcutRoute(
  event: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>,
  target: EventTarget | null,
  routes: WorkspaceRouteItem[] = [WORKSPACE_CHAT_ROUTE]
): { key: string } | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
  if (isTextEntryTarget(target)) return null;

  if (event.key === 'n' || event.key === 'N') return { key: 'new-chat' };

  const route = routes.find((item) => item.shortcut && item.shortcut === event.key);
  return route ? { key: route.key } : null;
}
