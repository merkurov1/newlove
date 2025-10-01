// src/components/BlockRenderer.tsx
import React from 'react';
import RichTextBlock from './RichTextBlock';
import GalleryGrid from './GalleryGrid';
import CodeBlock from './CodeBlock';

export default function BlockRenderer({ blocks }: { blocks: any[] }) {
  if (!Array.isArray(blocks)) {
    return <div style={{ color: 'red' }}>Ошибка: Блоки не являются массивом!</div>;
  }
  if (blocks.length === 0) {
    return <div style={{ color: 'orange' }}>Контент для этой страницы пуст.</div>;
  }

  return (
    <>
      {blocks.map((block, idx) => {
        if (!block || typeof block !== 'object' || !block.type) {
          return <div key={idx} style={{ color: 'red', margin: '12px 0' }}>Ошибка: некорректный блок данных</div>;
        }
        switch (block.type) {
          case 'richText':
            return <RichTextBlock key={idx} text={block.text} html={block.html} />;
          case 'gallery':
            return <GalleryGrid key={idx} images={block.images} />;
          case 'codeBlock':
            return <CodeBlock key={idx} code={block.code} language={block.language} />;
          default:
            return <div key={idx} style={{ color: 'red', margin: '12px 0' }}>Неизвестный тип блока: {block.type}</div>;
        }
      })}
    </>
  );
}
