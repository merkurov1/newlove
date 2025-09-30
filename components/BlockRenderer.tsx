import React from 'react';
import RichTextBlock from './RichTextBlock';
import GalleryGrid from './GalleryGrid';
import CodeBlock from './CodeBlock';

export default function BlockRenderer({ blocks }: { blocks: any[] }) {
  if (!Array.isArray(blocks)) return null;
  return (
    <>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'richText':
            return <RichTextBlock key={idx} html={block.html} />;
          case 'gallery':
            return <GalleryGrid key={idx} images={block.images} />;
          case 'codeBlock':
            return <CodeBlock key={idx} language={block.language} code={block.code} />;
          default:
            return null;
        }
      })}
    </>
  );
}
