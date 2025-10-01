import React, { useState } from 'react';
import TiptapEditor from './TiptapEditor';
import GalleryBlockEditor from './GalleryBlockEditor';
export default function BlockEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(value || []);

  // Синхронизируем value -> blocks при изменении value (например, при редактировании)
  React.useEffect(() => {
    setBlocks(Array.isArray(value) ? value : []);
  }, [value]);

  const handleBlockChange = (idx, newBlock) => {
    // Для richText всегда используем поле html
    if (newBlock.type === 'richText' && newBlock.text !== undefined) {
      const { text, ...rest } = newBlock;
      newBlock = { ...rest, html: newBlock.text };
    }
    const updated = blocks.map((b, i) => (i === idx ? newBlock : b));
    setBlocks(updated);
    onChange(updated);
  };

  const addBlock = (type) => {
    let block;
    if (type === 'richText') block = { type: 'richText', html: '' };
  else if (type === 'gallery') block = { type: 'gallery', images: [] };
    const updated = [...blocks, block];
    setBlocks(updated);
    onChange(updated);
  };

  const removeBlock = (idx) => {
  const updated = blocks.filter((_, i) => i !== idx);
  setBlocks(updated);
  onChange(updated);
  };

  return (
    <div className="space-y-6">
      {blocks.map((block, idx) => (
        <div key={idx} className="border rounded p-4 bg-gray-50 mb-2">
          <div className="flex justify-between mb-2">
            <span className="font-bold">{block.type}</span>
            <button type="button" onClick={() => removeBlock(idx)} className="text-red-500">Удалить</button>
          </div>
          {block.type === 'richText' && (
            <TiptapEditor value={block.html} onChange={html => handleBlockChange(idx, { ...block, html })} />
          )}
          {block.type === 'gallery' && (
            <GalleryBlockEditor
              images={block.images}
              onChange={imgs => handleBlockChange(idx, { ...block, images: imgs })}
            />
          )}
          {/* codeBlock больше не поддерживается */}
        </div>
      ))}
      <div className="flex gap-2 mt-4">
  <button type="button" onClick={() => addBlock('richText')} className="bg-blue-600 text-white px-4 py-2 rounded">+ Текст</button>
  <button type="button" onClick={() => addBlock('gallery')} className="bg-green-600 text-white px-4 py-2 rounded">+ Галерея</button>
      </div>
    </div>
  );
}
