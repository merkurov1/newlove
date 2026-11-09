/**
 * The owner PWA has exactly two primary spaces: the continuous chat and the
 * project catalog. Memory and Flow are compact actions in the topbar; technical
 * tools are contextual, not primary navigation.
 */
export const WORKSPACE_ROUTES = [
  { key: 'chat', path: '/admin/pierrot', label: 'Чат', shortcut: '1' },
  { key: 'projects', path: '/admin/pierrot/projects', label: 'Проекты', shortcut: '2' },
] as const;

export type WorkspaceRouteKey = (typeof WORKSPACE_ROUTES)[number]['key'];

export function activeWorkspaceKey(pathname: string): WorkspaceRouteKey {
  if (pathname.startsWith('/admin/pierrot/projects')) return 'projects';
  return 'chat';
}

/**
 * Shortcuts must not steal Cmd/Ctrl+N or Cmd/Ctrl+1..2 while the owner is
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
