import { detectProjectCommand } from '../commands';

describe('project chat commands', () => {
  it('recognises project creation', () => {
    expect(detectProjectCommand('Пьеро, создай проект Art Engine')).toEqual({
      action: 'create',
      name: 'Art Engine',
    });
  });

  it('requires confirmation for deletion and recognises the confirmation form', () => {
    expect(detectProjectCommand('удали проект Art Engine')).toMatchObject({
      action: 'delete',
      name: 'Art Engine',
      confirmed: false,
    });
    expect(detectProjectCommand('да, удалить проект Art Engine')).toMatchObject({
      action: 'delete',
      name: 'Art Engine',
      confirmed: true,
    });
  });

  it('recognises moving the current task into a project', () => {
    expect(detectProjectCommand('перенеси эту задачу в проект Art Engine')).toEqual({
      action: 'move_task',
      taskQuery: null,
      projectName: 'Art Engine',
    });
  });

  it('does not treat deleting a task as deleting a project', () => {
    expect(detectProjectCommand('удали задачу про Heart&Angel')).toEqual({ action: 'none' });
  });
});
