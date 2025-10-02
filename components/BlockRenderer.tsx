// src/components/BlockRenderer.tsx
import React from 'react';
import TextBlock from './blocks/TextBlock';
import GalleryBlock from './blocks/GalleryBlock';
import CodeBlock from './blocks/CodeBlock';
import type { EditorJsBlock } from '@/types/blocks';

export default function BlockRenderer({ blocks }: { blocks: EditorJsBlock[] }) {
  // Отладочная информация
  console.log('BlockRenderer получил блоки:', blocks);
  
  if (!Array.isArray(blocks) || !blocks.length) {
    return (
      <div className="my-8 p-4 bg-yellow-50 text-yellow-800 rounded text-center font-medium border border-yellow-200">
        <div>Контент отсутствует.</div>
        <div className="text-xs mt-2">Блоки: {JSON.stringify(blocks)}</div>
      </div>
    );
  }
  
  return (
    <div>
      {/* ВРЕМЕННАЯ ОТЛАДОЧНАЯ ИНФОРМАЦИЯ */}
      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-sm">
        <strong className="text-green-800">BlockRenderer:</strong> Обрабатываю {blocks.length} блоков
        <details className="mt-2">
          <summary className="cursor-pointer text-green-600">Показать все блоки</summary>
          <pre className="mt-2 bg-white p-2 rounded text-xs overflow-auto max-h-32">
            {JSON.stringify(blocks, null, 2)}
          </pre>
        </details>
      </div>
      
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <div key={idx} className="mb-4">
                <p className="text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: block.data.text || '' }} />
              </div>
            );
          case 'header':
            const HeaderTag = `h${block.data.level || 2}` as keyof JSX.IntrinsicElements;
            return (
              <div key={idx} className="mb-6">
                <HeaderTag className="font-bold text-gray-900 leading-tight" dangerouslySetInnerHTML={{ __html: block.data.text || '' }} />
              </div>
            );
          case 'list':
            const ListTag = block.data.style === 'ordered' ? 'ol' : 'ul';
            return (
              <div key={idx} className="mb-4">
                <ListTag className={block.data.style === 'ordered' ? 'list-decimal list-inside' : 'list-disc list-inside'}>
                  {block.data.items?.map((item: string, itemIdx: number) => (
                    <li key={itemIdx} className="mb-1" dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </ListTag>
              </div>
            );
          case 'code':
            return <CodeBlock key={idx} block={block} />;
          case 'image':
            return (
              <div key={idx} className="my-6">
                <img src={block.data.file?.url || block.data.url} alt={block.data.caption || ''} className="rounded shadow max-w-full h-auto" />
                {block.data.caption && (
                  <p className="text-sm text-gray-500 mt-2 text-center">{block.data.caption}</p>
                )}
              </div>
            );
          // Обратная совместимость с кастомными типами
          case 'richText':
            return <TextBlock key={idx} block={block} />;
          case 'gallery':
            return <GalleryBlock key={idx} block={block} />;
          default:
            console.warn('Unknown block type:', (block as any).type);
            return (
              <div key={idx} className="my-4 p-3 bg-gray-100 border-l-4 border-gray-400 text-gray-600">
                <strong>Неизвестный тип блока:</strong> {(block as any).type}
                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(block, null, 2)}</pre>
              </div>
            );
        }
      })}
    </div>
  );
}
