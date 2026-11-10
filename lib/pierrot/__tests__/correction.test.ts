/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import {
  detectSourceCorrection,
  isContextRecoveryRequest,
  isCorrectionMessage,
  isRepeatRequest,
} from '../correction';

describe('Pierrot correction detection', () => {
  it.each([
    'Нет, ты всё выдумал',
    'Нет ты все выдумал поищи по базе медиа',
    'Нет, не то',
    'Ты придумал эти публикации',
    'Еще раз посмотри в базу медиа',
    'Сделай то, что тебя просят',
    'Перечитай мое сообщение',
    'Я же просил использовать медиа',
    'Не надо отвечать на другой вопрос',
    'Именно по базе медиа',
    'По базе медиа, а не Brain',
    "That's not what I asked",
    'Do what I asked',
    'Read my message again',
    'You made that up',
    'Use the database, not Brain',
  ])('recognizes correction/repeat: %s', (query) => {
    expect(isContextRecoveryRequest(query)).toBe(true);
  });

  it('distinguishes a correction from a repeat request', () => {
    expect(isCorrectionMessage('Нет, ты всё выдумал')).toBe(true);
    expect(isRepeatRequest('Нет, ты всё выдумал')).toBe(false);
    expect(isRepeatRequest('Еще раз посмотри в базу медиа')).toBe(true);
    expect(isRepeatRequest('Сделай то, что тебя просят')).toBe(true);
  });

  it('extracts an explicit media source correction', () => {
    expect(detectSourceCorrection('Нет, по базе медиа, а не Brain')).toBe('media');
    expect(detectSourceCorrection('Use the media database, not Brain')).toBe('media');
    expect(detectSourceCorrection('просто расскажи о книге')).toBeNull();
  });

  it('does not treat a new independent question as a correction', () => {
    expect(isCorrectionMessage('Сколько у меня публикаций за 2026 год?')).toBe(false);
    expect(isRepeatRequest('Покажи последние записи медиа')).toBe(false);
  });
});
