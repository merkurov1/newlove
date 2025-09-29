// components/admin/EditProjectForm.js
'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { updateProject } from '@/app/admin/actions'; // Путь к Server Action
import ImageUploader from '@/components/ImageUploader';

// Динамически импортируем редактор, чтобы он работал только в браузере
const ArticleEditor = dynamic(
  () => import('@/components/admin/ArticleEditor'),
  { ssr: false }
);

export default function EditProjectForm({ project }) {
  // Локальное состояние для текста, чтобы редактор был отзывчивым
  const [content, setContent] = useState(project.content);

  // Функция для вставки Markdown-ссылки на картинку в текст
  const handleImageInsert = (markdownImage) => {
    // Вставляем в текущую позицию курсора или в конец
    const textarea = document.querySelector('#content-editor'); // Находим наш редактор
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.substring(0, start) + markdownImage + content.substring(end);
      setContent(newContent);
    } else {
      // Если что-то пошло не так, просто добавляем в конец
      setContent((prevContent) => `${prevContent}\n${markdownImage}\n`);
    }
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
      
      {/* Компонент загрузки изображений */}
      <ImageUploader onUploadSuccess={handleImageInsert} />

      {/* Наш новый редактор! Передаем в него текущее содержимое и on-the-fly меняем его в textarea */}
      <ArticleEditor initialValue={content} />
      {/* В ArticleEditor уже есть скрытое поле <textarea name="content">, которое отправит данные */}

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
