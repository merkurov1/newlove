'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export type YouTubeChannelManagerProject = 'pierrot' | 'unframed';

type StatusPayload = {
  channel?: {
    id: string | null;
    title: string | null;
    accountLabel: string | null;
    googleAccountEmail: string | null;
  };
  permissions?: {
    analytics: boolean;
    missingAnalyticsScopes: string[];
    management: boolean;
    managementScopes: string[];
    missingManagementScopes: string[];
    connectUrl: string;
  };
  connection?: { status: string };
  project?: string;
};

type PendingAction = {
  kind: 'json' | 'form';
  action: string;
  params: Record<string, unknown>;
  form?: FormData;
  preview: string;
  destructive: boolean;
  confirmationToken: string;
};

type ApiResult = {
  ok?: boolean;
  confirmationRequired?: boolean;
  confirmationToken?: string;
  preview?: { summary?: string; destructive?: boolean };
  message?: string;
  error?: string;
  result?: unknown;
  requiredScopes?: string[];
  connectUrl?: string;
};

function scopeName(scope: string): string {
  return scope.replace('https://www.googleapis.com/auth/', '');
}

export default function YouTubeChannelManager({
  project = 'pierrot',
}: {
  project?: YouTubeChannelManagerProject;
}) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [videoId, setVideoId] = useState('');
  const [comments, setComments] = useState<Array<Record<string, unknown>>>([]);
  const [captions, setCaptions] = useState<Array<Record<string, unknown>>>([]);
  const [playlists, setPlaylists] = useState<Array<Record<string, unknown>>>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [captionFile, setCaptionFile] = useState<File | null>(null);

  const endpoint = useMemo(
    () => `/api/admin/youtube/management?project=${encodeURIComponent(project)}`,
    [project]
  );

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) throw new Error('status');
        const payload = (await response.json()) as StatusPayload;
        if (!cancelled) {
          setStatus(payload);
          setError(null);
        }
      } catch {
        if (!cancelled) {
          setError('Не удалось прочитать состояние канала. Повторите позже.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  const postJson = useCallback(
    async (action: string, params: Record<string, unknown>, token?: string) => {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          project,
          params,
          ...(token ? { confirmationToken: token } : {}),
        }),
      });
      return { response, payload: (await response.json().catch(() => ({}))) as ApiResult };
    },
    [endpoint, project]
  );

  const postForm = useCallback(
    async (action: string, form: FormData, token?: string) => {
      const body = new FormData();
      for (const [key, value] of form.entries()) body.append(key, value);
      body.set('action', action);
      body.set('project', project);
      if (token) body.set('confirmationToken', token);
      const response = await fetch(endpoint, { method: 'POST', body });
      return { response, payload: (await response.json().catch(() => ({}))) as ApiResult };
    },
    [endpoint, project]
  );

  const handleResult = (
    response: Response,
    payload: ApiResult,
    action: string,
    params: Record<string, unknown>,
    form?: FormData
  ) => {
    if (response.status === 409 && payload.confirmationToken) {
      setPending({
        kind: form ? 'form' : 'json',
        action,
        params,
        form,
        preview: payload.preview?.summary || action,
        destructive: payload.preview?.destructive === true,
        confirmationToken: payload.confirmationToken,
      });
      setError(null);
      return;
    }

    if (!response.ok || payload.error) {
      setError(
        payload.message ||
          (payload.requiredScopes?.length
            ? `Нужно дополнительное разрешение: ${payload.requiredScopes.map(scopeName).join(', ')}`
            : payload.error || 'Действие не выполнено.')
      );
      setPending(null);
      return;
    }

    setError(null);
    setPending(null);
    setResult(payload.result ?? payload);
  };

  const runJson = async (action: string, params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const { response, payload } = await postJson(action, params);
      handleResult(response, payload, action, params);
    } catch {
      setError('Сеть недоступна. Действие не отправлено.');
    } finally {
      setBusy(false);
    }
  };

  const runForm = async (action: string, form: FormData, params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const { response, payload } = await postForm(action, form);
      handleResult(response, payload, action, params, form);
    } catch {
      setError('Сеть недоступна. Файл не отправлен.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const { response, payload } =
        pending.kind === 'form' && pending.form
          ? await postForm(pending.action, pending.form, pending.confirmationToken)
          : await postJson(pending.action, pending.params, pending.confirmationToken);
      handleResult(response, payload, pending.action, pending.params, pending.form);
    } catch {
      setError('Сеть недоступна. Подтверждение не отправлено.');
    } finally {
      setBusy(false);
    }
  };

  const managementAllowed = status?.permissions?.management === true;
  const connectUrl =
    status?.permissions?.connectUrl || `/api/admin/youtube/management/connect?project=${project}`;

  return (
    <section className="pw-analytics-card" aria-labelledby="youtube-manager-title">
      <div className="pw-analytics-card-head">
        <div>
          <span
            className={`pw-dot ${managementAllowed ? 'pw-dot-growth' : 'pw-dot-attention'}`}
            aria-hidden="true"
          />
          <h2 id="youtube-manager-title">
            YouTube · управление · {project === 'unframed' ? 'UNFRAMED' : 'Pierrot'}
          </h2>
        </div>
        <span className="pw-analytics-badge">
          {managementAllowed ? 'управление разрешено' : 'только чтение'}
        </span>
      </div>

      <p className="pw-analytics-id">
        {status?.channel?.title || status?.channel?.accountLabel || 'Канал не подключён'}
        {status?.channel?.id ? ` · ${status.channel.id}` : ''}
      </p>
      <p className="pw-analytics-hint">
        Google-аккаунт:{' '}
        {status?.channel?.googleAccountEmail || 'не подтверждён отдельным management-grant'}. Канал
        один и общий для Pierrot и UNFRAMED.
      </p>

      {!managementAllowed && (
        <p className="pw-analytics-action">
          Запись требует отдельного incremental consent. Аналитика при этом не меняется.
          {status?.permissions?.missingManagementScopes.length
            ? ` Не хватает: ${status.permissions.missingManagementScopes.map(scopeName).join(', ')}.`
            : ''}
        </p>
      )}

      <div className="pw-analytics-card-actions">
        <a className="pw-analytics-button" href={connectUrl}>
          {managementAllowed ? 'Выбрать другой Google-аккаунт' : 'Подключить управление'}
        </a>
        <a className="pw-analytics-button pw-analytics-button--quiet" href={endpoint}>
          Диагностика
        </a>
      </div>

      {error && <p className="pw-analytics-error">{error}</p>}

      {pending && (
        <div className="pw-analytics-config" role="alert">
          <h3>Подтвердите действие</h3>
          <p>{pending.preview}</p>
          {pending.destructive && (
            <p>
              Это затрагивает внешне видимые данные или необратимо. Ничего не отправлено до
              подтверждения.
            </p>
          )}
          <div className="pw-analytics-card-actions">
            <button
              className="pw-analytics-button"
              type="button"
              disabled={busy}
              onClick={() => void confirmPending()}
            >
              Подтвердить
            </button>
            <button
              className="pw-analytics-button pw-analytics-button--quiet"
              type="button"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      <div className="pw-analytics-grid" aria-label="Операции YouTube">
        <article>
          <h3>Видео</h3>
          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!videoFile) return;
              const form = new FormData(event.currentTarget);
              const title = String(form.get('title') || '');
              const description = String(form.get('description') || '');
              const privacyStatus = String(form.get('privacyStatus') || 'private');
              const upload = new FormData();
              upload.set('file', videoFile);
              upload.set('title', title);
              upload.set('description', description);
              upload.set('privacyStatus', privacyStatus);
              void runForm('video.upload', upload, { title, privacyStatus });
            }}
          >
            <label>
              Файл
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] || null)}
              />
            </label>
            <label>
              Название
              <input name="title" maxLength={100} required />
            </label>
            <label>
              Описание
              <textarea name="description" maxLength={5000} rows={2} />
            </label>
            <label>
              Приватность
              <select name="privacyStatus" defaultValue="private">
                <option value="private">private</option>
                <option value="unlisted">unlisted</option>
                <option value="public">public</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !managementAllowed}>
              Загрузить (с подтверждением)
            </button>
          </form>

          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const params = {
                videoId: String(form.get('videoId') || ''),
                title: String(form.get('title') || ''),
                description: String(form.get('description') || ''),
                privacyStatus: String(form.get('privacyStatus') || ''),
              };
              void runJson('video.update', params);
            }}
          >
            <label>
              Video ID
              <input
                name="videoId"
                value={videoId}
                onChange={(event) => setVideoId(event.target.value)}
                required
              />
            </label>
            <label>
              Новое название
              <input name="title" maxLength={100} />
            </label>
            <label>
              Новое описание
              <textarea name="description" maxLength={5000} rows={2} />
            </label>
            <label>
              Приватность
              <select name="privacyStatus" defaultValue="">
                <option value="">не менять</option>
                <option value="private">private</option>
                <option value="unlisted">unlisted</option>
                <option value="public">public</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !managementAllowed}>
              Обновить метаданные
            </button>
          </form>

          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!thumbFile) return;
              const form = new FormData();
              form.set('videoId', videoId);
              form.set('file', thumbFile);
              void runForm('video.thumbnail', form, { videoId });
            }}
          >
            <label>
              Обложка (JPG/PNG ≤ 2 МБ)
              <input
                type="file"
                accept="image/jpeg,image/png"
                onChange={(event) => setThumbFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={busy || !managementAllowed || !videoId || !thumbFile}>
              Установить обложку
            </button>
          </form>
        </article>

        <article>
          <h3>Плейлисты</h3>
          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void runJson('playlist.create', {
                title: String(form.get('title') || ''),
                description: String(form.get('description') || ''),
                privacyStatus: String(form.get('privacyStatus') || 'private'),
              });
            }}
          >
            <label>
              Название
              <input name="title" maxLength={150} required />
            </label>
            <label>
              Описание
              <textarea name="description" maxLength={5000} rows={2} />
            </label>
            <label>
              Приватность
              <select name="privacyStatus" defaultValue="private">
                <option value="private">private</option>
                <option value="unlisted">unlisted</option>
                <option value="public">public</option>
              </select>
            </label>
            <button type="submit" disabled={busy || !managementAllowed}>
              Создать плейлист
            </button>
          </form>

          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void runJson('playlist.add', {
                playlistId: String(form.get('playlistId') || ''),
                videoId: String(form.get('videoId') || videoId),
              });
            }}
          >
            <label>
              Playlist ID
              <input name="playlistId" required />
            </label>
            <label>
              Video ID
              <input name="videoId" defaultValue={videoId} required />
            </label>
            <button type="submit" disabled={busy || !managementAllowed}>
              Добавить видео
            </button>
          </form>

          <button
            type="button"
            className="pw-analytics-button pw-analytics-button--quiet"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void postJson('playlist.list', {})
                .then(({ response, payload }) => {
                  if (response.ok)
                    setPlaylists((payload.result as Array<Record<string, unknown>>) || []);
                  else
                    setError(payload.message || payload.error || 'Не удалось получить плейлисты.');
                })
                .finally(() => setBusy(false));
            }}
          >
            Показать плейлисты
          </button>
          {playlists.length > 0 && (
            <ul>
              {playlists.map((item) => (
                <li key={String(item.playlistId)}>
                  {String(item.title || item.playlistId)} · {String(item.privacyStatus || '—')}
                </li>
              ))}
            </ul>
          )}
        </article>

        <article>
          <h3>Комментарии</h3>
          <div className="pw-analytics-card-actions">
            <button
              type="button"
              className="pw-analytics-button pw-analytics-button--quiet"
              disabled={busy || !videoId}
              onClick={() => {
                setBusy(true);
                void postJson('comment.list', { videoId })
                  .then(({ response, payload }) => {
                    if (response.ok)
                      setComments((payload.result as Array<Record<string, unknown>>) || []);
                    else
                      setError(
                        payload.message || payload.error || 'Не удалось получить комментарии.'
                      );
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Показать комментарии
            </button>
          </div>
          {comments.length > 0 && (
            <ul>
              {comments.map((item) => (
                <li key={String(item.commentId)}>
                  <strong>{String(item.authorDisplayName || '—')}</strong>:{' '}
                  {String(item.text || '').slice(0, 180)}
                  <div className="pw-analytics-card-actions">
                    <button
                      type="button"
                      disabled={busy || !managementAllowed}
                      onClick={() => {
                        const text = window.prompt('Ответ на комментарий');
                        if (!text) return;
                        void runJson('comment.reply', {
                          parentCommentId: String(item.commentId),
                          text,
                        });
                      }}
                    >
                      Ответить
                    </button>
                    <button
                      type="button"
                      disabled={busy || !managementAllowed}
                      onClick={() =>
                        void runJson('comment.moderate', {
                          commentId: String(item.commentId),
                          moderationStatus: 'heldForReview',
                        })
                      }
                    >
                      На модерацию
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article>
          <h3>Субтитры</h3>
          <div className="pw-analytics-card-actions">
            <button
              type="button"
              className="pw-analytics-button pw-analytics-button--quiet"
              disabled={busy || !videoId}
              onClick={() => {
                setBusy(true);
                void postJson('caption.list', { videoId })
                  .then(({ response, payload }) => {
                    if (response.ok)
                      setCaptions((payload.result as Array<Record<string, unknown>>) || []);
                    else
                      setError(payload.message || payload.error || 'Не удалось получить субтитры.');
                  })
                  .finally(() => setBusy(false));
              }}
            >
              Показать субтитры
            </button>
          </div>
          {captions.length > 0 && (
            <ul>
              {captions.map((item) => (
                <li key={String(item.captionId)}>
                  {String(item.language || '—')} · {String(item.name || item.captionId)}
                </li>
              ))}
            </ul>
          )}
          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!captionFile) return;
              const form = new FormData(event.currentTarget);
              const language = String(form.get('language') || '');
              const name = String(form.get('name') || '');
              const upload = new FormData();
              upload.set('videoId', videoId);
              upload.set('language', language);
              upload.set('name', name);
              upload.set('file', captionFile);
              void runForm('caption.upload', upload, { videoId, language, name });
            }}
          >
            <label>
              Язык (например ru)
              <input name="language" maxLength={20} required />
            </label>
            <label>
              Название дорожки
              <input name="name" maxLength={150} />
            </label>
            <label>
              Файл VTT/SRT
              <input
                type="file"
                accept=".vtt,.srt,text/vtt"
                onChange={(event) => setCaptionFile(event.target.files?.[0] || null)}
              />
            </label>
            <button type="submit" disabled={busy || !managementAllowed || !videoId || !captionFile}>
              Загрузить субтитры
            </button>
          </form>
        </article>
      </div>

      {result !== null && (
        <details>
          <summary>Результат последней операции</summary>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      )}
    </section>
  );
}
