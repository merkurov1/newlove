import React, { useState } from 'react';
import TiptapEditor from './TiptapEditor';
import GalleryBlockEditor from './GalleryBlockEditor';

export default function BlockEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(value || []);

  const handleBlockChange = (idx, newBlock) => {
    const updated = blocks.map((b, i) => (i === idx ? newBlock : b));
    setBlocks(updated);
    onChange(updated);
  };

  const addBlock = (type) => {
    let block;
    if (type === 'richText') block = { type: 'richText', html: '' };
    else if (type === 'gallery') block = { type: 'gallery', images: [] };
    else if (type === 'codeBlock') block = { type: 'codeBlock', language: 'js', code: '' };
    setBlocks([...blocks, block]);
    onChange([...blocks, block]);
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
          {block.type === 'codeBlock' && (
            <div>
              <select value={block.language} onChange={e => handleBlockChange(idx, { ...block, language: e.target.value })}>
                <option value="js">JavaScript</option>
                <option value="ts">TypeScript</option>
                <option value="python">Python</option>
                <option value="html">HTML</option>
              </select>
              <textarea
                className="w-full mt-2 font-mono border rounded"
                rows={6}
                value={block.code}
                onChange={e => handleBlockChange(idx, { ...block, code: e.target.value })}
              />
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => addBlock('richText')} className="bg-blue-600 text-white px-4 py-2 rounded">+ Текст</button>
        <button type="button" onClick={() => addBlock('gallery')} className="bg-green-600 text-white px-4 py-2 rounded">+ Галерея</button>
        <button type="button" onClick={() => addBlock('codeBlock')} className="bg-gray-600 text-white px-4 py-2 rounded">+ Код</button>
      </div>
    </div>
  );
}
