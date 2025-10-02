import React from 'react';
import Image from 'next/image';
import type { EditorJsBlock, GalleryImage } from '@/types/blocks';

export default function GalleryBlock({ block }: { block: EditorJsBlock }) {
  if (block.type === 'image') {
    const { url, caption } = block.data;
    if (!url) return null;
    
    return (
      <div className="my-4">
        <Image 
          src={url} 
          alt={caption || 'Изображение'} 
          width={600}
          height={400}
          className="rounded shadow w-full h-auto object-cover" 
        />
        {caption && <div className="text-sm text-gray-500">{caption}</div>}
      </div>
    );
  }
  if (block.type === 'gallery' && Array.isArray(block.data.images)) {
    return (
      <div className="my-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {block.data.images.map((img: GalleryImage, i: number) => (
          <div key={i} className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
            <Image 
              src={img.url} 
              alt={img.alt || `Изображение галереи ${i + 1}`} 
              fill
              className="object-cover" 
              sizes="(max-width: 768px) 50vw, 33vw"
            />
            {img.alt && <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1">{img.alt}</div>}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="my-8 p-4 bg-red-50 text-red-700 rounded text-center font-medium border border-red-200">
      Ошибка: некорректный блок галереи
    </div>
  );
}
