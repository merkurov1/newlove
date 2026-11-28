import assert from 'node:assert';
import { parseBilingualContent } from '../bilingual';

test('parseBilingualContent parses [RU] and [EN] tags', () => {
  const text = `
    [RU] Архитектура медиа определяет форму внимания.
    ---
    [EN] Media architecture shapes the contour of human attention.
  `;
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, true);
  assert.strictEqual(result.ru, 'Архитектура медиа определяет форму внимания.');
  assert.strictEqual(result.en, 'Media architecture shapes the contour of human attention.');
});

test('parseBilingualContent parses EN first then RU tags', () => {
  const text = `
    ### EN
    Global liquidity flows into scarce historical narratives.
    ### RU
    Глобальная ликвидность перетекает в редкие исторические нарративы.
  `;
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, true);
  assert.strictEqual(result.en, 'Global liquidity flows into scarce historical narratives.');
  assert.strictEqual(
    result.ru,
    'Глобальная ликвидность перетекает в редкие исторические нарративы.'
  );
});

test('parseBilingualContent parses divider-separated text without explicit tags', () => {
  const text = `
    Цифровое наследие сохраняет ценность в эпоху алгоритмического шума.
    ---
    Digital heritage preserves value in an era of algorithmic noise.
  `;
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, true);
  assert.strictEqual(
    result.ru,
    'Цифровое наследие сохраняет ценность в эпоху алгоритмического шума.'
  );
  assert.strictEqual(result.en, 'Digital heritage preserves value in an era of algorithmic noise.');
});

test('parseBilingualContent keeps a single tagged English section', () => {
  const result = parseBilingualContent('[EN] Only the English version survived.');

  assert.strictEqual(result.isBilingual, false);
  assert.strictEqual(result.en, 'Only the English version survived.');
  assert.strictEqual(result.ru, null);
  assert.strictEqual(result.singleText, 'Only the English version survived.');
});

test('parseBilingualContent keeps a single tagged Russian section', () => {
  const result = parseBilingualContent('[RU] Сохранилась только русская версия.');

  assert.strictEqual(result.isBilingual, false);
  assert.strictEqual(result.ru, 'Сохранилась только русская версия.');
  assert.strictEqual(result.en, null);
  assert.strictEqual(result.singleText, 'Сохранилась только русская версия.');
});

test('parseBilingualContent keeps the available side of an incomplete pair', () => {
  const result = parseBilingualContent('[RU] Русский текст.\n---\n[EN]');

  assert.strictEqual(result.isBilingual, false);
  assert.strictEqual(result.ru, 'Русский текст.');
  assert.strictEqual(result.en, null);
  assert.strictEqual(result.singleText, 'Русский текст.');
});

test('parseBilingualContent handles single language text gracefully', () => {
  const text = 'Только русский текст без перевода.';
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, false);
  assert.strictEqual(result.ru, 'Только русский текст без перевода.');
  assert.strictEqual(result.en, null);
});
