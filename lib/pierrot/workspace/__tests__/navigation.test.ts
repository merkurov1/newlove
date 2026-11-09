import {
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  isTextEntryTarget,
  shortcutRoute,
} from '../navigation';

describe('workspace navigation', () => {
  it('starts with chat and then follows the editorial site sections', () => {
    expect(WORKSPACE_ROUTES.map((route) => route.key)).toEqual([
      'chat',
      'journal',
      'heart-and-angel',
      'art-engine',
      'lobby',
    ]);
    expect(WORKSPACE_ROUTES.map((route) => route.path)).toEqual([
      '/admin/pierrot',
      '/journal',
      '/heartandangel',
      '/art-engine',
      '/lobby',
    ]);
  });

  it('resolves active route', () => {
    expect(activeWorkspaceKey('/admin/pierrot')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/projects')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/dev')).toBe('chat');
    expect(activeWorkspaceKey('/journal')).toBe('journal');
    expect(activeWorkspaceKey('/flow')).toBe('journal');
    expect(activeWorkspaceKey('/heartandangel/world')).toBe('heart-and-angel');
    expect(activeWorkspaceKey('/temple')).toBe('heart-and-angel');
    expect(activeWorkspaceKey('/art-engine')).toBe('art-engine');
    expect(activeWorkspaceKey('/selection')).toBe('art-engine');
    expect(activeWorkspaceKey('/lobby')).toBe('lobby');
    expect(activeWorkspaceKey('/unframed')).toBe('lobby');
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

  it('maps chat and editorial section shortcuts', () => {
    const base = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    expect(shortcutRoute({ ...base, key: '1' }, document.body)).toEqual({ key: 'chat' });
    expect(shortcutRoute({ ...base, key: '2' }, document.body)).toEqual({ key: 'journal' });
    expect(shortcutRoute({ ...base, key: '3' }, document.body)).toEqual({
      key: 'heart-and-angel',
    });
    expect(shortcutRoute({ ...base, key: '4' }, document.body)).toEqual({ key: 'art-engine' });
    expect(shortcutRoute({ ...base, key: '5' }, document.body)).toEqual({ key: 'lobby' });
    expect(shortcutRoute({ ...base, key: '6' }, document.body)).toBeNull();
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
