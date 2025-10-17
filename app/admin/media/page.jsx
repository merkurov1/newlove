'use client';

import { useEffect, useState } from 'react';
import SafeImage from '@/components/SafeImage';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Card, CardHeader, CardContent } from '@/components/admin/Card';
import { SearchBox } from '@/components/admin/SearchBox';
import { EmptyState } from '@/components/admin/EmptyState';
import { Button } from '@/components/admin/Button';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import { useNotifications } from '@/components/admin/NotificationSystem';

export default function MediaPage() {
  const [files, setFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadingFiles, setUploadingFiles] = useState([]);
  const [deletingFiles, setDeletingFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  
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
      const response = await fetch('/api/media');
      const data = await response.json();
      
      if (!response.ok) {
        setFiles([]);
        setError(data.error || 'Ошибка получения списка файлов');
        return;
      }

      setFiles(data.files || []);
    } catch (err) {
      setError('Произошла ошибка при загрузке файлов');
      console.error('Error fetching files:', err);
    } finally {
      setLoading(false);
    }
  }

  const handleFileUpload = async (event) => {
    const selectedFilesInput = event.target.files;
    if (!selectedFilesInput) return;

    const fileArray = Array.from(selectedFilesInput);
    
    // Добавляем все файлы в состояние загрузки
    setUploadingFiles([...uploadingFiles, ...fileArray.map(f => f.name)]);
        
    try {
      const formData = new FormData();
      fileArray.forEach(file => {
        formData.append('files', file);
      });

      const response = await fetch('/api/media/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification({
          type: 'error',
          title: 'Ошибка загрузки',
          message: data.error || 'Не удалось загрузить файлы'
        });
      } else {
        // Показываем результаты по каждому файлу
        data.results.forEach((result) => {
          if (result.success) {
            addNotification({
              type: 'success',
              title: 'Файл загружен',
              message: `${result.fileName} успешно загружен`
            });
          } else {
            addNotification({
              type: 'error',
              title: 'Ошибка загрузки',
              message: `${result.fileName}: ${result.error}`
            });
          }
        });

        if (data.success) {
          addNotification({
            type: 'success',
            title: 'Загрузка завершена',
            message: `Загружено файлов: ${data.results.filter((r) => r.success).length}`
          });
        }
      }
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Ошибка загрузки',
        message: 'Произошла ошибка при загрузке файлов'
      });
    } finally {
      // Убираем все файлы из состояния загрузки
      setUploadingFiles(uploadingFiles.filter(name => !fileArray.map(f => f.name).includes(name)));
    }

    // Обновляем список файлов
    await fetchFiles();
    
    // Очищаем input
    event.target.value = '';
  };

  const copyToClipboard = async (url, fileName) => {
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

  const deleteFile = async (fileName) => {
    if (!confirm(`Удалить файл "${fileName}"? Это действие нельзя отменить.`)) {
      return;
    }

    setDeletingFiles([...deletingFiles, fileName]);

    try {
      const response = await fetch('/api/media/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileName }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification({
          type: 'error',
          title: 'Ошибка удаления',
          message: data.error || `Не удалось удалить ${fileName}`
        });
      } else {
        addNotification({
          type: 'success',
          title: 'Файл удален',
          message: `${fileName} успешно удален`
        });
        
        // Обновляем список файлов
        await fetchFiles();
      }
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Ошибка удаления',
        message: `Произошла ошибка при удалении ${fileName}`
      });
    } finally {
      setDeletingFiles(deletingFiles.filter(name => name !== fileName));
    }
  };

  const deleteSelectedFiles = async () => {
    if (selectedFiles.length === 0) return;
    
    if (!confirm(`Удалить ${selectedFiles.length} файл(ов)? Это действие нельзя отменить.`)) {
      return;
    }

    setDeletingFiles([...deletingFiles, ...selectedFiles]);

    try {
      const response = await fetch('/api/media/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileNames: selectedFiles }),
      });

      const data = await response.json();

      if (!response.ok) {
        addNotification({
          type: 'error',
          title: 'Ошибка удаления',
          message: data.error || 'Не удалось удалить файлы'
        });
      } else {
        addNotification({
          type: 'success',
          title: 'Файлы удалены',
          message: `${selectedFiles.length} файл(ов) успешно удалено`
        });
        
        setSelectedFiles([]);
        await fetchFiles();
      }
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Ошибка удаления',
        message: 'Произошла ошибка при удалении файлов'
      });
    } finally {
      setDeletingFiles(deletingFiles.filter(name => !selectedFiles.includes(name)));
    }
  };

  const toggleFileSelection = (fileName) => {
    setSelectedFiles(
      selectedFiles.includes(fileName)
        ? selectedFiles.filter(name => name !== fileName)
        : [...selectedFiles, fileName]
    );
  };

  const selectAllFiles = () => {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map(file => file.name));
    }
  };

  const formatFileSize = (bytes) => {
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
          subtitle={selectedFiles.length > 0 ? `Выбрано: ${selectedFiles.length} файл(ов)` : `Всего файлов: ${files.length}`}
          action={
            <div className="flex space-x-3">
              {selectedFiles.length > 0 && (
                <Button 
                  variant="secondary" 
                  onClick={deleteSelectedFiles}
                  className="text-red-600 hover:text-red-700 border-red-300 hover:border-red-400"
                >
                  🗑️ Удалить выбранные ({selectedFiles.length})
                </Button>
              )}
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
                <div className="flex items-center justify-between mb-4">
                  <SearchBox
                    onSearch={setSearchQuery}
                    placeholder="Поиск файлов по имени..."
                    className="max-w-md"
                  />
                  
                  {filteredFiles.length > 0 && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={selectedFiles.length === filteredFiles.length}
                        onChange={selectAllFiles}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-600">
                        Выбрать все
                      </span>
                    </div>
                  )}
                </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                  {filteredFiles.map((file) => (
                    <div
                      key={file.name}
                      className={`bg-white rounded-xl border shadow-sm p-4 flex flex-col gap-2 hover:shadow-md transition-shadow relative ${
                        selectedFiles.includes(file.name) ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'
                      }`}
                    >
                      {/* Чекбокс для выбора файла */}
                      <div className="absolute top-2 left-2 z-10">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.name)}
                          onChange={() => toggleFileSelection(file.name)}
                          className="rounded border-gray-300 bg-white shadow"
                        />
                      </div>
                      {file.publicUrl ? (
                        <div className="aspect-square mb-3 bg-gray-50 rounded-lg overflow-hidden flex items-center justify-center">
                          {file.name.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                            <SafeImage
                              src={file.publicUrl}
                              alt={file.name}
                              width={600}
                              height={600}
                              className="w-full h-full object-cover"
                              unoptimized
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
                      <div className="space-y-1">
                        <h3 className="font-medium text-sm text-gray-900 truncate" title={file.name}>
                          {file.name}
                        </h3>
                        {file.metadata?.size && (
                          <p className="text-xs text-gray-500">
                            {formatFileSize(file.metadata.size)}
                          </p>
                        )}
                        {file.publicUrl && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => copyToClipboard(file.publicUrl, file.name)}
                              className="flex-1 text-xs"
                            >
                              📋 Копировать
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => window.open(file.publicUrl, '_blank')}
                              className="text-xs"
                            >
                              👁️
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => deleteFile(file.name)}
                              disabled={deletingFiles.includes(file.name)}
                              className="text-xs text-red-600 hover:text-red-700 border-red-300 hover:border-red-400 disabled:opacity-50"
                              title="Удалить файл"
                            >
                              {deletingFiles.includes(file.name) ? '⏳' : '🗑️'}
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
