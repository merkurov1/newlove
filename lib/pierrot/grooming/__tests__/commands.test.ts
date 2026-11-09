import { detectGroomingCommand, parseGroomingApproval } from '../commands';

describe('workspace grooming commands', () => {
  it.each([
    ['Наведи тут порядок', 'all'],
    ['Наведи порядок', 'all'],
    ['Наведи порядок в диалогах', 'conversations'],
    ['Наведи порядок в проектах', 'projects'],
    ['Проверь задачи', 'tasks'],
    ['Почисти контекст', 'context'],
    ['Сверься с GitHub', 'github'],
  ])('detects %s as scope %s', (message, scope) => {
    expect(detectGroomingCommand(message)).toMatchObject({ kind: 'audit', scope });
  });

  it('leaves explicit project review to the existing project service', () => {
    expect(detectGroomingCommand('Наведи порядок в проекте Journal')).toBeNull();
    expect(detectGroomingCommand('Проведи ревизию проекта Art Engine')).toBeNull();
  });

  it('parses batch approvals and individual ordinals', () => {
    expect(parseGroomingApproval('подтверди всё безопасное')).toMatchObject({
      kind: 'approve',
      mode: 'safe',
    });
    expect(parseGroomingApproval('подтверждаю всё')).toMatchObject({
      kind: 'approve',
      mode: 'all',
    });
    expect(parseGroomingApproval('подтверди 1,3 и 5')).toEqual({
      kind: 'approve',
      mode: 'selected',
      ordinals: [1, 3, 5],
    });
    expect(parseGroomingApproval('выполни пункты 2, 4')).toMatchObject({
      kind: 'approve',
      mode: 'selected',
      ordinals: [2, 4],
    });
  });

  it('parses reject/show and does not treat an ordinary sentence as approval', () => {
    expect(parseGroomingApproval('отклони всё')).toEqual({
      kind: 'reject',
      mode: 'all',
      ordinals: [],
    });
    expect(parseGroomingApproval('отклони пункты 2,5')).toEqual({
      kind: 'reject',
      mode: 'selected',
      ordinals: [2, 5],
    });
    expect(parseGroomingApproval('покажи план')).toMatchObject({ kind: 'show' });
    expect(parseGroomingApproval('да, наверное потом')).toBeNull();
  });
});
