// src/components/CodeBlock.tsx
"use client";

// Для подсветки синтаксиса можно будет добавить, например, 'react-syntax-highlighter'
export default function CodeBlock({ code, language }: { code: string, language?: string }) {
  if (!code) return null;

  return (
    <pre className="not-prose" style={{
      backgroundColor: '#2d2d2d', color: '#f8f8f2', padding: '1rem',
      borderRadius: '0.5rem', overflowX: 'auto', margin: '2rem 0'
    }}>
      <code>{code}</code>
    </pre>
  );
}
