'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useSession } from 'next-auth/react';

export default function ImageUploader({ onUploadSuccess }) {
  const { data: session } = useSession();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileUpload(event) {
    if (!session?.user) {
      setError('Ошибка: вы не авторизованы для загрузки файлов.');
      return;
    }

    try {
      setUploading(true);
      setError(null);
      const file = event.target.files[0];
      if (!file) {
        throw new Error('Вы не выбрали файл для загрузки.');
      }

      // Используем новый API endpoint для загрузки
      const formData = new FormData();
      formData.append('files', file);

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Ошибка при загрузке файла');
      }

      // Проверяем результат загрузки
      const uploadResult = data.results[0];
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Ошибка при загрузке файла');
      }

      // Получаем публичный URL загруженного файла
      const fileName = uploadResult.fileName;
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${fileName}`;

      const markdownImage = `![_](${publicUrl})`;
      onUploadSuccess(markdownImage);

    } catch (error) {
      setError(error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('Ошибка при загрузке изображения:', error);
      }
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

