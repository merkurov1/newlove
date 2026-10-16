import assert from 'node:assert';
import { test } from 'node:test';
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
  assert.strictEqual(result.ru, 'Глобальная ликвидность перетекает в редкие исторические нарративы.');
});

test('parseBilingualContent parses divider-separated text without explicit tags', () => {
  const text = `
    Цифровое наследие сохраняет ценность в эпоху алгоритмического шума.
    ---
    Digital heritage preserves value in an era of algorithmic noise.
  `;
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, true);
  assert.strictEqual(result.ru, 'Цифровое наследие сохраняет ценность в эпоху алгоритмического шума.');
  assert.strictEqual(result.en, 'Digital heritage preserves value in an era of algorithmic noise.');
});

test('parseBilingualContent handles single language text gracefully', () => {
  const text = 'Только русский текст без перевода.';
  const result = parseBilingualContent(text);
  assert.strictEqual(result.isBilingual, false);
  assert.strictEqual(result.ru, 'Только русский текст без перевода.');
  assert.strictEqual(result.en, null);
});
