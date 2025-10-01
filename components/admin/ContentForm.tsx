"use client";
import { useState } from 'react';
import TagInput from '@/components/admin/TagInput';
import BlockEditor from '@/components/admin/BlockEditor';
import { Block } from '@/types/blocks';

interface ContentFormProps {
  initialData?: any;
  saveAction: any;
  type: string;
}

function parseBlocks(raw: any): Block[] {
  let arr = Array.isArray(raw) ? raw : (raw ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : []);
  return arr.map((block: any) => {
    if (block.type === 'richText') {
      return { type: 'richText', html: block.html || '' };
    }
    if (block.type === 'gallery') {
      return { type: 'gallery', images: Array.isArray(block.images) ? block.images : [] };
    }
    if (block.type === 'codeBlock') {
      return { type: 'codeBlock', code: block.code || '', language: block.language || 'js' };
    }
    return null;
  }).filter(Boolean) as Block[];
}

export default function ContentForm({ initialData, saveAction, type }: ContentFormProps) {
  const isEditing = !!initialData;
  const [title, setTitle] = useState(initialData?.title || '');
  const [slug, setSlug] = useState(initialData?.slug || '');
  const [content, setContent] = useState<Block[]>(parseBlocks(initialData?.content));
  const [published, setPublished] = useState(initialData?.published || false);
  const [error, setError] = useState('');

  function validateBlocks(blocks: Block[]) {
    if (!Array.isArray(blocks) || blocks.length === 0) return false;
    for (const block of blocks) {
      if (!block.type) return false;
      if (block.type === 'richText' && typeof block.html !== 'string') return false;
      if (block.type === 'gallery' && (!Array.isArray(block.images))) return false;
  // if (block.type === 'codeBlock' && typeof block.code !== 'string') return false;
    }
    return true;
  }

  function handleSubmit(e: React.FormEvent) {
    if (!validateBlocks(content)) {
      e.preventDefault();
      setError('Проверьте структуру блоков: должен быть хотя бы один корректный блок.');
      return false;
    }
    setError('');
    return true;
  }

  return (
    <form action={saveAction} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md" onSubmit={handleSubmit}>
      {isEditing && <input type="hidden" name="id" value={initialData.id} />}
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
        <input
          type="text"
          name="title"
          id="title"
          required
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3"
        />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
        <input
          type="text"
          name="slug"
          id="slug"
          required
          value={slug}
          onChange={e => setSlug(e.target.value)}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3"
        />
      </div>
      <TagInput initialTags={initialData?.tags} />
      <BlockEditor value={content} onChange={setContent} />
      <textarea name="content" value={JSON.stringify(content)} readOnly hidden />
      {error && <div className="text-red-600 text-sm font-medium">{error}</div>}
      <div className="flex items-center mt-2 mb-2">
        <input
          id="published"
          name="published"
          type="checkbox"
          checked={published}
          onChange={e => setPublished(e.target.checked)}
          className="h-6 w-6 rounded border-gray-300 text-blue-600"
        />
        <label htmlFor="published" className="ml-3 block text-base text-gray-900">Опубликовано</label>
      </div>
      <div className="mt-4">
        <button type="submit" className="w-full flex justify-center py-3 px-4 border rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 min-h-[44px]">
          {isEditing ? 'Сохранить изменения' : `Создать ${type}`}
        </button>
      </div>
    </form>
  );
}
