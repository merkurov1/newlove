import {
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  isTextEntryTarget,
  shortcutRoute,
} from '../navigation';

describe('workspace navigation', () => {
  it('keeps only the chat and projects spaces', () => {
    expect(WORKSPACE_ROUTES.map((route) => route.key)).toEqual(['chat', 'projects']);
    expect(WORKSPACE_ROUTES.map((route) => route.path)).toEqual([
      '/admin/pierrot',
      '/admin/pierrot/projects',
    ]);
  });

  it('resolves active route', () => {
    expect(activeWorkspaceKey('/admin/pierrot')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/projects')).toBe('projects');
    expect(activeWorkspaceKey('/admin/pierrot/dev')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/flow')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/art-engine')).toBe('chat');
    expect(activeWorkspaceKey('/heartandangel/world')).toBe('chat');
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

  it('maps only chat, projects and new-session shortcuts', () => {
    const base = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    expect(shortcutRoute({ ...base, key: '1' }, document.body)).toEqual({ key: 'chat' });
    expect(shortcutRoute({ ...base, key: '2' }, document.body)).toEqual({ key: 'projects' });
    expect(shortcutRoute({ ...base, key: '3' }, document.body)).toBeNull();
    expect(shortcutRoute({ ...base, key: '7' }, document.body)).toBeNull();
    expect(shortcutRoute({ ...base, key: 'n' }, document.body)).toEqual({ key: 'new-chat' });
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
