/** @jest-environment node */

import { parseIntakeMessage } from '../parser';

const NOW = new Date('2026-11-09T12:00:00.000Z');
const TIMEZONE = 'Europe/London';

function parse(message: string) {
  return parseIntakeMessage(message, {
    now: NOW,
    timezone: TIMEZONE,
    timezoneKnown: true,
  });
}

describe('parseIntakeMessage — Russian', () => {
  it('extracts two products with a count', () => {
    const result = parse('Съел два яйца и тост.');

    expect(result.detected).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.65);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      type: 'food',
      itemName: 'яйца',
      quantity: 2,
      unit: null,
    });
    expect(result.items[1]).toMatchObject({
      type: 'food',
      itemName: 'тост',
      quantity: null,
    });
  });

  it('records a drink without inventing volume', () => {
    const result = parse('Выпил кофе с молоком.');

    expect(result.detected).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'кофе с молоком',
      quantity: null,
      unit: null,
    });
  });

  it('extracts measured water', () => {
    const result = parse('Сейчас выпил 500 мл воды.');

    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'вода',
      quantity: 500,
      unit: 'мл',
    });
  });

  it('handles a meal statement without a direct verb', () => {
    const result = parse('На обед была паста.');

    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'food',
      itemName: 'паста',
      quantity: null,
    });
    expect(result.items[0].occurredAt).toBe('2026-11-09T13:00:00.000Z');
  });

  it('uses yesterday evening in the local timezone', () => {
    const result = parse('Вчера вечером выпил бокал вина.');

    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'вино',
      quantity: 1,
      unit: 'бокал',
    });
    expect(result.items[0].occurredAt).toBe('2026-11-08T19:00:00.000Z');
  });

  it('records an apple without inventing a quantity', () => {
    const result = parse('Съел яблоко.');

    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'food',
      itemName: 'яблоко',
      quantity: null,
    });
  });
});

describe('parseIntakeMessage — English', () => {
  it('splits products joined by and', () => {
    const result = parse('I ate two eggs and toast.');

    expect(result.detected).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ type: 'food', itemName: 'eggs', quantity: 2 });
    expect(result.items[1]).toMatchObject({ type: 'food', itemName: 'toast', quantity: null });
  });

  it('recognises a drink with milk', () => {
    const result = parse('I drank coffee with milk');

    expect(result.detected).toBe(true);
    expect(result.items[0].type).toBe('drink');
    expect(result.items[0].itemName).toContain('coffee');
  });

  it('recognises "had a glass of wine" as a drink', () => {
    const result = parse('I had a glass of wine.');

    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'wine',
      quantity: 1,
      unit: 'glass',
    });
  });
});

describe('parseIntakeMessage — false positives', () => {
  const rejected = [
    'Что я ел сегодня?',
    'Сколько воды я выпил?',
    'Сегодня не ел.',
    'Я ничего не пил.',
    'Завтра съем пасту.',
    'Собираюсь выпить кофе.',
    'Если бы я съел яблоко, было бы лучше.',
    'Рецепт пасты: ингредиенты и приготовление.',
    'Он съел яблоко.',
    'Я люблю кофе.',
    '«Съел яблоко»',
    'Did I eat today?',
    "I didn't eat anything.",
    'I will drink coffee tomorrow.',
  ];

  it.each(rejected)('does not record: %s', (message) => {
    const result = parse(message);
    expect(result.detected).toBe(false);
    expect(result.items).toHaveLength(0);
  });
});

describe('parseIntakeMessage — natural portions and additions', () => {
  it('parses a morning coffee with milk without polluting the item name', () => {
    const result = parse('С утра выпил кофе с молоком.');
    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'кофе с молоком',
      quantity: null,
    });
  });

  it('parses half an apple as an explicit portion', () => {
    const result = parse('Перекусил половинкой яблока.');
    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'food',
      quantity: 0.5,
      unit: null,
    });
    expect(result.items[0].itemName).toContain('яблок');
  });

  it('parses half a litre of water as 500 ml-equivalent quantity', () => {
    const result = parse('Выпил пол-литра воды.');
    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'вода',
      quantity: 0.5,
      unit: 'л',
    });
  });

  it('records an explicit add command for one coffee', () => {
    const result = parse('Добавь ещё один кофе.');
    expect(result.detected).toBe(true);
    expect(result.items[0]).toMatchObject({
      type: 'drink',
      itemName: 'кофе',
      quantity: 1,
    });
  });

  it('records multiple products in one sentence', () => {
    const result = parse('Съел два яйца и кусок хлеба.');
    expect(result.detected).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ itemName: 'яйца', quantity: 2 });
    expect(result.items[1]).toMatchObject({ itemName: 'хлеба', quantity: 1, unit: 'кусок' });
  });

  it('still refuses a future meal and a third-party meal', () => {
    expect(parse('Завтра съем пиццу.').detected).toBe(false);
    expect(parse('Он съел пиццу.').detected).toBe(false);
  });
});

describe('parseIntakeMessage — timezone honesty', () => {
  it('marks UTC fallback as unknown', () => {
    const result = parseIntakeMessage('Съел яблоко', {
      now: NOW,
      timezone: 'UTC',
      timezoneKnown: false,
    });

    expect(result.detected).toBe(true);
    expect(result.timezoneKnown).toBe(false);
    expect(result.timezone).toBe('UTC');
  });
});
