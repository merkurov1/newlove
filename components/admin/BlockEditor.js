import React, { useState } from 'react';
import TiptapEditor from './TiptapEditor';
import GalleryBlockEditor from './GalleryBlockEditor';
import { EditorJsBlock } from '@/types/blocks';
export default function BlockEditor({ value, onChange }) {
  const [blocks, setBlocks] = useState(Array.isArray(value) ? value : []);

  // Синхронизируем value -> blocks при изменении value (например, при редактировании)
  React.useEffect(() => {
    setBlocks(Array.isArray(value) ? value : []);
  }, [value]);

  const handleBlockChange = (idx, newBlock) => {
    // Always enforce EditorJsBlock shape
    if (!newBlock || typeof newBlock.type !== 'string' || typeof newBlock.data !== 'object') return;
    const updated = blocks.map((b, i) => (i === idx ? newBlock : b));
    setBlocks(updated);
    onChange(updated);
  };

  const addBlock = (type) => {
    let block;
    if (type === 'richText') block = { type: 'richText', data: { html: '' } };
    else if (type === 'gallery') block = { type: 'gallery', data: { images: [] } };
    else if (type === 'code') block = { type: 'code', data: { code: '' } };
    else if (type === 'image') block = { type: 'image', data: { url: '', caption: '' } };
    else if (type === 'columns') block = { 
      type: 'columns', 
      data: { 
        columns: [
          { html: '' },
          { html: '' }
        ]
      }
    };
    else return;
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
            <TiptapEditor value={block.data.html} onChange={html => handleBlockChange(idx, { type: 'richText', data: { html } })} />
          )}
          {block.type === 'gallery' && (
            <GalleryBlockEditor
              images={block.data.images}
              onChange={imgs => handleBlockChange(idx, { type: 'gallery', data: { images: imgs } })}
            />
          )}
          {block.type === 'code' && (
            <div>
              <label className="block text-sm font-medium mb-1">Код</label>
              <textarea
                className="w-full font-mono text-xs border rounded p-2"
                rows={6}
                value={block.data.code}
                onChange={e => handleBlockChange(idx, { type: 'code', data: { code: e.target.value } })}
              />
            </div>
          )}
          {block.type === 'image' && (
            <div>
              <label className="block text-sm font-medium mb-1">Изображение (URL)</label>
              <input
                type="text"
                className="w-full border rounded p-2 mb-2"
                value={block.data.url}
                onChange={e => handleBlockChange(idx, { type: 'image', data: { ...block.data, url: e.target.value } })}
                placeholder="URL изображения"
              />
              <input
                type="text"
                className="w-full border rounded p-2"
                value={block.data.caption}
                onChange={e => handleBlockChange(idx, { type: 'image', data: { ...block.data, caption: e.target.value } })}
                placeholder="Подпись (необязательно)"
              />
              {block.data.url && (
                <img src={block.data.url} alt="preview" className="max-h-40 mt-2 border rounded" />
              )}
            </div>
          )}
          {block.type === 'columns' && (
            <div>
              <label className="block text-sm font-medium mb-2">Колонки</label>
              <div className="grid grid-cols-2 gap-4">
                {block.data.columns.map((column, colIdx) => (
                  <div key={colIdx} className="border rounded p-2">
                    <label className="block text-xs text-gray-600 mb-1">Колонка {colIdx + 1}</label>
                    <TiptapEditor 
                      value={column.html} 
                      onChange={html => {
                        const newColumns = [...block.data.columns];
                        newColumns[colIdx] = { html };
                        handleBlockChange(idx, { type: 'columns', data: { columns: newColumns } });
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <button 
                  type="button" 
                  onClick={() => {
                    if (block.data.columns.length < 3) {
                      const newColumns = [...block.data.columns, { html: '' }];
                      handleBlockChange(idx, { type: 'columns', data: { columns: newColumns } });
                    }
                  }}
                  className="text-sm bg-gray-200 px-2 py-1 rounded"
                  disabled={block.data.columns.length >= 3}
                >
                  + Колонка
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    if (block.data.columns.length > 1) {
                      const newColumns = block.data.columns.slice(0, -1);
                      handleBlockChange(idx, { type: 'columns', data: { columns: newColumns } });
                    }
                  }}
                  className="text-sm bg-gray-200 px-2 py-1 rounded"
                  disabled={block.data.columns.length <= 1}
                >
                  - Колонка
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => addBlock('richText')} className="bg-blue-600 text-white px-4 py-2 rounded">+ Текст</button>
        <button type="button" onClick={() => addBlock('gallery')} className="bg-green-600 text-white px-4 py-2 rounded">+ Галерея</button>
        <button type="button" onClick={() => addBlock('columns')} className="bg-purple-600 text-white px-4 py-2 rounded">+ Колонки</button>
      </div>
    </div>
  );
}
