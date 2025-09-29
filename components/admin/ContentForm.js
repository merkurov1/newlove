// components/admin/ContentForm.js
'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import ImageUploader from '@/components/ImageUploader';
import TagInput from '@/components/admin/TagInput';

const ArticleEditor = dynamic(
  () => import('@/components/admin/ArticleEditor'),
  { ssr: false }
);

export default function ContentForm({ initialData, saveAction, type }) {
  const isEditing = !!initialData;
  const [content, setContent] = useState(initialData?.content || '');
  const editorInstanceRef = useRef(null);

  // Надёжная синхронизация состояния с данными, приходящими с сервера
  useEffect(() => {
    // Устанавливаем контент только если он есть в initialData
    if (isEditing && initialData?.content) {
      setContent(initialData.content);
    }
    // Для новых страниц initialData будет undefined, и state останется '', что правильно
  }, [initialData, isEditing]);

  const handleImageInsert = (markdownImage) => {
    const editor = editorInstanceRef.current;
    if (editor && editor.codemirror) {
      const doc = editor.codemirror.getDoc();
      const cursor = doc.getCursor();
      doc.replaceRange(markdownImage, cursor);
    } else {
      setContent((prev) => `${prev}\n${markdownImage}\n`);
    }
  };

  return (
    <form action={saveAction} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
      {isEditing && <input type="hidden" name="id" value={initialData.id} />}
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
        <input type="text" name="title" id="title" required defaultValue={initialData?.title || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
        <input type="text" name="slug" id="slug" required defaultValue={initialData?.slug || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
      </div>
      
      <TagInput initialTags={initialData?.tags} />
      
      <ImageUploader onUploadSuccess={handleImageInsert} />

      <ArticleEditor 
        value={content} 
        onChange={setContent}
        getMdeInstance={(instance) => { editorInstanceRef.current = instance; }}
      />

      <div className="flex items-center">
        <input id="published" name="published" type="checkbox" defaultChecked={initialData?.published || false} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовано</label>
      </div>
      <div>
        <button type="submit" className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
          {isEditing ? 'Сохранить изменения' : `Создать ${type}`}
        </button>
      </div>
    </form>
  );
}
