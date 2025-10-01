// src/components/BlockRenderer.tsx
import React from 'react';
import TextBlock from './blocks/TextBlock';
import GalleryBlock from './blocks/GalleryBlock';
import CodeBlock from './blocks/CodeBlock';
import type { EditorJsBlock } from '@/types/editorjs';

export default function BlockRenderer({ blocks }: { blocks: EditorJsBlock[] }) {
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
        switch (block.type) {
          case 'header':
          case 'paragraph':
          case 'list':
            return <TextBlock key={idx} block={block} />;
          case 'image':
            return <GalleryBlock key={idx} block={block} />;
          case 'code':
            return <CodeBlock key={idx} block={block} />;
          default:
            return <div key={idx} style={{ color: 'red', margin: '12px 0' }}>Неизвестный тип блока: {block.type}</div>;
        }
      })}
    </>
  );
}
