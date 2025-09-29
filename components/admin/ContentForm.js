// components/admin/ContentForm.js
'use client';

import { useState, useRef, useEffect } from 'react';
import ImageUploader from '@/components/ImageUploader';
import TagInput from '@/components/admin/TagInput';
import EditorJsArticle from '@/components/admin/EditorJsArticle';
import dynamic from 'next/dynamic';
const SimpleMdeReact = dynamic(() => import('react-simplemde-editor'), { ssr: false });

export default function ContentForm({ initialData, saveAction, type }) {
  const isEditing = !!initialData;
  const [content, setContent] = useState(initialData?.content || '');
  const [isJson, setIsJson] = useState(true);
  const editorInstanceRef = useRef(null);

  // Надёжная синхронизация состояния с данными, приходящими с сервера
  useEffect(() => {
    if (isEditing && initialData?.content) {
      setContent(initialData.content);
      try {
        const parsed = JSON.parse(initialData.content);
        if (typeof parsed === 'object' && parsed.blocks) {
          setIsJson(true);
        } else {
          setIsJson(false);
        }
      } catch {
        setIsJson(false);
      }
    }
  }, [initialData, isEditing]);

  // Для Editor.js интеграция изображений требует отдельной реализации (через tool image uploader)
  const handleImageInsert = (imageUrl) => {
    // Можно реализовать вставку изображения через Editor.js API, если потребуется
    // Пока оставим как заглушку
  };

  return (
  <form action={saveAction} className="space-y-6 bg-white p-4 sm:p-8 rounded-lg shadow-md">
      {isEditing && <input type="hidden" name="id" value={initialData.id} />}
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
  <input type="text" name="title" id="title" required defaultValue={initialData?.title || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
  <input type="text" name="slug" id="slug" required defaultValue={initialData?.slug || ''} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm text-base px-3 py-3" />
      </div>
      
      <TagInput initialTags={initialData?.tags} />
      
      <ImageUploader onUploadSuccess={handleImageInsert} />


      {isJson ? (
        <EditorJsArticle
          value={content}
          onChange={setContent}
        />
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Содержимое (Markdown)</label>
          <SimpleMdeReact
            value={content}
            onChange={setContent}
            options={{ spellChecker: false, autofocus: true, placeholder: 'Введите текст...' }}
          />
          <input type="hidden" name="content" value={content} />
        </div>
      )}

      <div className="flex items-center mt-2 mb-2">
        <input id="published" name="published" type="checkbox" defaultChecked={initialData?.published || false} className="h-6 w-6 rounded border-gray-300 text-blue-600" />
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
