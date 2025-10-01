// components/RichTextBlock.tsx
import React from 'react';

// Ожидаем, что из Supabase придет поле 'text' или 'html'
// и передастся сюда через BlockRenderer
export default function RichTextBlock({ text, html }: { text?: string, html?: string }) {
  const content = text || html;
  
  if (!content) {
    return null;
  }

  // dangerouslySetInnerHTML используется для рендеринга HTML-строки
  // Это безопасно, если вы доверяете источнику контента (вашей CMS)
  return (
    <div dangerouslySetInnerHTML={{ __html: content }} />
  );
}

