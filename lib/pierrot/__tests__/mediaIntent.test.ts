/** @jest-environment node */

import { isMediaArchiveQuery } from '../mediaIntent';

describe('Pierrot media intent', () => {
  it.each([
    'В каких международных изданиях Антона цитировали по теме ИИ?',
    'Найди комментарии о российских дата-центрах',
    'Что писали о его позиции по цифровому суверенитету?',
    'Покажи прямые цитаты',
    'Какие темы чаще всего встречаются в иностранных публикациях?',
    'Сравни публикации разных изданий по одной теме',
    'What did the press write about data centres?',
    'Show media coverage and direct quotes',
  ])('matches media query: %s', (query) => {
    expect(isMediaArchiveQuery(query)).toBe(true);
  });

  it.each([
    'Купи открытку',
    'Расскажи о книге UNFRAMED',
    'Как связаться с Антоном?',
    'What is the price of the postcard?',
    'Открой страницу медиа',
  ])('does not route unrelated query: %s', (query) => {
    expect(isMediaArchiveQuery(query)).toBe(false);
  });
});
