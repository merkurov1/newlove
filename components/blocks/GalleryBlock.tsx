import React from 'react';

export default function GalleryBlock({ block }: { block: any }) {
  // Если это Editor.js image block
  if (block.type === 'image') {
    const url = block.data.file?.url || block.data.url;
    return (
      <div className="my-4">
        <img src={url} alt={block.data.caption || ''} className="rounded shadow" />
        {block.data.caption && <div className="text-sm text-gray-500">{block.data.caption}</div>}
      </div>
    );
  }
  // Если это кастомный gallery block с images: [{url, alt}]
  if (block.type === 'gallery' && Array.isArray(block.images)) {
    return (
      <div className="my-4 grid grid-cols-2 md:grid-cols-3 gap-4">
        {block.images.map((img: any, i: number) => (
          <div key={i} className="relative w-full aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
            <img src={img.url} alt={img.alt || ''} className="object-cover w-full h-full" />
            {img.alt && <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs px-2 py-1">{img.alt}</div>}
          </div>
        ))}
      </div>
    );
  }
  return <div className="text-red-500">Ошибка: некорректный блок галереи</div>;
}
