/** @jest-environment node */

import { detectWebsiteQuestion } from '../question';

const NOW = new Date('2026-11-09T12:00:00.000Z');

function ask(message: string) {
  return detectWebsiteQuestion(message, { now: NOW, timezone: 'Europe/London' });
}

describe('detectWebsiteQuestion', () => {
  it('recognises the owner’s natural website questions', () => {
    const cases: Array<[string, string]> = [
      ['Расскажи, что у нас происходит с сайтом.', 'overview'],
      ['Что изменилось за последнюю неделю?', 'compare'],
      ['Откуда приходят посетители?', 'traffic'],
      ['Что люди ищут в Google?', 'search'],
      ['Какие страницы привлекают внимание, но не приводят к действиям?', 'pages'],
      ['Интересуются ли Heart & Angel?', 'projects'],
      ['Почему люди читают мои материалы, но не подписываются?', 'pages'],
      ['Какие публикации сейчас набирают популярность?', 'pages'],
      ['Что изменилось по сравнению с предыдущим месяцем?', 'compare'],
      ['Какие проблемы и возможности ты обнаружил?', 'anomalies'],
      ['Что происходит с поисковым трафиком?', 'search'],
      ['Сравни последние 30 дней с предыдущими', 'compare'],
      ['Что происходит с моим публичным присутствием?', 'overview'],
      ['Покажи статистику Bluesky', 'bluesky'],
      ['Сравни русскую и английскую рассылки', 'newsletter'],
      ['Покажи статистику рассылок', 'newsletter'],
      ['Что Vercel знает о качестве сайта?', 'health'],
      ['Как быстро загружается сайт по Speed Insights?', 'health'],
    ];

    for (const [message, scope] of cases) {
      const question = ask(message);
      expect({ message, scope: question?.scope }).toEqual({ message, scope });
    }
  });

  it('detects the named project and keeps it attached', () => {
    expect(ask('Что происходит с Flow?')).toMatchObject({
      website: true,
      scope: 'projects',
      project: 'flow',
    });
    expect(ask('Интересуются ли Heart & Angel?')).toMatchObject({
      scope: 'projects',
      project: 'heart',
    });
  });

  it('does not hijack commercial revenue questions', () => {
    for (const message of [
      'Сколько мы заработали за неделю?',
      'Сколько продаж пришло благодаря Пьеро?',
      'Сколько подписчиков?',
      'Сколько пожертвований получил Temple?',
      'Почему продажи с сайта упали?',
      'Сколько стоит открытка?',
    ]) {
      expect({ message, result: ask(message) }).toEqual({ message, result: null });
    }
  });

  it('does not hijack ordinary conversation', () => {
    expect(ask('Расскажи о выставке')).toBeNull();
    expect(ask('Что ты думаешь о мозге?')).toBeNull();
    expect(ask('Найди документ Weekly Review')).toBeNull();
  });

  it('supports an explicit /site command', () => {
    expect(ask('/site')).toMatchObject({ website: true, scope: 'overview' });
  });

  it('marks a detailed request explicitly', () => {
    expect(ask('Подробно покажи статистику сайта за 30 дней')?.wantsDetailed).toBe(true);
    expect(ask('Что происходит с сайтом?')?.wantsDetailed).toBe(false);
  });

  it('resolves periods without inventing a window', () => {
    expect(ask('Что у нас с сайтом за последние 7 дней')?.periodKey).toBe('last_7_days');
    expect(ask('Сравни последние 30 дней с предыдущими')?.periodKey).toBe('last_30_days');
    expect(ask('Что было в прошлом месяце?')?.periodKey).toBe('previous_month');
    expect(ask('Что у нас с сайтом?')?.periodKey).toBe('last_7_days');
  });
});
