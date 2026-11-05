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
});
