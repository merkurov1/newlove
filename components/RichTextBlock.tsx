// components/RichTextBlock.tsx
import React from 'react';

// Ожидаем, что из Supabase придет поле 'text' или 'html'
// и передастся сюда через BlockRenderer
export default function RichTextBlock({ text, html }: { text?: string, html?: string }) {
  const content = typeof text === 'string' ? text : (typeof html === 'string' ? html : '');
  if (!content) return null;
  return <div dangerouslySetInnerHTML={{ __html: content }} />;
}

