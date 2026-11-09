import {
  activeWorkspaceKey,
  buildWorkspaceRoutes,
  isTextEntryTarget,
  shortcutRoute,
  type WorkspaceNavProject,
} from '../navigation';

const projects: WorkspaceNavProject[] = [
  {
    id: 'journal',
    slug: 'journal',
    name: 'Journal',
    historyId: 'history-journal',
    href: '/admin/pierrot?history=history-journal',
  },
  {
    id: 'heart',
    slug: 'heart-and-angel',
    name: 'Heart & Angel',
    historyId: 'history-heart',
    href: '/admin/pierrot?history=history-heart',
  },
];

describe('workspace navigation', () => {
  it('builds a menu of the mega chat and project big chats', () => {
    expect(buildWorkspaceRoutes(projects)).toEqual([
      {
        key: 'chat',
        path: '/admin/pierrot',
        label: 'Чат',
        shortcut: '1',
      },
      {
        key: 'project:journal',
        path: '/admin/pierrot?history=history-journal',
        label: 'Journal',
        shortcut: '2',
      },
      {
        key: 'project:heart',
        path: '/admin/pierrot?history=history-heart',
        label: 'Heart & Angel',
        shortcut: '3',
      },
    ]);
  });

  it('resolves the active menu item from the opened project history', () => {
    expect(activeWorkspaceKey('/admin/pierrot', projects, null, null)).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot', projects, 'history-journal', null)).toBe(
      'project:journal'
    );
    expect(activeWorkspaceKey('/admin/pierrot', projects, null, 'heart-and-angel')).toBe(
      'project:heart'
    );
    expect(activeWorkspaceKey('/admin/pierrot/projects', projects, null, null)).toBe('chat');
  });

  it('does not steal shortcuts while typing', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');

    expect(isTextEntryTarget(input)).toBe(true);
    expect(isTextEntryTarget(textarea)).toBe(true);
    expect(isTextEntryTarget(div)).toBe(true);
    expect(isTextEntryTarget(document.body)).toBe(false);
  });

  it('maps the mega chat and project chat shortcuts', () => {
    const routes = buildWorkspaceRoutes(projects);
    const base = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    expect(shortcutRoute({ ...base, key: '1' }, document.body, routes)).toEqual({ key: 'chat' });
    expect(shortcutRoute({ ...base, key: '2' }, document.body, routes)).toEqual({
      key: 'project:journal',
    });
    expect(shortcutRoute({ ...base, key: '3' }, document.body, routes)).toEqual({
      key: 'project:heart',
    });
    expect(shortcutRoute({ ...base, key: '4' }, document.body, routes)).toBeNull();
    expect(shortcutRoute({ ...base, key: 'n' }, document.body, routes)).toEqual({
      key: 'new-chat',
    });
  });

  it('ignores shortcuts with modifiers or while typing', () => {
    const input = document.createElement('input');
    expect(
      shortcutRoute(
        { key: '1', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        document.body
      )
    ).toBeNull();
    expect(
      shortcutRoute(
        { key: '1', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false },
        input
      )
    ).toBeNull();
  });
});
