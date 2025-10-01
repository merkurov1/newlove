// src/components/BlockRenderer.tsx
import React from 'react';
import { Block } from '@/types/blocks';
import RichTextBlock from './RichTextBlock';
import GalleryGrid from './GalleryGrid';
import CodeBlock from './CodeBlock';

export default function BlockRenderer({ blocks }: { blocks: Block[] }) {
  if (!Array.isArray(blocks)) {
    return <div style={{ color: 'red' }}>Ошибка: Блоки не являются массивом!</div>;
  }
  if (blocks.length === 0) {
    return <div style={{ color: 'orange' }}>Контент для этой страницы пуст.</div>;
  }

  return (
    <>
      {blocks.map((block, idx) => {
        if (!block || typeof block !== 'object' || !('type' in block)) {
          return <div key={idx} style={{ color: 'red', margin: '12px 0' }}>Ошибка: некорректный блок данных</div>;
        }
        if (block.type === 'richText') {
          return <RichTextBlock key={idx} html={block.html} />;
        }
        if (block.type === 'gallery') {
          return <GalleryGrid key={idx} images={block.images} />;
        }
        if (block.type === 'codeBlock') {
          return <CodeBlock key={idx} code={block.code} language={block.language} />;
        }
        // fallback для неизвестного типа
        return <div key={idx} style={{ color: 'red', margin: '12px 0' }}>Неизвестный тип блока</div>;
      })}
    </>
  );
}
