import React, { useState } from 'react';
import Image from 'next/image';
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
    else if (type === 'quote') block = { type: 'quote', data: { text: '', author: '', source: '' } };
    else if (type === 'video') block = { type: 'video', data: { url: '', caption: '', platform: 'youtube' } };
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

  const duplicateBlock = (idx) => {
    const blockToDuplicate = { ...blocks[idx] };
    const updated = [...blocks.slice(0, idx + 1), blockToDuplicate, ...blocks.slice(idx + 1)];
    setBlocks(updated);
    onChange(updated);
  };

  const moveBlock = (fromIdx, toIdx) => {
    const updated = [...blocks];
    const [movedBlock] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, movedBlock);
    setBlocks(updated);
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      {blocks.map((block, idx) => (
        <div key={idx} className="border rounded p-4 bg-gray-50 mb-2">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold capitalize">{block.type === 'richText' ? 'Текст' : block.type === 'quote' ? 'Цитата' : block.type === 'video' ? 'Видео' : block.type}</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => duplicateBlock(idx)} className="text-blue-500 text-sm hover:underline">Дублировать</button>
              {idx > 0 && <button type="button" onClick={() => moveBlock(idx, idx - 1)} className="text-gray-500 text-sm hover:underline">↑</button>}
              {idx < blocks.length - 1 && <button type="button" onClick={() => moveBlock(idx, idx + 1)} className="text-gray-500 text-sm hover:underline">↓</button>}
              <button type="button" onClick={() => removeBlock(idx)} className="text-red-500 text-sm hover:underline">Удалить</button>
            </div>
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
                <Image 
                  src={block.data.url} 
                  alt={block.data.caption || "Превью изображения"} 
                  width={200}
                  height={160}
                  className="max-h-40 mt-2 border rounded object-cover" 
                />
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
          {block.type === 'quote' && (
            <div>
              <label className="block text-sm font-medium mb-1">Текст цитаты</label>
              <textarea
                className="w-full border rounded p-2 mb-2"
                rows={3}
                value={block.data.text}
                onChange={e => handleBlockChange(idx, { type: 'quote', data: { ...block.data, text: e.target.value } })}
                placeholder="Введите текст цитаты..."
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Автор</label>
                  <input
                    type="text"
                    className="w-full border rounded p-2"
                    value={block.data.author || ''}
                    onChange={e => handleBlockChange(idx, { type: 'quote', data: { ...block.data, author: e.target.value } })}
                    placeholder="Автор цитаты"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Источник</label>
                  <input
                    type="text"
                    className="w-full border rounded p-2"
                    value={block.data.source || ''}
                    onChange={e => handleBlockChange(idx, { type: 'quote', data: { ...block.data, source: e.target.value } })}
                    placeholder="Книга, статья, etc."
                  />
                </div>
              </div>
            </div>
          )}
          {block.type === 'video' && (
            <div>
              <label className="block text-sm font-medium mb-1">URL видео</label>
              <input
                type="text"
                className="w-full border rounded p-2 mb-2"
                value={block.data.url}
                onChange={e => {
                  const url = e.target.value;
                  const platform = url.includes('youtube') || url.includes('youtu.be') ? 'youtube' : 
                                  url.includes('vimeo') ? 'vimeo' : 'other';
                  handleBlockChange(idx, { type: 'video', data: { ...block.data, url, platform } });
                }}
                placeholder="https://www.youtube.com/watch?v=... или https://vimeo.com/..."
              />
              <input
                type="text"
                className="w-full border rounded p-2 mb-2"
                value={block.data.caption || ''}
                onChange={e => handleBlockChange(idx, { type: 'video', data: { ...block.data, caption: e.target.value } })}
                placeholder="Подпись к видео (необязательно)"
              />
              {block.data.url && (
                <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-blue-700">
                  📹 Предпросмотр: {block.data.platform === 'youtube' ? 'YouTube' : block.data.platform === 'vimeo' ? 'Vimeo' : 'Видео'}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-2 mt-4">
        <button type="button" onClick={() => addBlock('richText')} className="bg-blue-600 text-white px-4 py-2 rounded text-sm">+ Текст</button>
        <button type="button" onClick={() => addBlock('gallery')} className="bg-green-600 text-white px-4 py-2 rounded text-sm">+ Галерея</button>
        <button type="button" onClick={() => addBlock('columns')} className="bg-purple-600 text-white px-4 py-2 rounded text-sm">+ Колонки</button>
        <button type="button" onClick={() => addBlock('quote')} className="bg-orange-600 text-white px-4 py-2 rounded text-sm">+ Цитата</button>
        <button type="button" onClick={() => addBlock('video')} className="bg-red-600 text-white px-4 py-2 rounded text-sm">+ Видео</button>
      </div>
    </div>
  );
}
