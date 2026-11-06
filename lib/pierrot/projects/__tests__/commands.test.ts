import { detectProjectCommand } from '../commands';

describe('project chat commands', () => {
  it('recognises project creation', () => {
    expect(detectProjectCommand('Пьеро, создай проект Art Engine')).toEqual({
      action: 'create',
      name: 'Art Engine',
      task: null,
    });
  });

  it('does not put a second command into the project name', () => {
    expect(
      detectProjectCommand(
        'Создай проект Heart & Angel и там добавь задачу - опустить шарик с сердечком на мобильных ниже'
      )
    ).toEqual({
      action: 'create',
      name: 'Heart & Angel',
      task: 'опустить шарик с сердечком на мобильных ниже',
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

  it('parses an explicit owner rating without touching priority', () => {
    expect(detectProjectCommand('Поставь проекту Journal оценку 8')).toEqual({
      action: 'rate',
      name: 'Journal',
      rating: 8,
    });
    expect(detectProjectCommand('Оцени проект Art Engine на 10')).toEqual({
      action: 'rate',
      name: 'Art Engine',
      rating: 10,
    });
  });

  it('rejects an out-of-range rating', () => {
    expect(detectProjectCommand('Поставь проекту Journal оценку 11')).toEqual({ action: 'none' });
  });

  it('parses a meaningful brief update', () => {
    expect(
      detectProjectCommand(
        'Обнови бриф проекта Journal: цель — еженедельный выпуск с редакционным отбором.'
      )
    ).toMatchObject({
      action: 'update_brief',
      name: 'Journal',
      brief: 'цель — еженедельный выпуск с редакционным отбором.',
    });
  });

  it('does not overwrite a brief with a tiny message', () => {
    expect(detectProjectCommand('Обнови бриф проекта Journal: ок')).toEqual({ action: 'none' });
  });

  it('does not treat deleting a task as deleting a project', () => {
    expect(detectProjectCommand('удали задачу про Heart&Angel')).toEqual({ action: 'none' });
  });

  it.each([
    'Наведи порядок в проекте',
    'Разбери проект',
    'Приведи всё в порядок',
    'Проведи ревизию проекта',
    'Пьеро, сделай глубокую ревизию проекта',
    'review the project',
  ])('recognises a whole-project review intent: %s', (message) => {
    expect(detectProjectCommand(message)).toMatchObject({ action: 'review' });
  });

  it('keeps the review command scoped and can carry a project name', () => {
    expect(detectProjectCommand('Наведи порядок в проекте Art Engine')).toEqual({
      action: 'review',
      projectName: 'Art Engine',
    });
    expect(detectProjectCommand('наведи порядок в голове')).toEqual({ action: 'none' });
  });
});
