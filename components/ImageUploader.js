'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase-client';
import { useSession } from 'next-auth/react'; // <<< 1. Импортируем useSession

export default function ImageUploader({ onUploadSuccess }) {
  const { data: session } = useSession(); // <<< 2. Получаем сессию
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileUpload(event) {
    // <<< 3. Проверяем, есть ли у нас сессия и токен
    if (!session || !session.supabaseAccessToken) {
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

      // <<< 4. "Представляемся" Supabase перед запросом
      // Мы говорим клиенту Supabase: "Используй вот этот токен для следующего запроса"
      supabase.auth.setAuth(session.supabaseAccessToken);

      const fileName = `${Date.now()}-${file.name}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file);

      if (uploadError) {
        throw uploadError;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

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


