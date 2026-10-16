import assert from 'node:assert';
import { test } from 'node:test';
import { stripHtml, extractPreview } from '../preview';

test('stripHtml strips style, script, head, tags and decodes entities', () => {
  const htmlWithCss = `
    <style>:root{--bg:#FAF8F5;--ink:#111111;} .feed b{font:12px;}</style>
    <script>window.foo = "bar";</script>
    <p>Анализ &laquo;рынка&raquo; искусства &amp; медиа.</p>
  `;
  const result = stripHtml(htmlWithCss);
  assert.strictEqual(result, 'Анализ «рынка» искусства & медиа.');
  assert.strictEqual(result.includes(':root'), false);
  assert.strictEqual(result.includes('feed'), false);
});

test('extractPreview extracts from lead payload for issue', () => {
  const payload = {
    lead: {
      title: 'Большое искусство',
      body: '<p>Первый параграф о структуре контекста и капитала.</p>',
    },
  };
  const preview = extractPreview('ignored html', payload, 100);
  assert.strictEqual(preview, 'Первый параграф о структуре контекста и капитала.');
});

test('extractPreview parses EditorJS blocks correctly without JSON leak', () => {
  const editorJsContent = JSON.stringify({
    time: 12345678,
    blocks: [
      { type: 'header', data: { text: 'Заголовок статьи' } },
      { type: 'paragraph', data: { text: 'Текст первого абзаца с <b>жирным</b> шрифтом.' } },
    ],
  });
  const preview = extractPreview(editorJsContent, null, 100);
  assert.strictEqual(preview, 'Заголовок статьи Текст первого абзаца с жирным шрифтом.');
});

test('extractPreview discards raw JSON or CSS if unparseable', () => {
  const badJson = '{"blocks":[{"type":"code","data":{"code":"var x = 1;"}}]}';
  const preview = extractPreview(badJson, null, 100);
  assert.strictEqual(preview, '');
});
