import {
  WORKSPACE_BOTTOM_ROUTES,
  WORKSPACE_PRIMARY_ROUTES,
  WORKSPACE_ROUTES,
  activeWorkspaceKey,
  isTextEntryTarget,
  shortcutRoute,
} from '../navigation';

describe('workspace navigation', () => {
  it('keeps the requested primary order and a separated utility group', () => {
    expect(WORKSPACE_PRIMARY_ROUTES.map((route) => route.key)).toEqual([
      'chat',
      'projects',
      'flow',
      'art',
      'heart',
    ]);
    expect(WORKSPACE_BOTTOM_ROUTES.map((route) => route.key)).toEqual([
      'brain',
      'dash',
      'dev',
    ]);
    expect(WORKSPACE_ROUTES.map((route) => route.key)).toEqual([
      'chat',
      'projects',
      'flow',
      'art',
      'heart',
      'brain',
      'dash',
      'dev',
    ]);
    expect(WORKSPACE_ROUTES.map((route) => route.shortcut)).toEqual([
      '1',
      '8',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
    ]);
  });

  it('resolves active route without treating intelligence as the owner shell', () => {
    expect(activeWorkspaceKey('/admin/pierrot')).toBe('chat');
    expect(activeWorkspaceKey('/admin/pierrot/brain')).toBe('brain');
    expect(activeWorkspaceKey('/admin/pierrot/flow')).toBe('flow');
    expect(activeWorkspaceKey('/admin/pierrot/dash')).toBe('dash');
    expect(activeWorkspaceKey('/admin/pierrot/dev')).toBe('dev');
    expect(activeWorkspaceKey('/admin/pierrot/art-engine')).toBe('art');
    expect(activeWorkspaceKey('/heartandangel/world')).toBe('heart');
    expect(activeWorkspaceKey('/admin/pierrot/heart-and-angel')).toBe('heart');
    expect(activeWorkspaceKey('/admin/pierrot/intelligence')).toBe('chat');
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

  it('maps Cmd/Ctrl+1..7 and Cmd/Ctrl+N outside fields', () => {
    const base = { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
    expect(shortcutRoute({ ...base, key: '1' }, document.body)).toEqual({ key: 'chat' });
    expect(shortcutRoute({ ...base, key: '2' }, document.body)).toEqual({ key: 'flow' });
    expect(shortcutRoute({ ...base, key: '3' }, document.body)).toEqual({ key: 'art' });
    expect(shortcutRoute({ ...base, key: '4' }, document.body)).toEqual({ key: 'heart' });
    expect(shortcutRoute({ ...base, key: '5' }, document.body)).toEqual({ key: 'brain' });
    expect(shortcutRoute({ ...base, key: '6' }, document.body)).toEqual({ key: 'dash' });
    expect(shortcutRoute({ ...base, key: '7' }, document.body)).toEqual({ key: 'dev' });
    expect(shortcutRoute({ ...base, key: '8' }, document.body)).toEqual({ key: 'projects' });
    expect(shortcutRoute({ ...base, key: 'n' }, document.body)).toEqual({ key: 'new-chat' });
    expect(
      shortcutRoute({ ...base, metaKey: false, ctrlKey: true, key: '2' }, document.body)
    ).toEqual({ key: 'flow' });
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
