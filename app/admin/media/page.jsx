'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import MediaLinksPanel from '@/components/admin/MediaLinksPanel';

const BUCKET_NAME = 'media';

const buttonClass =
  'inline-flex items-center justify-center rounded-md border border-[#D9D3CD] px-3 py-2 text-sm text-[#211F1F] transition hover:border-[#990F3D] hover:text-[#990F3D] disabled:cursor-not-allowed disabled:opacity-40';

const inputClass =
  'w-full rounded-md border border-[#D9D3CD] bg-white px-3 py-2.5 text-sm text-[#211F1F] outline-none focus:border-[#990F3D]';

function errorText(error, fallback) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error.message === 'string') return error.message;
  return fallback;
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
    return 'Размер не указан';
  }

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);

  const [mediaFiles, setMediaFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [storageError, setStorageError] = useState('');

  const notify = useCallback((message, type = 'info') => {
    setNotice({ message, type });
  }, []);

  const filteredFiles = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return mediaFiles.filter((file) =>
      file.name.toLowerCase().includes(query)
    );
  }, [mediaFiles, searchTerm]);

  const loadMediaFiles = useCallback(async () => {
    setLoading(true);
    setStorageError('');

    try {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list('', {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;

      const files = (data || [])
        .filter(
          (file) =>
            file.name &&
            file.name !== '.emptyFolderPlaceholder'
        )
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

      setSelectedFiles((current) =>
        current.filter((name) => files.some((file) => file.name === name))
      );
    } catch (error) {
      console.error('[admin/media] Storage list failed:', error);

      const message = errorText(
        error,
        'Не удалось загрузить список файлов.'
      );

      setStorageError(message);
      notify(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [supabase, notify]);

  useEffect(() => {
    void loadMediaFiles();
  }, [loadMediaFiles]);

  async function handleUpload(event) {
    const input = event.currentTarget;
    const files = Array.from(input.files || []);

    if (!files.length) return;

    setUploading(true);
    setStorageError('');

    let uploaded = 0;
    const failures = [];

    try {
      for (const file of files) {
        const safeName = file.name.replace(/[^\w.-]/g, '-');
        const fileName = String(Date.now()) + '-' + safeName;

        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false,
          });

        if (error) {
          failures.push(`${file.name}: ${error.message}`);
        } else {
          uploaded += 1;
        }
      }

      await loadMediaFiles();

      if (failures.length) {
        notify(
          `Загружено ${uploaded} из ${files.length}. Ошибки: ${failures.join('; ')}`,
          'error'
        );
      } else {
        notify(`Загружено файлов: ${uploaded}`, 'success');
      }
    } catch (error) {
      console.error('[admin/media] Upload failed:', error);

      notify(
        errorText(error, 'Не удалось загрузить файлы.'),
        'error'
      );
    } finally {
      setUploading(false);
      input.value = '';
    }
  }

  async function deleteFiles(names) {
    if (!names.length) return;

    const promptText =
      names.length === 1
        ? `Удалить файл «${names[0]}»? Это действие нельзя отменить.`
        : `Удалить выбранные файлы (${names.length})? Это действие нельзя отменить.`;

    if (!window.confirm(promptText)) return;

    try {
      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(names);

      if (error) throw error;

      setSelectedFiles((current) =>
        current.filter((name) => !names.includes(name))
      );

      notify(
        names.length === 1 ? 'Файл удалён.' : 'Выбранные файлы удалены.',
        'success'
      );

      await loadMediaFiles();
    } catch (error) {
      console.error('[admin/media] Delete failed:', error);

      notify(
        errorText(error, 'Не удалось удалить файлы.'),
        'error'
      );
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
    const visibleNames = filteredFiles.map((file) => file.name);

    const allVisibleSelected =
      visibleNames.length > 0 &&
      visibleNames.every((name) => selectedFiles.includes(name));

    if (allVisibleSelected) {
      setSelectedFiles((current) =>
        current.filter((name) => !visibleNames.includes(name))
      );
    } else {
      setSelectedFiles((current) =>
        Array.from(new Set([...current, ...visibleNames]))
      );
    }
  }

  async function copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      notify('Ссылка скопирована.', 'success');
    } catch (error) {
      console.error('[admin/media] Clipboard failed:', error);

      notify(
        'Не удалось скопировать ссылку. Откройте файл и скопируйте URL вручную.',
        'error'
      );
    }
  }

  const allVisibleSelected =
    filteredFiles.length > 0 &&
    filteredFiles.every((file) => selectedFiles.includes(file.name));

  return (
    <div className="space-y-10 pb-10">
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className={
            'flex items-start justify-between gap-4 border px-4 py-3 text-sm ' +
            (notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : notice.type === 'success'
                ? 'border-green-200 bg-green-50 text-green-800'
                : 'border-[#D9D3CD] bg-white text-[#211F1F]')
          }
        >
          <p className="min-w-0 break-words">{notice.message}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Закрыть уведомление"
            className="shrink-0"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <a
          href="/admin/media/intelligence"
          className="text-sm text-[#8B1E3F] underline underline-offset-2"
        >
          Media Intelligence →
        </a>
      </div>

      {/* Добавление и редактирование публикаций */}
      <MediaLinksPanel />

      {/* Управление файлами Supabase Storage */}
      <section className="space-y-5 border-t border-[#D9D3CD] pt-7">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#89827B]">
              Storage management
            </p>
            <h2 className="mt-2 font-serif text-3xl font-normal tracking-tight text-[#211F1F]">
              Media files
            </h2>
            <p className="mt-2 text-sm text-[#746D66]">
              Изображения, видео и другие загруженные файлы.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              className={
                'inline-flex cursor-pointer items-center justify-center rounded-md bg-[#990F3D] px-4 py-2.5 text-sm text-white transition hover:bg-[#7E0C33] ' +
                (uploading ? 'pointer-events-none opacity-50' : '')
              }
            >
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

            <button
              type="button"
              onClick={() => void loadMediaFiles()}
              disabled={loading || uploading}
              className={buttonClass}
            >
              Обновить
            </button>
          </div>
        </header>

        {storageError && (
          <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Не удалось загрузить Storage.</p>
            <p className="mt-1 break-words">{storageError}</p>
            <p className="mt-2">
              Проверьте права текущего пользователя и наличие bucket
              <code className="mx-1">media</code>
              в Supabase Storage.
            </p>
          </div>
        )}

        <div className="border-y border-[#D9D3CD] py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label htmlFor="media-file-search" className="sr-only">
                Поиск файлов
              </label>
              <input
                id="media-file-search"
                type="search"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Поиск по имени файла…"
                className={inputClass}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-[#746D66]">
                {filteredFiles.length} файлов
              </span>

              {filteredFiles.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className={buttonClass}
                >
                  {allVisibleSelected ? 'Снять выделение' : 'Выбрать все'}
                </button>
              )}

              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => void deleteFiles(selectedFiles)}
                  className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 transition hover:border-red-500"
                >
                  Удалить ({selectedFiles.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div role="status" className="py-12 text-center text-sm text-[#746D66]">
            Загрузка медиафайлов…
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="border-b border-[#D9D3CD] py-12 text-center">
            <p className="font-serif text-xl text-[#211F1F]">
              Файлы не найдены
            </p>
            <p className="mt-2 text-sm text-[#746D66]">
              {searchTerm
                ? 'Попробуйте изменить поисковый запрос.'
                : 'В bucket нет доступных файлов либо у пользователя нет прав на их просмотр.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filteredFiles.map((file) => {
              const isSelected = selectedFiles.includes(file.name);
              const isImage = /\.(png|jpe?g|gif|webp|avif|svg)$/i.test(file.name);
              const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(file.name);

              return (
                <article
                  key={file.name}
                  className={
                    'group min-w-0 overflow-hidden border bg-white ' +
                    (isSelected
                      ? 'border-[#990F3D] ring-1 ring-[#990F3D]'
                      : 'border-[#D9D3CD]')
                  }
                >
                  <div className="relative flex aspect-square items-center justify-center bg-[#F7F5F2]">
                    <label className="absolute left-2 top-2 z-10 flex cursor-pointer items-center justify-center rounded bg-white/95 p-1.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(file.name)}
                        aria-label={`Выбрать ${file.name}`}
                      />
                    </label>

                    {isImage ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        loading="lazy"
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
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-[#89827B]">
                        <span className="text-3xl" aria-hidden="true">
                          ▤
                        </span>
                        <span className="break-all text-center text-xs uppercase">
                          {file.name.split('.').pop() || 'File'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3 p-3">
                    <p
                      className="break-all text-xs font-medium text-[#211F1F]"
                      title={file.name}
                    >
                      {file.name}
                    </p>

                    <p className="text-xs text-[#89827B]">
                      {formatBytes(file.metadata?.size)}
                    </p>

                    <div className="flex flex-wrap gap-x-3 gap-y-2">
                      <button
                        type="button"
                        onClick={() => void copyUrl(file.url)}
                        className="text-left text-xs text-[#746D66] underline underline-offset-2 hover:text-[#990F3D]"
                      >
                        Копировать URL
                      </button>

                      <button
                        type="button"
                        onClick={() => void deleteFiles([file.name])}
                        className="text-left text-xs text-red-700 underline underline-offset-2 hover:text-red-900"
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
      </section>
    </div>
  );
}