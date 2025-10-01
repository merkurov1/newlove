// components/RichTextBlock.tsx
import React from 'react';

// Ожидаем, что из Supabase придет поле 'text' или 'html'
// и передастся сюда через BlockRenderer
export default function RichTextBlock({ text, html }: { text?: string, html?: string }) {
  let content = '';
  let isJson = false;
  if (typeof text === 'string') {
    content = text;
    // Если строка выглядит как JSON, помечаем это
    try {
      const parsed = JSON.parse(text);
      isJson = true;
      if (typeof parsed === 'string') content = parsed;
    } catch {}
  } else if (typeof html === 'string') {
    content = html;
  }
  if (!content) return null;
  if (isJson) {
    return <div style={{color: 'red', background: '#fff3cd', padding: 12, borderRadius: 8, margin: '12px 0'}}>
      <b>Ошибка: В richText-блоке поле text содержит JSON, а не HTML!</b>
      <pre style={{fontSize: 12, whiteSpace: 'pre-wrap'}}>{content}</pre>
    </div>;
  }
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

