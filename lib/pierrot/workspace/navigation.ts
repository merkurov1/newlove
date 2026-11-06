export const WORKSPACE_PRIMARY_ROUTES = [
  { key: 'chat', path: '/admin/pierrot', label: 'CHAT', shortcut: '1' },
  { key: 'flow', path: '/admin/pierrot/flow', label: 'FLOW', shortcut: '2' },
  { key: 'art', path: '/admin/pierrot/art-engine', label: 'ART', shortcut: '3' },
  {
    key: 'heart',
    // The heart opens the public World route. For an authenticated owner the
    // World route is wrapped by the same Pierrot shell (see
    // app/heartandangel/world/layout.tsx), so the rail is preserved.
    path: '/heartandangel/world',
    label: 'HEART & ANGEL',
    shortLabel: 'HEART',
    shortcut: '4',
    iconOnly: true,
  },
] as const;

/**
 * Lower utility group. It is separated from the primary workspaces in the
 * rail. Skill Foundry is kept here so the existing route stays discoverable
 * without interrupting the requested Chat / Flow / Art / Heart order.
 */
export const WORKSPACE_BOTTOM_ROUTES = [
  { key: 'brain', path: '/admin/pierrot/brain', label: 'BRAIN', shortcut: '5' },
  { key: 'dash', path: '/admin/pierrot/dash', label: 'DASH', shortcut: '6' },
  { key: 'dev', path: '/admin/pierrot/dev', label: 'DEV', shortcut: '7' },
  { key: 'skills', path: '/admin/pierrot/skills', label: 'SKILLS', shortcut: '8' },
] as const;

export const WORKSPACE_ROUTES = [...WORKSPACE_PRIMARY_ROUTES, ...WORKSPACE_BOTTOM_ROUTES] as const;

export type WorkspaceRouteKey = (typeof WORKSPACE_ROUTES)[number]['key'];

export function activeWorkspaceKey(pathname: string): WorkspaceRouteKey {
  // /heartandangel/world is rendered inside WorkspaceShell for the owner.
  if (pathname.startsWith('/heartandangel')) return 'heart';
  if (pathname.startsWith('/admin/pierrot/heart-and-angel')) return 'heart';
  if (pathname.startsWith('/admin/pierrot/flow')) return 'flow';
  if (pathname.startsWith('/admin/pierrot/brain')) return 'brain';
  if (pathname.startsWith('/admin/pierrot/dash')) return 'dash';
  if (pathname.startsWith('/admin/pierrot/dev')) return 'dev';
  if (pathname.startsWith('/admin/pierrot/art-engine')) return 'art';
  if (pathname.startsWith('/admin/pierrot/skills')) return 'skills';
  return 'chat';
}

/**
 * Shortcuts must not steal Cmd/Ctrl+N or Cmd/Ctrl+1..8 while the owner is
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
  target: EventTarget | null
): { key: WorkspaceRouteKey | 'new-chat' } | null {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return null;
  if (isTextEntryTarget(target)) return null;

  if (event.key === 'n' || event.key === 'N') return { key: 'new-chat' };

  const route = WORKSPACE_ROUTES.find((item) => item.shortcut === event.key);
  return route ? { key: route.key } : null;
}
