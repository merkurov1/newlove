/** @jest-environment node */

import { describe, expect, it } from '@jest/globals';
import { detectCommercialQuestion, parseCustomPeriod } from '../commercialQuestion';

const now = new Date('2026-11-02T12:00:00.000Z');
const timezone = 'Europe/London';

describe('Pierrot commercial question detection', () => {
  it('recognises the owner questions from the brief', () => {
    const questions = [
      'Сколько мы заработали?',
      'Сколько заработал Пьеро?',
      'Сколько заработали за последнюю неделю?',
      'Сколько продаж пришло благодаря Пьеро?',
      'Почему так мало?',
      'Что продаётся лучше?',
      'Почему люди не покупают?',
      'Сколько человек заинтересовались книгой?',
      'Сколько начали оформление, но не закончили?',
      'Сколько новых подписчиков Flow?',
      'Сколько пожертвований получил Temple?',
      'Что мне делать на следующей неделе?',
      'Сравни последние две недели.',
      'Покажи динамику за месяц.',
      'Что изменилось после прошлой недели?',
      'Пьеро, как у нас дела?',
      'How much did we earn?',
      'Why are sales so low?',
    ];

    for (const question of questions) {
      expect(detectCommercialQuestion(question, { now, timezone })).not.toBeNull();
    }
  });

  it('does not hijack ordinary product questions', () => {
    expect(detectCommercialQuestion('Сколько стоит открытка?')).toBeNull();
    expect(detectCommercialQuestion('Tell me about UNFRAMED')).toBeNull();
    expect(detectCommercialQuestion('Что такое Temple?')).toBeNull();
    expect(detectCommercialQuestion('How do I donate?')).toBeNull();
  });

  it('does not hijack a document named Weekly Review', () => {
    expect(detectCommercialQuestion('Найди Weekly Review', { now, timezone })).toBeNull();
    expect(
      detectCommercialQuestion('Не то! Найди Weekly Review в Brain', { now, timezone })
    ).toBeNull();
    expect(
      detectCommercialQuestion('Я имею в виду документ в Brain, а не коммерческую статистику', {
        now,
        timezone,
      })
    ).toBeNull();
  });

  it('does not hijack personal views or manuscript work', () => {
    expect(detectCommercialQuestion('Как изменились мои взгляды?', { now, timezone })).toBeNull();
    expect(detectCommercialQuestion('Что мне делать с рукописью?', { now, timezone })).toBeNull();
  });

  it('still recognises an explicitly commercial weekly report', () => {
    const question = detectCommercialQuestion('Сделай weekly review продаж и выручки за неделю', {
      now,
      timezone,
    });

    expect(question?.commercial).toBe(true);
    expect(question?.weeklyReview).toBe(true);
  });

  it('combines revenue, diagnosis and recommendation in one question', () => {
    const question = detectCommercialQuestion(
      'Сколько мы заработали, почему так мало и что мне делать?',
      { now, timezone }
    );

    expect(question?.wantsRevenue).toBe(true);
    expect(question?.wantsWhy).toBe(true);
    expect(question?.wantsRecommendations).toBe(true);
  });

  it('recognises previous week and month comparisons', () => {
    expect(
      detectCommercialQuestion('Сколько заработали за прошлую неделю?', {
        now,
        timezone,
      })?.periodKey
    ).toBe('previous_7_days');

    expect(
      detectCommercialQuestion('Сравни с предыдущим месяцем.', {
        now,
        timezone,
      })?.periodKey
    ).toBe('current_month');

    expect(
      detectCommercialQuestion('Покажи динамику за месяц.', {
        now,
        timezone,
      })?.periodKey
    ).toBe('last_30_days');
  });

  it('parses Russian and ISO date ranges', () => {
    expect(parseCustomPeriod('с 1 октября по 15 октября 2026', now, timezone)).toEqual({
      start: '2026-10-01',
      end: '2026-10-15',
    });
    expect(parseCustomPeriod('from 2026-10-01 to 2026-10-15', now, timezone)).toEqual({
      start: '2026-10-01',
      end: '2026-10-15',
    });
  });
});
