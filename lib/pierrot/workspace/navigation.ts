export const WORKSPACE_ROUTES = [
  { key: 'chat', path: '/admin/pierrot', label: 'CHAT', shortcut: '1' },
  { key: 'flow', path: '/admin/pierrot/flow', label: 'FLOW', shortcut: '2' },
  { key: 'brain', path: '/admin/pierrot/brain', label: 'BRAIN', shortcut: '3' },
  { key: 'dash', path: '/admin/pierrot/dash', label: 'DASH', shortcut: '4' },
  { key: 'dev', path: '/admin/pierrot/dev', label: 'DEV', shortcut: '5' },
  { key: 'art', path: '/admin/pierrot/art-engine', label: 'ART', shortcut: '6' },
  {
    key: 'heart',
    path: '/admin/pierrot/heart-and-angel',
    label: 'HEART & ANGEL',
    shortLabel: 'HEART',
    shortcut: '7',
  },
] as const;

export type WorkspaceRouteKey = (typeof WORKSPACE_ROUTES)[number]['key'];

export function activeWorkspaceKey(pathname: string): WorkspaceRouteKey {
  if (pathname.startsWith('/admin/pierrot/flow')) return 'flow';
  if (pathname.startsWith('/admin/pierrot/brain')) return 'brain';
  if (pathname.startsWith('/admin/pierrot/dash')) return 'dash';
  if (pathname.startsWith('/admin/pierrot/dev')) return 'dev';
  if (pathname.startsWith('/admin/pierrot/art-engine')) return 'art';
  if (pathname.startsWith('/admin/pierrot/heart-and-angel')) return 'heart';
  return 'chat';
}

/**
 * Shortcuts must not steal Cmd/Ctrl+N or Cmd/Ctrl+1..7 while the owner is
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
