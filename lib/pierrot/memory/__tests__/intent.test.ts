/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { detectMemoryIntent, parseReminderDate } from '../intent';

describe('owner memory intent', () => {
  it('separates remember, save and remind', () => {
    expect(detectMemoryIntent('Запомни, что я предпочитаю короткие ответы')).toMatchObject({
      action: 'remember',
      kind: 'memory',
      content: 'я предпочитаю короткие ответы',
    });

    expect(detectMemoryIntent('Сохрани эту идею: отдельная подборка для институций')).toMatchObject(
      {
        action: 'save',
        kind: 'saved',
        content: 'отдельная подборка для институций',
      }
    );

    expect(detectMemoryIntent('Напомни потом проверить интеграцию с LinkedIn')).toMatchObject({
      action: 'remind',
      kind: 'reminder',
    });

    const dated = detectMemoryIntent('Напомни завтра проверить интеграцию с LinkedIn');
    expect(dated.action).toBe('remind');
    expect(dated.content).toBe('проверить интеграцию с LinkedIn');
    expect(dated.reviewAt).toBeTruthy();
  });

  it('uses the previous assistant answer for “запомни это”', () => {
    const intent = detectMemoryIntent('Запомни это', {
      history: [
        { role: 'user', content: 'Как лучше?' },
        { role: 'assistant', content: 'Лучше начать с одного институционального письма.' },
      ],
    });

    expect(intent.action).toBe('remember');
    expect(intent.content).toContain('институционального письма');
  });

  it('recognises natural language variants without requiring the literal command', () => {
    expect(
      detectMemoryIntent('Пусть это останется в памяти', {
        history: [{ role: 'assistant', content: 'Короткие ответы работают лучше.' }],
      })
    ).toMatchObject({
      action: 'remember',
    });
    expect(
      detectMemoryIntent('К этому надо вернуться', {
        history: [{ role: 'assistant', content: 'Идея для институциональной подборки.' }],
      })
    ).toMatchObject({ action: 'save' });
    expect(detectMemoryIntent('Что я просил сохранить?')).toMatchObject({ action: 'list' });
    expect(detectMemoryIntent('Покажи напоминания')).toMatchObject({ action: 'list' });
    expect(detectMemoryIntent('Что у нас сохранено?')).toMatchObject({ action: 'list' });
    expect(detectMemoryIntent('Покажи память')).toMatchObject({ action: 'list' });
    expect(detectMemoryIntent('Что ты обо мне помнишь?')).toMatchObject({ action: 'list' });
  });

  it('asks for clarification when the record type is ambiguous', () => {
    expect(detectMemoryIntent('Запиши это')).toMatchObject({
      action: 'clarify',
      reason: 'ambiguous_create',
    });
  });

  it('does not treat casual mentions as commands', () => {
    expect(detectMemoryIntent('Я запомнил это вчера')).toMatchObject({ action: 'none' });
    expect(detectMemoryIntent('Ты помнишь, как мы обсуждали Sotheby’s?')).toMatchObject({
      action: 'none',
    });
  });

  it('flags explicit replacement language instead of silently overwriting', () => {
    expect(
      detectMemoryIntent('Запомни, что теперь вместо длинных ответов нужны короткие')
    ).toMatchObject({
      action: 'remember',
      possibleConflict: true,
    });
  });

  it('parses common reminder dates deterministically', () => {
    const now = new Date('2026-11-04T10:00:00.000Z');

    expect(parseReminderDate('напомни завтра', now)).toBe('2026-11-05T09:00:00.000Z');
    expect(parseReminderDate('напомни через 2 дня', now)).toBe('2026-11-06T10:00:00.000Z');
    expect(parseReminderDate('напомни 2026-12-01', now)).toBe('2026-12-01T09:00:00.000Z');
    expect(parseReminderDate('напомни 10 ноября', now)).toBe('2026-11-10T09:00:00.000Z');
    expect(parseReminderDate('напомни в пятницу', now)).toBe('2026-11-06T09:00:00.000Z');
    expect(parseReminderDate('напомни когда-нибудь', now)).toBeNull();
  });

  it('recognises the full lifecycle commands and keeps forget non-destructive', () => {
    expect(detectMemoryIntent('Забудь про старый черновик')).toMatchObject({
      action: 'forget',
      permanent: false,
      query: 'старый черновик',
    });
    expect(detectMemoryIntent('Удали навсегда старый черновик')).toMatchObject({
      action: 'delete',
      permanent: true,
      query: 'старый черновик',
    });
    expect(detectMemoryIntent('Почисти память')).toMatchObject({ action: 'cleanup' });
    expect(detectMemoryIntent('Почисти список')).toMatchObject({ action: 'cleanup' });
    expect(detectMemoryIntent('Покажи, что можно почистить')).toMatchObject({
      action: 'cleanup_preview',
    });
    expect(detectMemoryIntent('Верни в память заметку про выставку')).toMatchObject({
      action: 'restore',
      includeArchive: true,
    });
    expect(detectMemoryIntent('Что сейчас актуально по проекту Pierrot')).toMatchObject({
      action: 'current_status',
      query: 'проекту Pierrot',
    });
    expect(detectMemoryIntent('Что мы решали по поводу выставки')).toMatchObject({
      action: 'history_search',
      includeArchive: true,
    });
    expect(detectMemoryIntent('Это уже сделано')).toMatchObject({ action: 'complete' });
    expect(detectMemoryIntent('Forget about the old draft')).toMatchObject({
      action: 'forget',
      permanent: false,
    });
    expect(detectMemoryIntent('Delete the note permanently')).toMatchObject({
      action: 'delete',
      permanent: true,
    });
  });

  it('maps ordinary delete language to archive and extracts the target', () => {
    expect(detectMemoryIntent('Удали задачу про Heart&Angel')).toMatchObject({
      action: 'archive',
      query: 'Heart&Angel',
    });
    expect(detectMemoryIntent('Удали напоминание про Journal')).toMatchObject({
      action: 'archive',
      query: 'Journal',
    });
    expect(detectMemoryIntent('Убери эту задачу')).toMatchObject({
      action: 'archive',
      query: null,
      listReference: 'last',
    });
    expect(detectMemoryIntent('Delete the task about Heart&Angel')).toMatchObject({
      action: 'archive',
      query: 'Heart&Angel',
    });
    expect(detectMemoryIntent('Удали этот текст')).toMatchObject({
      action: 'none',
    });
  });

  it('recognises mark/consider completion forms and English completion', () => {
    expect(detectMemoryIntent('Пометь задачу про Heart&Angel выполненной')).toMatchObject({
      action: 'complete',
      query: 'Heart&Angel',
    });
    expect(detectMemoryIntent('Отметь выполненной')).toMatchObject({ action: 'complete' });
    expect(detectMemoryIntent('Считай задачу выполненной')).toMatchObject({
      action: 'complete',
      listReference: 'last',
    });
    expect(detectMemoryIntent('Mark the task about Journal as completed')).toMatchObject({
      action: 'complete',
      query: 'Journal',
    });
  });

  it('retains list references for batch and “last two” operations', () => {
    expect(detectMemoryIntent('Удали всё перечисленное')).toMatchObject({
      action: 'archive',
      listReference: 'all',
    });
    expect(detectMemoryIntent('Отметь последние две задачи выполненными')).toMatchObject({
      action: 'complete',
      listReference: 'last_two',
    });
    expect(detectMemoryIntent('Archive all listed tasks')).toMatchObject({
      action: 'archive',
      listReference: 'all',
    });
  });

  it('separates single, project and global completion scopes', () => {
    expect(detectMemoryIntent('Пометь задачу Bank Leumi выполненной')).toMatchObject({
      action: 'complete',
      scope: 'single',
      query: 'Bank Leumi',
    });
    expect(detectMemoryIntent('Все задачи по Media выполнены')).toMatchObject({
      action: 'complete',
      scope: 'project',
      projectRef: 'Media',
    });
    expect(detectMemoryIntent('Все задачи Journal выполнены')).toMatchObject({
      action: 'complete',
      scope: 'project',
      projectRef: 'Journal',
    });
    expect(detectMemoryIntent('Заверши все мои текущие задачи')).toMatchObject({
      action: 'complete',
      scope: 'all',
      projectRef: null,
    });
    expect(detectMemoryIntent('Отметь эту задачу выполненной')).toMatchObject({
      action: 'complete',
      scope: 'single',
      listReference: 'last',
    });
  });

  it('recognises a bare delete without a target as a contextual archive command', () => {
    expect(detectMemoryIntent('Удали')).toMatchObject({
      action: 'archive',
      query: null,
      permanent: false,
    });
  });

  it('recognises all Russian completed/finished forms', () => {
    for (const state of [
      'выполнена',
      'выполнено',
      'выполнен',
      'сделана',
      'сделано',
      'сделан',
      'готова',
      'готово',
      'готов',
      'завершена',
      'завершено',
      'завершён',
    ]) {
      expect(detectMemoryIntent(`Задача про поле ввода ${state}.`)).toMatchObject({
        action: 'complete',
        query: 'поле ввода',
      });
    }
  });

  it('extracts the task title and gives archive precedence over completion', () => {
    const completed = detectMemoryIntent('Задача про поле ввода выполнена.', {
      history: [
        {
          role: 'assistant',
          content: 'Это длинный предыдущий ответ, который не должен попасть в поиск.',
        },
      ],
    });
    expect(completed).toMatchObject({
      action: 'complete',
      query: 'поле ввода',
    });
    expect(completed.query).not.toContain('длинный предыдущий ответ');

    expect(
      detectMemoryIntent('Задача оптимизация картинок во Flow — выполнена, убери в архив.', {
        history: [
          {
            role: 'assistant',
            content: 'Это длинный предыдущий ответ, который не должен попасть в поиск.',
          },
        ],
      })
    ).toMatchObject({
      action: 'archive',
      query: 'оптимизация картинок во Flow',
    });

    const archived = detectMemoryIntent('Поле ввода Пьеро готово, архивируй.');
    expect(archived.action).toBe('archive');
    expect(archived.query).toBe('Поле ввода Пьеро');
    expect(archived.query).not.toContain('готово');
    expect(archived.query).not.toContain('архивируй');
  });

  it('does not treat a negative completion as done', () => {
    expect(detectMemoryIntent('Задача про поле ввода не выполнена.')).toMatchObject({
      action: 'none',
    });
  });

  it('returns a cleanup preview for a bulk archive request', () => {
    expect(detectMemoryIntent('Убери в архив всё лишнее и неактуальное')).toMatchObject({
      action: 'cleanup_preview',
      query: null,
    });
  });

  it('turns “запомни задачу” into a task instead of generic memory', () => {
    expect(
      detectMemoryIntent('Запомни задачу Art Engine — редизайн страницы картины.')
    ).toMatchObject({
      action: 'create_task',
      kind: null,
      content: 'Art Engine — редизайн страницы картины.',
    });
  });
});
