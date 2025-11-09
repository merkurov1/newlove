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

// Типы блоков
const BLOCK_TYPES = {
  richText: { label: 'Текст', icon: '📝', color: 'blue' },
  gallery: { label: 'Галерея', icon: '🖼️', color: 'green' },
  columns: { label: 'Колонки', icon: '📰', color: 'purple' },
  quote: { label: 'Цитата', icon: '💬', color: 'orange' },
  video: { label: 'Видео', icon: '📹', color: 'red' },
  code: { label: 'Код', icon: '💻', color: 'gray' },
  image: { label: 'Изображение', icon: '🎨', color: 'pink' },
};

// Компонент для отдельного блока с drag-and-drop
function SortableBlock({
  block,
  index,
  isCollapsed,
  onToggleCollapse,
  onBlockChange,
  onDuplicate,
  onRemove,
}: any) {
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
    opacity: isDragging ? 0.5 : 1,
  };

  const blockType = BLOCK_TYPES[block.type as keyof typeof BLOCK_TYPES] || { label: block.type, icon: '📄', color: 'gray' };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border-2 border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow mb-4"
    >
      {/* Заголовок блока с drag handle */}
      <div className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200 rounded-t-lg">
        <div className="flex items-center gap-3">
          {/* Drag handle */}
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-move p-1 hover:bg-gray-200 rounded text-gray-500"
            title="Перетащить блок"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
          
          {/* Иконка и название типа блока */}
          <span className="text-lg">{blockType.icon}</span>
          <span className="font-semibold text-gray-700">{blockType.label}</span>
          <span className="text-xs text-gray-400">#{index + 1}</span>
        </div>

        {/* Кнопки управления */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleCollapse(index)}
            className="p-1.5 hover:bg-gray-200 rounded text-gray-600"
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
            className="p-1.5 hover:bg-blue-100 rounded text-blue-600 text-xs font-medium"
            title="Дублировать (Cmd+D)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="p-1.5 hover:bg-red-100 rounded text-red-600"
            title="Удалить (Cmd+Delete)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Содержимое блока (сворачиваемое) */}
      {!isCollapsed && (
        <div className="p-4">
          <BlockContent block={block} index={index} onBlockChange={onBlockChange} />
        </div>
      )}
    </div>
  );
}

// Компонент для рендеринга содержимого блока
function BlockContent({ block, index, onBlockChange }: any) {
  const handleChange = (newData: any) => {
    onBlockChange(index, { ...block, data: newData });
  };

  switch (block.type) {
    case 'richText':
      return (
        <TiptapEditor
          value={block.data.html}
          onChange={(html: any) => handleChange({ html })}
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
          <label className="block text-sm font-medium text-gray-700 mb-2">Код</label>
          <textarea
            className="w-full font-mono text-sm border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={8}
            value={block.data.code}
            onChange={(e) => handleChange({ code: e.target.value })}
            placeholder="Введите код..."
          />
        </div>
      );

    case 'image':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">URL изображения</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-3 mb-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={block.data.url}
            onChange={(e) => handleChange({ ...block.data, url: e.target.value })}
            placeholder="https://example.com/image.jpg"
          />
          <label className="block text-sm font-medium text-gray-700 mb-2">Подпись</label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={block.data.caption || ''}
            onChange={(e) => handleChange({ ...block.data, caption: e.target.value })}
            placeholder="Подпись к изображению (необязательно)"
          />
          {block.data.url && (
            <div className="mt-4">
              <Image
                src={block.data.url}
                alt={block.data.caption || 'Превью изображения'}
                width={400}
                height={300}
                className="rounded-lg border border-gray-200 object-cover"
              />
            </div>
          )}
        </div>
      );

    case 'columns':
      return (
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="block text-sm font-medium text-gray-700">
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
                className="text-sm px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
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
                className="text-sm px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                − Колонка
              </button>
            </div>
          </div>
          <div className={`grid gap-4 ${block.data.columns.length === 2 ? 'grid-cols-2' : block.data.columns.length === 3 ? 'grid-cols-3' : 'grid-cols-1'}`}>
            {block.data.columns.map((column: any, colIdx: number) => (
              <div key={colIdx} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <label className="block text-xs text-gray-600 mb-2 font-medium">
                  Колонка {colIdx + 1}
                </label>
                <TiptapEditor
                  value={column.html}
                  onChange={(html: any) => {
                    const newColumns = [...block.data.columns];
                    newColumns[colIdx] = { html };
                    handleChange({ columns: newColumns });
                  }}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Текст цитаты</label>
            <textarea
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              rows={4}
              value={block.data.text}
              onChange={(e) => handleChange({ ...block.data, text: e.target.value })}
              placeholder="Введите текст цитаты..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Автор</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                value={block.data.author || ''}
                onChange={(e) => handleChange({ ...block.data, author: e.target.value })}
                placeholder="Автор цитаты"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Источник</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                value={block.data.source || ''}
                onChange={(e) => handleChange({ ...block.data, source: e.target.value })}
                placeholder="Книга, статья..."
              />
            </div>
          </div>
        </div>
      );

    case 'video':
      return (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">URL видео</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={block.data.url}
              onChange={(e) => {
                const url = e.target.value;
                const platform = url.includes('youtube') || url.includes('youtu.be')
                  ? 'youtube'
                  : url.includes('vimeo')
                  ? 'vimeo'
                  : 'other';
                handleChange({ ...block.data, url, platform });
              }}
              placeholder="https://www.youtube.com/watch?v=... или https://vimeo.com/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Подпись</label>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-red-500 focus:border-transparent"
              value={block.data.caption || ''}
              onChange={(e) => handleChange({ ...block.data, caption: e.target.value })}
              placeholder="Подпись к видео (необязательно)"
            />
          </div>
          {block.data.url && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">
                📹 Предпросмотр:{' '}
                {block.data.platform === 'youtube'
                  ? 'YouTube'
                  : block.data.platform === 'vimeo'
                  ? 'Vimeo'
                  : 'Видео'}
              </p>
            </div>
          )}
        </div>
      );

    default:
      return <div className="text-gray-500">Неизвестный тип блока: {block.type}</div>;
  }
}

// Command Palette для быстрого добавления блоков
function CommandPalette({ isOpen, onClose, onAddBlock }: any) {
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredTypes = Object.entries(BLOCK_TYPES).filter(([key, config]) =>
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
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredTypes, onAddBlock, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-32 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b">
          <input
            type="text"
            className="w-full text-lg px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="Найти блок..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>
        <div className="max-h-96 overflow-y-auto">
          {filteredTypes.length > 0 ? (
            filteredTypes.map(([key, config], idx) => (
              <button
                key={key}
                type="button"
                className={`w-full text-left px-6 py-4 hover:bg-blue-50 flex items-center gap-4 transition-colors ${
                  idx === selectedIndex ? 'bg-blue-100' : ''
                }`}
                onClick={() => {
                  onAddBlock(key);
                  onClose();
                }}
              >
                <span className="text-3xl">{config.icon}</span>
                <div>
                  <div className="font-semibold text-gray-900">{config.label}</div>
                  <div className="text-sm text-gray-500">Добавить {config.label.toLowerCase()}</div>
                </div>
              </button>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">Ничего не найдено</div>
          )}
        </div>
        <div className="p-3 bg-gray-50 border-t text-xs text-gray-500 flex items-center justify-between">
          <span>↑↓ Навигация</span>
          <span>Enter Выбрать</span>
          <span>Esc Закрыть</span>
        </div>
      </div>
    </div>
  );
}

// Основной компонент BlockEditor
export default function BlockEditorImproved({ value, onChange }: { value: EditorJsBlock[]; onChange: (blocks: EditorJsBlock[]) => void }) {
  const [blocks, setBlocks] = useState<EditorJsBlock[]>(Array.isArray(value) ? value : []);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<number>>(new Set());
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Синхронизация с внешним value
  useEffect(() => {
    setBlocks(Array.isArray(value) ? value : []);
  }, [value]);

  // Обновление внешнего состояния
  const updateBlocks = useCallback(
    (newBlocks: EditorJsBlock[]) => {
      setBlocks(newBlocks);
      onChange(newBlocks);
    },
    [onChange]
  );

  // Обработчик перетаскивания
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = parseInt(String(active.id).replace('block-', ''));
      const newIndex = parseInt(String(over.id).replace('block-', ''));
      const newBlocks = arrayMove(blocks, oldIndex, newIndex);
      updateBlocks(newBlocks);
    }
  };

  // Добавление блока
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

  // Изменение блока
  const handleBlockChange = (idx: number, newBlock: EditorJsBlock) => {
    const newBlocks = blocks.map((b, i) => (i === idx ? newBlock : b));
    updateBlocks(newBlocks);
  };

  // Дублирование блока
  const duplicateBlock = (idx: number) => {
    const blockToDuplicate = JSON.parse(JSON.stringify(blocks[idx]));
    const newBlocks = [...blocks.slice(0, idx + 1), blockToDuplicate, ...blocks.slice(idx + 1)];
    updateBlocks(newBlocks);
  };

  // Удаление блока
  const removeBlock = (idx: number) => {
    const newBlocks = blocks.filter((_, i) => i !== idx);
    updateBlocks(newBlocks);
  };

  // Сворачивание/разворачивание блока
  const toggleCollapse = (idx: number) => {
    setCollapsedBlocks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(idx)) {
        newSet.delete(idx);
      } else {
        newSet.add(idx);
      }
      return newSet;
    });
  };

  // Глобальные клавиатурные шорткаты
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K для открытия палитры команд
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(true);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="space-y-6">
      {/* Заголовок редактора */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-200">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Редактор контента</h3>
          <p className="text-sm text-gray-500 mt-1">
            {blocks.length} {blocks.length === 1 ? 'блок' : blocks.length < 5 ? 'блока' : 'блоков'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsPaletteOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Добавить блок (⌘K)
        </button>
      </div>

      {/* Список блоков с drag-and-drop */}
      {blocks.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((_, idx) => `block-${idx}`)} strategy={verticalListSortingStrategy}>
            {blocks.map((block, idx) => (
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
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-center py-16 px-4 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
          <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-600 font-medium mb-2">Контент пока пуст</p>
          <p className="text-gray-500 text-sm mb-4">Добавьте первый блок чтобы начать</p>
          <button
            type="button"
            onClick={() => setIsPaletteOpen(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Добавить блок
          </button>
        </div>
      )}

      {/* Панель быстрого добавления блоков */}
      <div className="flex flex-wrap gap-2 p-4 bg-gray-50 rounded-xl border border-gray-200">
        <span className="text-sm text-gray-600 font-medium self-center mr-2">Быстрое добавление:</span>
        {Object.entries(BLOCK_TYPES).map(([key, config]) => {
          const colorClasses = {
            blue: 'border-blue-200 text-blue-700 hover:bg-blue-50',
            green: 'border-green-200 text-green-700 hover:bg-green-50',
            purple: 'border-purple-200 text-purple-700 hover:bg-purple-50',
            orange: 'border-orange-200 text-orange-700 hover:bg-orange-50',
            red: 'border-red-200 text-red-700 hover:bg-red-50',
            gray: 'border-gray-200 text-gray-700 hover:bg-gray-50',
            pink: 'border-pink-200 text-pink-700 hover:bg-pink-50',
          };
          
          return (
            <button
              key={key}
              type="button"
              onClick={() => addBlock(key)}
              className={`px-3 py-2 bg-white border-2 rounded-lg transition-colors text-sm font-medium flex items-center gap-2 hover:shadow-sm ${colorClasses[config.color as keyof typeof colorClasses] || colorClasses.gray}`}
            >
              <span>{config.icon}</span>
              <span>{config.label}</span>
            </button>
          );
        })}
      </div>

      {/* Command Palette */}
      <CommandPalette isOpen={isPaletteOpen} onClose={() => setIsPaletteOpen(false)} onAddBlock={addBlock} />
    </div>
  );
}
