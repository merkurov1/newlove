// src/components/RichTextBlock.tsx
import React from 'react';

export default function RichTextBlock({ text }: { text: string }) {
  // `text` - это поле из вашего блока в Supabase
  if (!text) return null;

  return (
    <div dangerouslySetInnerHTML={{ __html: text }} />
  );
}
