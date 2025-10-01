// components/RichTextBlock.tsx
import React from 'react';

// Ожидаем, что из Supabase придет поле 'text' или 'html'
// и передастся сюда через BlockRenderer
export default function RichTextBlock({ text, html }: { text?: string, html?: string }) {
  if (typeof text === 'string' && text.trim()) {
    return <div dangerouslySetInnerHTML={{ __html: text }} />;
  }
  if (typeof html === 'string' && html.trim()) {
    return <div dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return null;
}

