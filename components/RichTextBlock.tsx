// components/RichTextBlock.tsx
import React from 'react';

// Ожидаем, что из Supabase придет поле 'text' или 'html'
// и передастся сюда через BlockRenderer
export default function RichTextBlock({ text, html }: { text?: string, html?: string }) {
  let content = '';
  if (typeof text === 'string') {
    content = text;
    // Попробуем распарсить, если это JSON
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'string') content = parsed;
    } catch {}
  } else if (typeof html === 'string') {
    content = html;
  }
  if (!content) return null;
  return <>
    <div style={{background:'#f6f8fa',color:'#333',fontSize:'13px',padding:'8px',borderRadius:'6px',marginBottom:'8px',overflowX:'auto'}}>
      richTextBlock: {JSON.stringify({ text, html }, null, 2)}
    </div>
    <div dangerouslySetInnerHTML={{ __html: content }} />
  </>;
}

