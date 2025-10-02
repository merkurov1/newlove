"use client";

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import TagInput from '@/components/admin/TagInput';
import BlockEditor from '@/components/admin/BlockEditor';

import { EditorJsBlock } from '@/types/blocks';





interface ContentFormProps {
  initialData?: any;
  saveAction: any;
  type: string;
}

function parseBlocks(raw: any): EditorJsBlock[] {
  if (!raw) return [];
  let arr = Array.isArray(raw) ? raw : (() => { try { return JSON.parse(raw); } catch { return []; } })();
  // Validate and coerce to EditorJsBlock shape
  return arr.filter((block: any) => block && typeof block.type === 'string' && block.data && typeof block.data === 'object');
}


export default function ContentForm({ initialData, saveAction, type }: ContentFormProps) {
  const safeInitial = initialData && typeof initialData === 'object' ? initialData : {};
  const isEditing = !!safeInitial && !!safeInitial.id;
  const [title, setTitle] = useState(safeInitial.title || '');
  const [slug, setSlug] = useState(safeInitial.slug || '');
  const [content, setContent] = useState<EditorJsBlock[]>(parseBlocks(safeInitial.content));
  const [published, setPublished] = useState(safeInitial.published || false);
  const [error, setError] = useState('');
  const { data: session, status } = useSession();
  const authorId = safeInitial.authorId || session?.user?.id || '';
  const [tags, setTags] = useState<string[]>(() => (safeInitial.tags || []).map((t: any) => t.name));

  function validateBlocks(blocks: EditorJsBlock[]) {
    if (!Array.isArray(blocks) || blocks.length === 0) return false;
    for (const block of blocks) {
      if (!block.type || typeof block.type !== 'string') return false;
      if (!block.data || typeof block.data !== 'object') return false;
      if (block.type === 'richText' && typeof block.data.html !== 'string') return false;
      if (block.type === 'gallery' && (!Array.isArray(block.data.images))) return false;
      if (block.type === 'image' && typeof block.data.url !== 'string') return false;
      if (block.type === 'code' && typeof block.data.code !== 'string') return false;
      if (block.type === 'columns') {
        if (!Array.isArray(block.data.columns)) return false;
        for (const column of block.data.columns) {
          if (!column || typeof column.html !== 'string') return false;
        }
      }
      if (block.type === 'quote' && typeof block.data.text !== 'string') return false;
      if (block.type === 'video' && typeof block.data.url !== 'string') return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    if (status !== 'authenticated' || !authorId) {
      e.preventDefault();
      setError('Ошибка: не определён автор. Войдите в систему.');
      return false;
    }
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
  {isEditing && <input type="hidden" name="id" value={safeInitial.id} />}
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
  <TagInput initialTags={safeInitial.tags} onChange={setTags} />
  <BlockEditor value={content} onChange={setContent} />
      <input type="hidden" name="authorId" value={authorId} />
      <input type="hidden" name="tags" value={JSON.stringify(tags)} />
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
