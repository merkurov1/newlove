// app/admin/media/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardContent } from '@/components/admin/Card';
import { SearchBox } from '@/components/admin/SearchBox';
import { EmptyState } from '@/components/admin/EmptyState';
import { Button } from '@/components/admin/Button';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useNotifications } from '@/components/admin/NotificationSystem';

interface MediaFile {
  name: string;
  publicUrl: string | null;
  metadata?: Record<string, any>;
  created_at?: string;
}

export default function MediaPage() {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState<string[]>([]);
  
  const supabase = createClientComponentClient();
  const { addNotification } = useNotifications();

  useEffect(() => {
    fetchFiles();
  }, []);

  useEffect(() => {
    if (searchQuery) {
      const filtered = files.filter(file =>
        file.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredFiles(filtered);
    } else {
      setFilteredFiles(files);
    }
  }, [files, searchQuery]);

  async function fetchFiles() {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error } = await supabase.storage.from('media').list('', { 
        limit: 100, 
        offset: 0 
      });
      
      if (error || !data) {
        setFiles([]);
        setError(error?.message || 'Ошибка получения списка файлов');
        return;
      }

      // Получаем URL для каждого файла
      const filesWithUrls = await Promise.all(
        data.map(async (file) => {
          const { data: urlData, error: urlError } = await supabase.storage
            .from('media')
            .createSignedUrl(file.name, 60 * 60);
            
          return {
            ...file,
            publicUrl: urlError ? null : urlData.signedUrl
          };
        })
      );
      
      setFiles(filesWithUrls);
    } catch (err) {
      setError('Произошла ошибка при загрузке файлов');
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles) return;

    for (const file of Array.from(selectedFiles)) {
      setUploadingFiles(prev => [...prev, file.name]);
      
      try {
        const { error } = await supabase.storage
          .from('media')
          .upload(file.name, file);

        if (error) {
          addNotification({
            type: 'error',
            title: 'Ошибка загрузки',
            message: `Не удалось загрузить ${file.name}: ${error.message}`
          });
        } else {
          addNotification({
            type: 'success',
            title: 'Файл загружен',
            message: `${file.name} успешно загружен`
          });
        }
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Ошибка загрузки',
          message: `Произошла ошибка при загрузке ${file.name}`
        });
      } finally {
        setUploadingFiles(prev => prev.filter(name => name !== file.name));
      }
    }

    // Обновляем список файлов
    await fetchFiles();
    
    // Очищаем input
    event.target.value = '';
  };

  const copyToClipboard = async (url: string, fileName: string) => {
    try {
      await navigator.clipboard.writeText(url);
      addNotification({
        type: 'success',
        title: 'Ссылка скопирована',
        message: `Ссылка на ${fileName} скопирована в буфер обмена`
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Ошибка',
        message: 'Не удалось скопировать ссылку'
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <LoadingSpinner size="lg" text="Загрузка медиафайлов..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader 
          title="Медиафайлы" 
          subtitle={`Всего файлов: ${files.length}`}
          action={
            <div className="flex space-x-3">
              <label className="cursor-pointer">
                <Button variant="primary">
                  📎 Загрузить файлы
                </Button>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx"
                />
              </label>
              <Button variant="secondary" onClick={fetchFiles}>
                🔄 Обновить
              </Button>
            </div>
          }
        />
        
        <CardContent>
          {error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <h3 className="text-red-800 font-medium">Ошибка</h3>
              <p className="text-red-600 text-sm mt-1">{error}</p>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={fetchFiles}
                className="mt-3"
              >
                Попробовать снова
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <SearchBox
                  onSearch={setSearchQuery}
                  placeholder="Поиск файлов по имени..."
                  className="max-w-md"
                />
              </div>

              {uploadingFiles.length > 0 && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-2">Загружаемые файлы:</h4>
                  {uploadingFiles.map(fileName => (
                    <div key={fileName} className="flex items-center space-x-2 text-blue-700">
                      <LoadingSpinner size="sm" text="" />
                      <span className="text-sm">{fileName}</span>
                    </div>
                  ))}
                </div>
              )}

              {filteredFiles.length === 0 ? (
                searchQuery ? (
                  <EmptyState
                    icon="🔍"
                    title="Файлы не найдены"
                    description={`По запросу "${searchQuery}" файлы не найдены.`}
                  />
                ) : (
                  <EmptyState
                    icon="🖼️"
                    title="Нет медиафайлов"
                    description="Загрузите первые файлы в медиабиблиотеку."
                  />
                )
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                  {filteredFiles.map((file) => (
                    <div key={file.name} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      {file.publicUrl ? (
                        <div className="aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden">
                          {file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <img
                              src={file.publicUrl}
                              alt={file.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                              <span className="text-4xl">📄</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="aspect-square mb-3 bg-red-50 rounded-lg flex items-center justify-center">
                          <span className="text-red-400 text-sm">Ошибка загрузки</span>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-gray-900 truncate" title={file.name}>
                          {file.name}
                        </h3>
                        
                        {file.metadata?.size && (
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.metadata.size)}
                          </p>
                        )}
                        
                        {file.publicUrl && (
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => copyToClipboard(file.publicUrl!, file.name)}
                              className="flex-1 text-xs"
                            >
                              📋 Копировать
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => window.open(file.publicUrl!, '_blank')}
                              className="text-xs"
                            >
                              👁️
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
