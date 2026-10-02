"use client";

import React, { useState, useCallback, useEffect } from 'react';
import Image from 'next/image';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import TiptapEditor from './TiptapEditor';
import GalleryBlockEditor from './GalleryBlockEditor';
import { EditorJsBlock } from '@/types/blocks';

const BLOCK_TYPES = {
  richText: { label: 'Текст', icon: '📝', desc: 'Абзац или статья' },
  gallery: { label: 'Галерея', icon: '🖼️', desc: 'Сетка изображений' },
  columns: { label: 'Колонки', icon: '📰', desc: 'Мультиколонки' },
  quote: { label: 'Цитата', icon: '💬', desc: 'Высказывание со ссылкой' },
  video: { label: 'Видео', icon: '📹', desc: 'YouTube / Vimeo' },
  code: { label: 'Код', icon: '💻', desc: 'Блок кода' },
  image: { label: 'Изображение', icon: '🎨', desc: 'Картинка с подписью' },
};

interface SortableBlockProps {
  key?: string | number;
  block: EditorJsBlock;
  index: number;
  isCollapsed: boolean;
  onToggleCollapse: (idx: number) => void;
  onBlockChange: (idx: number, block: EditorJsBlock) => void;
  onDuplicate: (idx: number) => void;
  onRemove: (idx: number) => void;
}

function SortableBlock({
  block,
  index,
  isCollapsed,
  onToggleCollapse,
  onBlockChange,
  onDuplicate,
  onRemove,
}: SortableBlockProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `block-${index}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const blockType = BLOCK_TYPES[block.type as keyof typeof BLOCK_TYPES] || { label: block.type, icon: '📄' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-neutral-200 rounded-2xl bg-white shadow-xs hover:shadow-md transition-all mb-4 overflow-hidden group"
    >
      <div className="flex items-center justify-between px-4 py-3 bg-neutral-50/70 border-b border-neutral-100 rounded-t-2xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-neutral-200/60 rounded text-neutral-400 hover:text-neutral-700 transition-colors"
            title="Перетащить блок"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          
          <span className="text-base">{blockType.icon}</span>
          <span className="font-medium text-neutral-800 text-sm">{blockType.label}</span>
          <span className="text-xs text-neutral-400 font-mono">#{index + 1}</span>
        </div>

        <div className="flex items-center gap-1 opacity-90 sm:opacity-40 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={() => onToggleCollapse(index)}
            className="p-1.5 hover:bg-neutral-200/60 rounded text-neutral-600 transition-colors"
            title={isCollapsed ? 'Развернуть' : 'Свернуть'}
          >
            {isCollapsed ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
          
          <button
            type="button"
            onClick={() => onDuplicate(index)}
            className="p-1.5 hover:bg-neutral-200/60 rounded text-neutral-600 transition-colors"
            title="Дублировать"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="p-1.5 hover:bg-rose-50 rounded text-neutral-400 hover:text-rose-600 transition-colors"
            title="Удалить"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4 bg-white">
          <BlockContent block={block} index={index} onBlockChange={onBlockChange} />
        </div>
      )}
    </div>
  );
}

interface BlockContentProps {
  block: EditorJsBlock;
  index: number;
  onBlockChange: (idx: number, block: EditorJsBlock) => void;
}

function BlockContent({ block, index, onBlockChange }: BlockContentProps) {
  const handleChange = (newData: any) => {
    onBlockChange(index, { ...block, data: newData });
  };

  switch (block.type) {
    case 'richText':
      return (
        <TiptapEditor
          value={block.data.html}
          onChange={(html: string) => handleChange({ html })}
        />
      );

    case 'gallery':
      return (
        <GalleryBlockEditor
          images={block.data.images}
          onChange={(imgs: any) => handleChange({ images: imgs })}
        />
      );

    case 'code':
      return (
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-2">Исходный код</label>
          <textarea
            className="w-full font-mono text-sm border border-neutral-200 rounded-xl p-3 bg-neutral-50/50 focus:bg-white focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
            rows={6}
            value={block.data.code}
            onChange={(e: any) => handleChange({ code: e.target.value })}
            placeholder="// Введите код..."
          />
        </div>
      );

    case 'image':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">URL изображения</label>
            <input
              type="text"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
              value={block.data.url}
              onChange={(e: any) => handleChange({ ...block.data, url: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">Подпись</label>
            <input
              type="text"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
              value={block.data.caption || ''}
              onChange={(e: any) => handleChange({ ...block.data, caption: e.target.value })}
              placeholder="Описание под изображением..."
            />
          </div>
          {block.data.url && (
            <div className="mt-3 relative w-full h-48 rounded-xl overflow-hidden border border-neutral-200 bg-neutral-100">
              <Image
                src={block.data.url}
                alt={block.data.caption || 'Preview'}
                fill
                className="object-cover"
              />
            </div>
          )}
        </div>
      );

    case 'columns':
      return (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400">
              Колонки ({block.data.columns.length})
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (block.data.columns.length < 3) {
                    handleChange({ columns: [...block.data.columns, { html: '' }] });
                  }
                }}
                disabled={block.data.columns.length >= 3}
                className="text-xs px-2.5 py-1 bg-neutral-900 text-white rounded-lg hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              >
                + Колонка
              </button>
              <button
                type="button"
                onClick={() => {
                  if (block.data.columns.length > 1) {
                    handleChange({ columns: block.data.columns.slice(0, -1) });
                  }
                }}
                disabled={block.data.columns.length <= 1}
                className="text-xs px-2.5 py-1 border border-neutral-200 text-neutral-700 rounded-lg hover:bg-neutral-50 disabled:opacity-40 transition-colors"
              >
                − Колонка
              </button>
            </div>
          </div>
          <div className={`grid gap-4 ${block.data.columns.length === 2 ? 'grid-cols-2' : block.data.columns.length === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {block.data.columns.map((column: any, colIdx: number) => (
              <div key={colIdx} className="border border-neutral-200 rounded-xl p-3 bg-neutral-50/40">
                <span className="block text-[11px] font-mono text-neutral-400 mb-1.5">Колонка {colIdx + 1}</span>
                <TiptapEditor
                  value={column.html}
                  onChange={(html: string) => {
                    const newColumns = [...block.data.columns];
                    newColumns[colIdx] = { html };
                    handleChange({ columns: newColumns });
                  }}
                  minHeight="100px"
                />
              </div>
            ))}
          </div>
        </div>
      );

    case 'quote':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">Текст цитаты</label>
            <textarea
              className="w-full border border-neutral-200 rounded-xl p-3 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
              rows={3}
              value={block.data.text}
              onChange={(e: any) => handleChange({ ...block.data, text: e.target.value })}
              placeholder="Введите цитату..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">Автор</label>
              <input
                type="text"
                className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
                value={block.data.author || ''}
                onChange={(e: any) => handleChange({ ...block.data, author: e.target.value })}
                placeholder="Имя автора"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">Источник</label>
              <input
                type="text"
                className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
                value={block.data.source || ''}
                onChange={(e: any) => handleChange({ ...block.data, source: e.target.value })}
                placeholder="Книга / Издание"
              />
            </div>
          </div>
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">URL видео</label>
            <input
              type="text"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
              value={block.data.url}
              onChange={(e: any) => {
                const url = e.target.value;
                const platform = url.includes('youtube') || url.includes('youtu.be') ? 'youtube' : 'vimeo';
                handleChange({ ...block.data, url, platform });
              }}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-neutral-400 mb-1.5">Подпись</label>
            <input
              type="text"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2 text-sm focus:ring-1 focus:ring-neutral-400 focus:border-neutral-400 transition-all text-neutral-900"
              value={block.data.caption || ''}
              onChange={(e: any) => handleChange({ ...block.data, caption: e.target.value })}
              placeholder="Подпись к видео..."
            />
          </div>
        </div>
      );

    default:
      return <div className="text-neutral-400 text-sm">Неизвестный блок</div>;
  }
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAddBlock: (type: string) => void;
}

function CommandPalette({ isOpen, onClose, onAddBlock }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredTypes = Object.entries(BLOCK_TYPES).filter(([_, config]) =>
    config.label.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredTypes.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredTypes.length) % filteredTypes.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredTypes[selectedIndex]) {
          onAddBlock(filteredTypes[selectedIndex][0]);
          onClose();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredTypes, onAddBlock, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-neutral-950/20 backdrop-blur-xs flex items-start justify-center pt-24 z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-neutral-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e: any) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-neutral-100">
          <input
            type="text"
            className="w-full px-3 py-2 text-sm bg-neutral-50 rounded-xl border border-neutral-200 focus:outline-none focus:bg-white focus:ring-1 focus:ring-neutral-400"
            placeholder="Поиск блока..."
            value={search}
            onChange={(e: any) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredTypes.length > 0 ? (
            filteredTypes.map(([key, config], idx) => (
              <button
                key={key}
                type="button"
                className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                  idx === selectedIndex ? 'bg-neutral-100 text-neutral-900' : 'hover:bg-neutral-50 text-neutral-700'
                }`}
                onClick={() => {
                  onAddBlock(key);
                  onClose();
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{config.icon}</span>
                  <div>
                    <div className="font-medium text-sm text-neutral-900">{config.label}</div>
                    <div className="text-xs text-neutral-400">{config.desc}</div>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 px-2 py-1 rounded-md">↵</span>
              </button>
            ))
          ) : (
            <div className="py-8 text-center text-sm text-neutral-400">Ничего не найдено</div>
          )}
        </div>
      </div>
    </div>
  );
}

interface BlockEditorImprovedProps {
  value: EditorJsBlock[];
  onChange: (blocks: EditorJsBlock[]) => void;
}

export default function BlockEditorImproved({ value, onChange }: BlockEditorImprovedProps) {
  const [blocks, setBlocks] = useState<EditorJsBlock[]>(Array.isArray(value) ? value : []);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<number>>(new Set());
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setBlocks(Array.isArray(value) ? value : []);
  }, [value]);

  const updateBlocks = useCallback(
    (newBlocks: EditorJsBlock[]) => {
      setBlocks(newBlocks);
      onChange(newBlocks);
    },
    [onChange]
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace('block-', ''));
      const newIndex = parseInt(String(over.id).replace('block-', ''));
      updateBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = (type: string) => {
    let block: EditorJsBlock;
    switch (type) {
      case 'richText':
        block = { type: 'richText', data: { html: '' } };
        break;
      case 'gallery':
        block = { type: 'gallery', data: { images: [] } };
        break;
      case 'code':
        block = { type: 'code', data: { code: '' } };
        break;
      case 'image':
        block = { type: 'image', data: { url: '', caption: '' } };
        break;
      case 'columns':
        block = { type: 'columns', data: { columns: [{ html: '' }, { html: '' }] } };
        break;
      case 'quote':
        block = { type: 'quote', data: { text: '', author: '', source: '' } };
        break;
      case 'video':
        block = { type: 'video', data: { url: '', caption: '', platform: 'youtube' } };
        break;
      default:
        return;
    }
    updateBlocks([...blocks, block]);
  };

  const handleBlockChange = (idx: number, newBlock: EditorJsBlock) => {
    updateBlocks(blocks.map((b, i) => (i === idx ? newBlock : b)));
  };

  const duplicateBlock = (idx: number) => {
    const blockToDuplicate = JSON.parse(JSON.stringify(blocks[idx]));
    updateBlocks([...blocks.slice(0, idx + 1), blockToDuplicate, ...blocks.slice(idx + 1)]);
  };

  const removeBlock = (idx: number) => {
    updateBlocks(blocks.filter((_, i) => i !== idx));
  };

  const toggleCollapse = (idx: number) => {
    setCollapsedBlocks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) newSet.delete(idx);
      else newSet.add(idx);
      return newSet;
    });
  };

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const sortableItems: UniqueIdentifier[] = blocks.map((_, idx) => `block-${idx}`);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-neutral-200">
        <div>
          <h3 className="text-sm font-semibold text-neutral-900 tracking-wide uppercase">Структура контента</h3>
          <p className="text-xs text-neutral-400 mt-0.5">
            {blocks.length} {blocks.length === 1 ? 'блок' : blocks.length < 5 ? 'блока' : 'блоков'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPaletteOpen(true)}
          className="px-3.5 py-1.5 bg-neutral-900 text-white rounded-xl hover:bg-neutral-800 transition-colors flex items-center gap-2 text-xs font-medium shadow-xs"
        >
          <span>Добавить блок</span>
          <kbd className="bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded text-[10px] font-mono">⌘K</kbd>
        </button>
      </div>

      {blocks.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext 
            items={sortableItems} 
            strategy={verticalListSortingStrategy}
            children={blocks.map((block, idx) => (
              <SortableBlock
                key={`block-${idx}`}
                block={block}
                index={idx}
                isCollapsed={collapsedBlocks.has(idx)}
                onToggleCollapse={toggleCollapse}
                onBlockChange={handleBlockChange}
                onDuplicate={duplicateBlock}
                onRemove={removeBlock}
              />
            ))}
          />
        </DndContext>
      ) : (
        <div className="text-center py-12 px-4 border border-dashed border-neutral-300 rounded-2xl bg-neutral-50/50">
          <p className="text-neutral-600 font-medium text-sm mb-1">Контент пуст</p>
          <p className="text-neutral-400 text-xs mb-4">Нажмите кнопку ниже или используйте ⌘K</p>
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="px-4 py-2 bg-neutral-900 text-white text-xs font-medium rounded-xl hover:bg-neutral-800 transition-colors"
          >
            Добавить первый блок
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 p-3 bg-neutral-50/70 rounded-2xl border border-neutral-200">
        <span className="text-xs text-neutral-400 font-mono self-center mr-2">Добавить:</span>
        {Object.entries(BLOCK_TYPES).map(([key, config]) => (
          <button
            key={key}
            type="button"
            onClick={() => addBlock(key)}
            className="px-2.5 py-1.5 bg-white border border-neutral-200 rounded-xl hover:border-neutral-300 hover:bg-neutral-100/60 transition-all text-xs font-medium text-neutral-700 flex items-center gap-1.5 shadow-2xs"
          >
            <span>{config.icon}</span>
            <span>{config.label}</span>
          </button>
        ))}
      </div>

      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onAddBlock={addBlock} />
    </div>
  );
}
