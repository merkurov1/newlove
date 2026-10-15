'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import MediaLinksPanel from '@/components/admin/MediaLinksPanel';

// Существующие компоненты проекта
import SafeImage from '@/components/SafeImage';
import { Card } from '@/components/ui/Card';
import SearchBox from '@/components/ui/SearchBox';
import EmptyState from '@/components/ui/EmptyState';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useNotifications } from '@/components/ui/Notifications';

export default function MediaPage() {
  const supabase = createClientComponentClient();
  const { notify } = useNotifications();

  const [mediaFiles, setMediaFiles] = useState([]);
  const [filteredFiles, setFilteredFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);

  const BUCKET_NAME = 'media';

  useEffect(() => {
    loadMediaFiles();
  }, []);

  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredFiles(mediaFiles);
      return;
    }

    const term = searchTerm.toLowerCase();

    setFilteredFiles(
      mediaFiles.filter((file) =>
        file.name.toLowerCase().includes(term)
      )
    );
  }, [searchTerm, mediaFiles]);

  async function loadMediaFiles() {
    setLoading(true);

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;

      const files = (data || [])
        .filter((file) => file.name && file.name !== '.emptyFolderPlaceholder')
        .map((file) => {
          const { data: publicData } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(file.name);

          return {
            ...file,
            url: publicData.publicUrl,
          };
        });

      setMediaFiles(files);
      setFilteredFiles(files);
    } catch (error) {
      console.error('Error loading media files:', error);
      notify?.('Не удалось загрузить медиафайлы', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpload(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setUploading(true);

    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.-]/g, '-');
        const fileName = `${Date.now()}-${safeName}`;

        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) throw error;
      }

      notify?.('Файлы загружены', 'success');
      await loadMediaFiles();
    } catch (error) {
      console.error('Error uploading media files:', error);
      notify?.('Не удалось загрузить файлы', 'error');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleDelete(fileName) {
    const confirmed = window.confirm(
      `Удалить файл «${fileName}»? Это действие нельзя отменить.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([fileName]);

      if (error) throw error;

      setSelectedFiles((current) =>
        current.filter((name) => name !== fileName)
      );

      notify?.('Файл удалён', 'success');
      await loadMediaFiles();
    } catch (error) {
      console.error('Error deleting media file:', error);
      notify?.('Не удалось удалить файл', 'error');
    }
  }

  async function handleDeleteSelected() {
    if (!selectedFiles.length) return;

    const confirmed = window.confirm(
      `Удалить выбранные файлы (${selectedFiles.length})? Это действие нельзя отменить.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(selectedFiles);

      if (error) throw error;

      setSelectedFiles([]);
      notify?.('Выбранные файлы удалены', 'success');
      await loadMediaFiles();
    } catch (error) {
      console.error('Error deleting selected files:', error);
      notify?.('Не удалось удалить выбранные файлы', 'error');
    }
  }

  function toggleSelected(fileName) {
    setSelectedFiles((current) =>
      current.includes(fileName)
        ? current.filter((name) => name !== fileName)
        : [...current, fileName]
    );
  }

  function toggleSelectAll() {
    if (selectedFiles.length === filteredFiles.length) {
      setSelectedFiles([]);
    } else {
      setSelectedFiles(filteredFiles.map((file) => file.name));
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      notify?.('Ссылка скопирована', 'success');
    } catch (error) {
      console.error('Error copying URL:', error);
      notify?.('Не удалось скопировать ссылку', 'error');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <MediaLinksPanel />

        <LoadingSpinner size="lg" text="Загрузка медиафайлов..." />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Управление ссылками на публикации и внешние источники */}
      <MediaLinksPanel />

      {/* Существующий менеджер файлов Supabase Storage */}
      <section className="space-y-4 border-t border-gray-200 pt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xs uppercase tracking-[0.18em] text-gray-500">
              Storage management
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Загруженные изображения и другие медиафайлы.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-black px-4 py-2 text-sm text-white transition hover:bg-gray-800">
              {uploading ? 'Загрузка…' : 'Загрузить файлы'}
              <input
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf"
                className="hidden"
                disabled={uploading}
                onChange={handleUpload}
              />
            </label>

            <Button
              onClick={loadMediaFiles}
              disabled={uploading}
            >
              Обновить
            </Button>
          </div>
        </div>

        <Card>
          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <SearchBox
                  value={searchTerm}
                  onChange={setSearchTerm}
                  placeholder="Поиск по имени файла…"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500">
                  {filteredFiles.length} файлов
                </span>

                {filteredFiles.length > 0 && (
                  <Button onClick={toggleSelectAll}>
                    {selectedFiles.length === filteredFiles.length
                      ? 'Снять выделение'
                      : 'Выбрать все'}
                  </Button>
                )}

                {selectedFiles.length > 0 && (
                  <Button onClick={handleDeleteSelected}>
                    Удалить ({selectedFiles.length})
                  </Button>
                )}
              </div>
            </div>

            {filteredFiles.length === 0 ? (
              <EmptyState
                title="Файлы не найдены"
                description={
                  searchTerm
                    ? 'Попробуйте изменить поисковый запрос.'
                    : 'Загрузите файлы, чтобы они появились здесь.'
                }
              />
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filteredFiles.map((file) => {
                  const isSelected = selectedFiles.includes(file.name);
                  const isImage = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(
                    file.name
                  );
                  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(file.name);

                  return (
                    <article
                      key={file.name}
                      className={`group min-w-0 overflow-hidden rounded-md border ${
                        isSelected
                          ? 'border-black ring-1 ring-black'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="relative aspect-square bg-gray-50">
                        <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center justify-center rounded bg-white/90 p-1.5 shadow-sm">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelected(file.name)}
                            aria-label={`Выбрать ${file.name}`}
                          />
                        </label>

                        {isImage ? (
                          <SafeImage
                            src={file.url}
                            alt={file.name}
                            className="h-full w-full object-contain"
                          />
                        ) : isVideo ? (
                          <video
                            src={file.url}
                            className="h-full w-full object-contain"
                            controls
                            preload="metadata"
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-gray-400">
                            <span className="text-3xl">▤</span>
                            <span className="text-xs uppercase">
                              {file.name.split('.').pop() || 'File'}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 p-3">
                        <p
                          className="break-all text-xs font-medium text-gray-800"
                          title={file.name}
                        >
                          {file.name}
                        </p>

                        <p className="text-xs text-gray-500">
                          {typeof file.metadata?.size === 'number'
                            ? `${(file.metadata.size / 1024).toFixed(1)} KB`
                            : 'Размер не указан'}
                        </p>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => copyUrl(file.url)}
                            className="text-xs text-gray-600 underline underline-offset-2 hover:text-black"
                          >
                            Копировать URL
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(file.name)}
                            className="text-xs text-red-600 underline underline-offset-2 hover:text-red-800"
                          >
                            Удалить
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}
