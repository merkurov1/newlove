// components/ImageUploader.js
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client'; // Наш клиент Supabase для браузера

// Этот компонент принимает одну функцию в качестве "пропса"
// Он вызовет ее, когда картинка успешно загрузится
export default function ImageUploader({ onUploadSuccess }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileUpload(event) {
    try {
      setUploading(true);
      setError(null);
      const file = event.target.files[0];

      if (!file) {
        throw new Error('Вы не выбрали файл для загрузки.');
      }

      // Создаем уникальное имя файла, чтобы избежать перезаписи
      const fileName = `${Date.now()}-${file.name}`;
      
      // Загружаем файл в бакет 'media'
      const { data, error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }
      
      // Получаем публичную ссылку на загруженный файл
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      // Создаем Markdown-строку и передаем ее "наверх"
      const markdownImage = `![_](${publicUrl})`;
      onUploadSuccess(markdownImage);

    } catch (error) {
      setError(error.message);
      console.error('Ошибка при загрузке изображения:', error);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="my-4 p-4 border rounded-md bg-gray-50">
      <label htmlFor="image-upload" className="block text-sm font-medium text-gray-700 mb-2">
        Загрузить изображение
      </label>
      <input
        id="image-upload"
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        disabled={uploading}
        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
      />
      {uploading && <p className="text-sm text-gray-500 mt-2">Загрузка...</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
    </div>
  );
}

