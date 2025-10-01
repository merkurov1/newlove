// src/components/BlockRenderer.tsx
import React from 'react';
import TextBlock from './blocks/TextBlock';
import GalleryBlock from './blocks/GalleryBlock';
import CodeBlock from './blocks/CodeBlock';
import type { EditorJsBlock } from '@/types/blocks';

export default function BlockRenderer({ blocks }: { blocks: EditorJsBlock[] }) {
  if (!Array.isArray(blocks) || !blocks.length) {
    return (
      <div className="my-8 p-4 bg-yellow-50 text-yellow-800 rounded text-center font-medium border border-yellow-200">
        Контент отсутствует.
      </div>
    );
  }
  return (
    <>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'richText':
            return <TextBlock key={idx} block={block} />;
          case 'gallery':
          case 'image':
            return <GalleryBlock key={idx} block={block} />;
          case 'code':
            return <CodeBlock key={idx} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}
