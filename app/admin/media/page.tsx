// app/admin/media/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function MediaPage() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function fetchFiles() {
      setLoading(true);
      const { data, error } = await supabase.storage.from('media').list('', { limit: 100, offset: 0 });
      if (error || !data) {
        setFiles([]);
        setLoading(false);
        return;
      }
      // Получаем signedUrl для каждого файла (поддержка приватных bucket)
      const filesWithUrls = await Promise.all(
        data.map(async (file) => {
          const { data: urlData } = await supabase.storage.from('media').createSignedUrl(file.name, 60 * 60);
          return { ...file, publicUrl: urlData?.signedUrl };
        })
      );
      setFiles(filesWithUrls);
      setLoading(false);
    }
    fetchFiles();
  }, []);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6">Медиафайлы (Supabase Storage)</h1>
      {loading ? (
        <div>Загрузка...</div>
      ) : files.length === 0 ? (
        <div className="text-gray-500">Нет файлов в хранилище.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {files.map((file) => (
            <div key={file.name} className="bg-white rounded-lg shadow p-2 flex flex-col items-center">
              <img
                src={file.publicUrl}
                alt={file.name}
                className="w-full h-32 object-contain mb-2 bg-gray-50 rounded"
                loading="lazy"
              />
              <div className="text-xs text-gray-700 truncate w-full text-center mb-1">{file.name}</div>
              <button
                className="text-blue-600 text-xs underline mb-1"
                onClick={() => navigator.clipboard.writeText(file.publicUrl)}
              >
                Копировать ссылку
              </button>
              <div className="text-gray-400 text-xs">{(file.metadata?.size / 1024).toFixed(1)} КБ</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
