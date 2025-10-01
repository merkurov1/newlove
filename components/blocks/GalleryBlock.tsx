import React from 'react';
import type { EditorJsBlock, GalleryImage } from '@/types/blocks';

export default function GalleryBlock({ block }: { block: EditorJsBlock }) {
  if (block.type === 'image') {
    const { url, caption } = block.data;
    return (
      <div className="my-4">
        <img src={url} alt={caption || ''} className="rounded shadow" />
        {caption && <div className="text-sm text-gray-500">{caption}</div>}
      </div>
    );
  }
  if (block.type === 'gallery' && Array.isArray(block.data.images)) {
    return (
      <div className="my-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {block.data.images.map((img: GalleryImage, i: number) => (
          <div key={i} className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
            <img src={img.url} alt={img.alt || ''} className="object-cover w-full h-full" />
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
