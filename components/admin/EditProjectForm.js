// components/admin/EditProjectForm.js
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { updateProject } from '@/app/admin/actions';
import ImageUploader from '@/components/ImageUploader';

const ArticleEditor = dynamic(
  () => import('@/components/admin/ArticleEditor'),
  { ssr: false }
);

export default function EditProjectForm({ project }) {
  // --- 1. ЭТОТ useState - ЕДИНСТВЕННЫЙ ИСТОЧНИК ПРАВДЫ ---
  const [content, setContent] = useState(project.content);

  // --- 2. УПРОЩЕННАЯ И НАДЕЖНАЯ ВСТАВКА ИЗОБРАЖЕНИЯ ---
  // Просто добавляем markdown в конец текущего текста.
  const handleImageInsert = (markdownImage) => {
    setContent((prevContent) => `${prevContent}\n${markdownImage}\n`);
  };

  return (
    <form action={updateProject} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
      <input type="hidden" name="id" value={project.id} />
      
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700">Название</label>
        <input type="text" name="title" id="title" required defaultValue={project.title} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
      </div>
      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
        <input type="text" name="slug" id="slug" required defaultValue={project.slug} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
      </div>
      
      <ImageUploader onUploadSuccess={handleImageInsert} />

      {/* --- 3. ТЕПЕРЬ СВЯЗКА РАБОТАЕТ ПРАВИЛЬНО --- */}
      {/* Мы передаем в редактор актуальное состояние (value) и функцию для его изменения (onChange) */}
      <ArticleEditor value={content} onChange={setContent} />

      <div className="flex items-center">
        <input id="published" name="published" type="checkbox" defaultChecked={project.published} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовано</label>
      </div>
      <div>
        <button type="submit" className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
          Сохранить изменения
        </button>
      </div>
    </form>
  );
}
