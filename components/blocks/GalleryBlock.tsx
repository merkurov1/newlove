import React from 'react';

export default function GalleryBlock({ block }: { block: any }) {
  // Editor.js image tool returns { file: { url }, caption, ... }
  const url = block.data.file?.url || block.data.url;
  return (
    <div className="my-4">
      <img src={url} alt={block.data.caption || ''} className="rounded shadow" />
      {block.data.caption && <div className="text-sm text-gray-500">{block.data.caption}</div>}
    </div>
  );
}
