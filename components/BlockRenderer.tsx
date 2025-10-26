// src/components/BlockRenderer.tsx
import React from 'react';
import SafeImage from '@/components/SafeImage';
import TextBlock from './blocks/TextBlock';
import GalleryGrid from './GalleryGrid';
import CodeBlock from './blocks/CodeBlock';
import type { EditorJsBlock } from '@/types/blocks';
import serializeForClient from '@/lib/serializeForClient';

export default function BlockRenderer({ blocks }: { blocks: EditorJsBlock[] }) {
  // Use centralized serializer to ensure plain JSON-serializable objects
  // are produced for passing into Client Components.
  const safeBlocks: EditorJsBlock[] = serializeForClient(blocks || []) || [];

  if (!Array.isArray(safeBlocks) || !safeBlocks.length) {
    return (
      <div className="my-8 p-4 bg-gray-50 text-gray-600 rounded text-center font-medium border border-gray-200">
        Контент отсутствует.
      </div>
    );
  }

  return (
    <>
      {safeBlocks.map((block, idx) => {
        switch (block.type) {
          case 'paragraph':
            return (
              <div key={idx} className="mb-4">
                <p className="text-gray-800 leading-relaxed" dangerouslySetInnerHTML={{ __html: block.data.text || '' }} />
              </div>
            );
          case 'header':
            const levelNum = Number(block.data.level) || 2;
            const HeaderTag = `h${levelNum}` as keyof JSX.IntrinsicElements;
            const sizeMap: Record<number, string> = {
              1: 'text-xl sm:text-2xl lg:text-3xl',
              2: 'text-lg sm:text-xl lg:text-2xl',
              3: 'text-base sm:text-lg lg:text-xl',
              4: 'text-sm sm:text-base lg:text-lg',
              5: 'text-sm sm:text-base',
              6: 'text-xs sm:text-sm'
            };
            const sizeClasses = sizeMap[levelNum] || 'text-lg sm:text-xl lg:text-2xl';

            return (
              <div key={idx} className="mb-6">
                {React.createElement(HeaderTag as any, { className: `font-bold text-gray-900 leading-tight ${sizeClasses}`, dangerouslySetInnerHTML: { __html: block.data.text || '' } })}
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
            // Coerce any url-like values to plain strings to avoid passing
            // non-plain objects (URL instances, File objects) into client props.
            const imageUrl = String(block.data.file?.url || block.data.url || '');
            if (!imageUrl) return null;

            return (
              <div key={idx} className="my-6">
                <div className="relative max-w-3xl mx-auto">
                  <SafeImage
                    src={imageUrl}
                    alt={String(block.data.caption || 'Изображение статьи')}
                    width={800}
                    height={600}
                    className="rounded shadow w-full h-auto object-cover"
                    priority={idx === 0}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
                {block.data.caption && (
                  <p className="text-sm text-gray-500 mt-2 text-center">{String(block.data.caption)}</p>
                )}
              </div>
            );
          // Поддержка кастомного richText блока
          case 'richText':
            return (
              <div key={idx} className="mb-4 prose prose-lg max-w-none">
                <div dangerouslySetInnerHTML={{ __html: block.data.html || '' }} />
              </div>
            );
          case 'link':
            // Support Editor.js LinkTool block
            const href = String(block.data?.link || '');
            const label = (block.data?.meta && (block.data.meta.title || block.data.meta.url)) || href;
            return (
              <div key={idx} className="mb-4">
                <p className="text-gray-800 leading-relaxed"><a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600">{label}</a></p>
              </div>
            );
          // Поддержка колоночной верстки
          case 'columns':
            return (
              <div key={idx} className={`mb-6 grid gap-6 ${block.data.columns?.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
                block.data.columns?.length === 3 ? 'grid-cols-1 md:grid-cols-3' :
                  'grid-cols-1'
                }`}>
                {block.data.columns?.map((column: any, colIdx: number) => (
                  <div key={colIdx} className="prose prose-lg max-w-none">
                    <div dangerouslySetInnerHTML={{ __html: column.html || '' }} />
                  </div>
                ))}
              </div>
            );
          // Поддержка цитат
          case 'quote':
            return (
              <div key={idx} className="my-8">
                <blockquote className="border-l-4 border-gray-300 pl-6 py-4 bg-gray-50 rounded-r-lg">
                  <p className="text-lg italic text-gray-800 leading-relaxed mb-4">
                    &ldquo;{block.data.text}&rdquo;
                  </p>
                  {(block.data.author || block.data.source) && (
                    <footer className="text-sm text-gray-600">
                      {block.data.author && <span className="font-medium">— {block.data.author}</span>}
                      {block.data.source && <span>, {block.data.source}</span>}
                    </footer>
                  )}
                </blockquote>
              </div>
            );
          // Поддержка видео
          case 'video':
            const getEmbedUrl = (url: string) => {
              if (url.includes('youtube.com/watch?v=')) {
                const videoId = url.split('v=')[1]?.split('&')[0];
                return `https://www.youtube.com/embed/${videoId}`;
              }
              if (url.includes('youtu.be/')) {
                const videoId = url.split('youtu.be/')[1]?.split('?')[0];
                return `https://www.youtube.com/embed/${videoId}`;
              }
              if (url.includes('vimeo.com/')) {
                const videoId = url.split('vimeo.com/')[1]?.split('?')[0];
                return `https://player.vimeo.com/video/${videoId}`;
              }
              return url;
            };

            return (
              <div key={idx} className="my-6">
                <div className="relative aspect-video rounded-lg overflow-hidden bg-black">
                  <iframe
                    src={getEmbedUrl(block.data.url)}
                    className="absolute inset-0 w-full h-full"
                    frameBorder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                {block.data.caption && (
                  <p className="text-sm text-gray-500 mt-2 text-center">{block.data.caption}</p>
                )}
              </div>
            );
          // Обратная совместимость с другими кастомными типами
          case 'gallery':
            if (block.type === 'gallery' && Array.isArray(block.data.images)) {
              // Pass images as a JSON string to the client component so the
              // client receives only primitive values from the server.
              const imagesJson = JSON.stringify(block.data.images || []);
              // @ts-ignore - imagesJson prop is supported by GalleryGrid
              return <GalleryGrid key={idx} imagesJson={imagesJson} />;
            }
            return null;
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
    </>
  );
}
