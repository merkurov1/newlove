'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { adminFetch, readAdminAuthSnapshot, type AdminAuthSnapshot } from '@/lib/auth/adminFetch';

type Connection = {
  id: string;
  googleAccountEmail: string;
  googleAccountName: string | null;
  status: string;
  scopes: string[];
  connectedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  hasRefreshToken: boolean;
};

type Channel = {
  id: string;
  connectionId: string;
  channelId: string;
  title: string | null;
  handle: string | null;
  thumbnailUrl: string | null;
  status: string;
  subscriberCount: number | null;
  viewCount: number | null;
  videoCount: number | null;
};

type Binding = {
  id: string;
  projectSlug: string;
  channelRecordId: string;
  channelId: string;
  isActive: boolean;
};

type SchemaStatus = {
  ready?: boolean;
  reason?: string;
  missingTables?: string[];
  code?: string | null;
};

type StatusPayload = {
  schemaReady?: boolean;
  schema?: SchemaStatus;
  viewer?: { id: string; email: string | null; role: string };
  project?: string;
  projects?: Array<{ slug: string; name: string; defaultChannelHandle: string | null }>;
  connections?: Connection[];
  channels?: Channel[];
  bindings?: Binding[];
  activeByProject?: Record<string, { binding: Binding; channel: Channel } | undefined>;
  active?: { binding: Binding; channel: Channel; connection: Connection | null } | null;
  config?: { connectUrl: string; redirectUri: string; scopes: string[] };
  message?: string;
  error?: string;
  code?: string;
  retryable?: boolean;
};

type StatusError = {
  message: string;
  code: string | null;
  httpStatus: number | null;
};

type Metric = {
  key: string;
  label: string;
  value: number | null;
  unit: 'count' | 'seconds' | 'percent';
  available: boolean;
  unavailableReason?: string;
};

type AnalyticsReport = {
  bound: boolean;
  reason?: string;
  channel?: {
    id: string;
    title: string | null;
    handle: string | null;
    publicSubscribers: number | null;
    publicViews: number | null;
    publicVideoCount: number | null;
  };
  connection?: { googleAccountEmail: string; status: string };
  period?: { start: string; end: string; timezone: string; label: string };
  metrics?: Metric[];
  impressions?: Metric[];
  topVideos?: Array<{
    videoId: string;
    title: string | null;
    url: string;
    views: number | null;
    watchMinutes: number | null;
    averageViewDuration: number | null;
    likes: number | null;
    comments: number | null;
  }>;
  series?: Array<{ date: string; views: number | null; watchMinutes: number | null }>;
  fetchedAt?: string;
  cached?: boolean;
  cacheAgeSeconds?: number | null;
  cacheTtlSeconds?: number;
  reportingDelayDays?: number;
  provenance?: { dataApi: string[]; analyticsApi: string[]; quotaStrategy: string };
  limitations?: string[];
};

type CatalogItem = {
  videoId: string;
  title: string;
  descriptionPreview: string;
  tags: string[];
  categoryId: string | null;
  defaultLanguage: string | null;
  privacyStatus: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  url: string;
};

type CatalogPage = {
  channel: { id: string; title: string | null; handle: string | null };
  items: CatalogItem[];
  nextPageToken: string | null;
  pageToken: string | null;
  totalResults: number | null;
};

type VideoDetail = {
  videoId: string;
  channelId: string | null;
  title: string;
  description: string;
  tags: string[];
  categoryId: string | null;
  defaultLanguage: string | null;
  defaultAudioLanguage: string | null;
  privacyStatus: string | null;
  uploadStatus: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
};

type Analysis = {
  issues: Array<{ code: string; field: string; severity: string; message: string }>;
  suggested?: Record<string, unknown>;
  proposedChanges?: { title?: string; description?: string; tags?: string[] };
  confidence: string;
  needsContext: boolean;
  contextRequest: string | null;
  summary: string;
  limitations: string[];
};

type DiffRow = {
  field: string;
  before: string | string[];
  after: string | string[];
  changed: boolean;
};

type Confirmation = {
  token: string;
  expiresAt: string;
  baseFingerprint: string;
  diff: DiffRow[];
};

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultPeriod(): { start: string; end: string } {
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: isoDate(start), end: isoDate(end) };
}

function formatNumber(value: number | null, unit: Metric['unit']): string {
  if (value === null || !Number.isFinite(value)) return '—';

  if (unit === 'seconds') {
    const total = Math.round(value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  if (unit === 'percent') return `${value.toFixed(2)}%`;

  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU');
}

function tagsToInput(tags: string[]): string {
  return tags.join(', ');
}

function inputToTags(value: string): string[] {
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

type StatusFailure = Error & { httpStatus?: number | null; code?: string | null };

function statusFailure(
  message: string,
  httpStatus: number | null,
  code: string | null
): StatusFailure {
  const error = new Error(message) as StatusFailure;
  error.httpStatus = httpStatus;
  error.code = code;
  return error;
}

function describeStatusError(error: unknown): StatusError {
  if (error && typeof error === 'object') {
    const candidate = error as StatusFailure;
    const httpStatus = typeof candidate.httpStatus === 'number' ? candidate.httpStatus : null;
    const code = typeof candidate.code === 'string' ? candidate.code : null;

    if (httpStatus !== null || code) {
      return {
        message: candidate.message || 'Не удалось прочитать состояние YouTube.',
        code,
        httpStatus,
      };
    }
  }

  if (error instanceof TypeError) {
    return {
      message: 'Сеть недоступна или запрос был прерван. Проверьте соединение и повторите.',
      code: 'network_error',
      httpStatus: null,
    };
  }

  return {
    message:
      error instanceof Error && error.message
        ? error.message
        : 'Не удалось прочитать состояние YouTube.',
    code: null,
    httpStatus: null,
  };
}

function formatStatusError(error: StatusError): string {
  const details = [
    error.httpStatus !== null ? `HTTP ${error.httpStatus}` : null,
    error.code ? `код: ${error.code}` : null,
  ].filter(Boolean);

  return `${error.message}${details.length > 0 ? ` (${details.join(', ')})` : ''}`;
}

export default function YouTubeProjectWorkspace({
  project,
  notice,
}: {
  project: string;
  notice?: string | null;
}) {
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [statusError, setStatusError] = useState<StatusError | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [statusCheckedAt, setStatusCheckedAt] = useState<string | null>(null);
  const statusRequestId = useRef(0);
  const [busy, setBusy] = useState(false);
  const [connectBusy, setConnectBusy] = useState(false);
  const [authSnapshot, setAuthSnapshot] = useState<AdminAuthSnapshot | null>(null);
  const [message, setMessage] = useState<string | null>(notice || null);
  const [error, setError] = useState<string | null>(null);

  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');

  const [period, setPeriod] = useState(defaultPeriod);
  const [analytics, setAnalytics] = useState<AnalyticsReport | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const [catalog, setCatalog] = useState<CatalogPage | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [pageTokens, setPageTokens] = useState<Array<string | null>>([null]);
  const [pageIndex, setPageIndex] = useState(0);

  const [video, setVideo] = useState<VideoDetail | null>(null);
  const [fingerprint, setFingerprint] = useState('');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [form, setForm] = useState({ title: '', description: '', tags: '' });
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [lastSaved, setLastSaved] = useState<{
    changedFields: string[];
    preservedFields: string[];
  } | null>(null);

  const connections = useMemo(() => status?.connections ?? [], [status?.connections]);
  const channels = useMemo(() => status?.channels ?? [], [status?.channels]);
  const projects = useMemo(() => status?.projects ?? [], [status?.projects]);

  const channelsForConnection = useMemo(
    () => channels.filter((channel) => channel.connectionId === selectedConnectionId),
    [channels, selectedConnectionId]
  );

  const active = status?.active ?? null;
  const selectedChannel = channelsForConnection.find((channel) => channel.id === selectedChannelId);
  // Keep connect actionable even when the state request itself failed or is
  // still loading; the route performs its own auth/schema/preflight checks and
  // returns a visible notice on failure.
  const connectUrl =
    status?.config?.connectUrl ||
    `/api/admin/youtube/channels/connect?project=${encodeURIComponent(project)}`;

  const loadStatus = useCallback(async () => {
    const requestId = ++statusRequestId.current;

    setStatusLoading(true);
    setStatusError(null);

    try {
      const response = await adminFetch(
        `/api/admin/youtube/channels?project=${encodeURIComponent(project)}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json().catch(() => ({}))) as StatusPayload;

      if (!response.ok) {
        const safeMessage =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message
            : 'Сервер не вернул состояние YouTube.';
        const code =
          typeof payload.error === 'string'
            ? payload.error
            : typeof payload.code === 'string'
              ? payload.code
              : 'status_request_failed';

        throw statusFailure(safeMessage, response.status, code);
      }

      if (requestId !== statusRequestId.current) return;

      setStatus(payload);
      setStatusCheckedAt(new Date().toISOString());
      setStatusError(null);

      const firstConnection = payload.connections?.[0];
      if (firstConnection) {
        setSelectedConnectionId((current) => current || firstConnection.id);
        const firstChannel = payload.channels?.find(
          (channel) => channel.connectionId === firstConnection.id
        );
        if (firstChannel) {
          setSelectedChannelId((current) => current || firstChannel.id);
        }
      }
    } catch (loadError) {
      if (requestId !== statusRequestId.current) return;
      setStatusError(describeStatusError(loadError));
    } finally {
      if (requestId === statusRequestId.current) {
        setStatusLoading(false);
      }
    }
  }, [project]);

  useEffect(() => {
    let active = true;

    void readAdminAuthSnapshot().then((snapshot) => {
      if (active) setAuthSnapshot(snapshot);
    });

    return () => {
      active = false;
    };
  }, []);

  /**
   * Starts Google consent from the admin UI.
   *
   * The route is called with `format=json` so the request can carry the
   * Bearer session (a plain <a> navigation cannot). The route still sets the
   * short-lived nonce cookie on the JSON response; the top-level navigation to
   * Google happens only after the authenticated request has succeeded. This
   * keeps the existing redirect flow for non-JS navigation.
   */
  const startConnect = useCallback(
    async (loginHint?: string | null) => {
      if (connectBusy) return;

      setConnectBusy(true);
      setError(null);

      try {
        const url = new URL(connectUrl, window.location.origin);
        url.searchParams.set('format', 'json');
        if (loginHint) url.searchParams.set('login_hint', loginHint);
        if (loginHint) url.searchParams.set('select_account', 'true');

        const response = await adminFetch(`${url.pathname}${url.search}`);
        const payload = (await response.json().catch(() => ({}))) as {
          ok?: boolean;
          consentUrl?: string;
          error?: string;
          message?: string;
        };

        if (!response.ok || payload.ok === false) {
          throw statusFailure(
            payload.message || payload.error || 'Сервер не разрешил подключение Google.',
            response.status,
            payload.error || 'connect_failed'
          );
        }

        if (
          typeof payload.consentUrl === 'string' &&
          /^https:\/\/[^\s]+$/i.test(payload.consentUrl)
        ) {
          window.location.assign(payload.consentUrl);
          return;
        }

        throw statusFailure(
          'Сервер не вернул URL согласия Google.',
          response.status,
          'consent_url_missing'
        );
      } catch (connectError) {
        setError(formatStatusError(describeStatusError(connectError)));
        setConnectBusy(false);
      }
    },
    [connectBusy, connectUrl]
  );

  useEffect(() => {
    setStatus(null);
    setStatusError(null);
    setStatusCheckedAt(null);
    setAnalytics(null);
    setCatalog(null);
    setVideo(null);
    setAnalysis(null);
    setDiff(null);
    setConfirmation(null);
    setSelectedConnectionId('');
    setSelectedChannelId('');
    setPageTokens([null]);
    setPageIndex(0);
    void loadStatus();
  }, [project, loadStatus]);

  useEffect(() => {
    if (!selectedConnectionId) return;
    const list = channels.filter((channel) => channel.connectionId === selectedConnectionId);
    if (list.length > 0 && !list.some((channel) => channel.id === selectedChannelId)) {
      setSelectedChannelId(list[0].id);
    }
  }, [channels, selectedChannelId, selectedConnectionId]);

  const runChannelAction = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const response = await adminFetch('/api/admin/youtube/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        message?: string;
        revoked?: boolean;
      };

      if (!response.ok) {
        throw statusFailure(
          payload.message || payload.error || 'Действие с YouTube не выполнено.',
          response.status,
          payload.code || payload.error || 'channel_action_failed'
        );
      }

      setMessage(
        body.action === 'bind'
          ? 'Канал привязан к проекту.'
          : body.action === 'unbind'
            ? 'Привязка проекта снята.'
            : body.action === 'disconnect'
              ? payload.revoked
                ? 'Google-доступ отозван, токен удалён.'
                : 'Локальный токен удалён; Google не подтвердил отзыв.'
              : 'Список каналов обновлён.'
      );
      await loadStatus();
    } catch (actionError) {
      setError(formatStatusError(describeStatusError(actionError)));
    } finally {
      setBusy(false);
    }
  };

  const loadAnalytics = useCallback(
    async (fresh = false) => {
      setAnalyticsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          project,
          start: period.start,
          end: period.end,
          ...(fresh ? { fresh: '1' } : {}),
        });
        const response = await adminFetch(
          `/api/admin/youtube/channels/analytics?${params.toString()}`,
          {
            cache: 'no-store',
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          report?: AnalyticsReport;
          message?: string;
          error?: string;
        };

        if (!response.ok || !payload.report) {
          throw new Error(payload.message || payload.error || 'analytics');
        }

        setAnalytics(payload.report);
      } catch (analyticsError) {
        setAnalytics(null);
        setError(
          analyticsError instanceof Error
            ? analyticsError.message
            : 'Не удалось получить аналитику канала.'
        );
      } finally {
        setAnalyticsLoading(false);
      }
    },
    [period.end, period.start, project]
  );

  useEffect(() => {
    if (!active) return;
    void loadAnalytics(false);
    // Reload only when the binding or selected period changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.binding.id, project]);

  const loadCatalog = useCallback(
    async (token: string | null) => {
      setCatalogLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ project, pageSize: '25' });
        if (token) params.set('pageToken', token);
        const response = await adminFetch(
          `/api/admin/youtube/channels/videos?${params.toString()}`,
          {
            cache: 'no-store',
          }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          page?: CatalogPage;
          message?: string;
          error?: string;
        };

        if (!response.ok || !payload.page) {
          throw new Error(payload.message || payload.error || 'catalog');
        }

        setCatalog(payload.page);
      } catch (catalogError) {
        setCatalog(null);
        setError(
          catalogError instanceof Error
            ? catalogError.message
            : 'Не удалось получить каталог видео.'
        );
      } finally {
        setCatalogLoading(false);
      }
    },
    [project]
  );

  useEffect(() => {
    if (!active) return;
    setPageIndex(0);
    setPageTokens([null]);
    void loadCatalog(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.binding.id, loadCatalog]);

  const goNext = () => {
    if (!catalog?.nextPageToken) return;
    const nextIndex = pageIndex + 1;
    const token = catalog.nextPageToken;
    setPageTokens((current) => {
      const copy = current.slice(0, nextIndex);
      copy[nextIndex] = token;
      return copy;
    });
    setPageIndex(nextIndex);
    void loadCatalog(token);
  };

  const goPrevious = () => {
    if (pageIndex === 0) return;
    const nextIndex = pageIndex - 1;
    setPageIndex(nextIndex);
    void loadCatalog(pageTokens[nextIndex] ?? null);
  };

  const openVideo = async (videoId: string) => {
    setEditorBusy(true);
    setError(null);
    setMessage(null);
    setDiff(null);
    setConfirmation(null);
    setLastSaved(null);
    try {
      const response = await adminFetch(
        `/api/admin/youtube/channels/videos/${encodeURIComponent(videoId)}?project=${encodeURIComponent(project)}`,
        { cache: 'no-store' }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        video?: VideoDetail;
        fingerprint?: string;
        analysis?: Analysis;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.video) {
        throw new Error(payload.message || payload.error || 'video');
      }

      setVideo(payload.video);
      setFingerprint(payload.fingerprint || '');
      setAnalysis(payload.analysis || null);
      setForm({
        title: payload.video.title,
        description: payload.video.description,
        tags: tagsToInput(payload.video.tags),
      });
    } catch (videoError) {
      setError(videoError instanceof Error ? videoError.message : 'Не удалось открыть видео.');
    } finally {
      setEditorBusy(false);
    }
  };

  const submitPreview = async (action: 'preview' | 'update') => {
    if (!video) return;
    setEditorBusy(true);
    setError(null);
    setMessage(null);
    try {
      const changes = {
        title: form.title,
        description: form.description,
        tags: inputToTags(form.tags),
      };
      const response = await adminFetch(
        `/api/admin/youtube/channels/videos/${encodeURIComponent(video.videoId)}?project=${encodeURIComponent(project)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, changes }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        confirmationRequired?: boolean;
        confirmationToken?: string;
        expiresAt?: string;
        baseFingerprint?: string;
        diff?: DiffRow[];
        message?: string;
        error?: string;
        changedFields?: string[];
        preservedFields?: string[];
      };

      if (payload.diff) setDiff(payload.diff);

      if (response.status === 409 && payload.confirmationRequired && payload.confirmationToken) {
        setConfirmation({
          token: payload.confirmationToken,
          expiresAt: payload.expiresAt || '',
          baseFingerprint: payload.baseFingerprint || fingerprint,
          diff: payload.diff || [],
        });
        setMessage('Diff готов. Ничего не записано. Подтвердите изменение отдельной кнопкой ниже.');
        return;
      }

      if (!response.ok || payload.error) {
        throw new Error(payload.message || payload.error || 'preview');
      }

      setConfirmation(null);
      setMessage(
        action === 'preview'
          ? 'Предпросмотр готов. На YouTube ничего не отправлено.'
          : 'Предпросмотр готов.'
      );
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : 'Не удалось построить diff.');
    } finally {
      setEditorBusy(false);
    }
  };

  const applyConfirmed = async () => {
    if (!video || !confirmation) return;
    setEditorBusy(true);
    setError(null);
    setMessage(null);
    try {
      const changes = {
        title: form.title,
        description: form.description,
        tags: inputToTags(form.tags),
      };
      const response = await adminFetch(
        `/api/admin/youtube/channels/videos/${encodeURIComponent(video.videoId)}?project=${encodeURIComponent(project)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update',
            changes,
            baseFingerprint: confirmation.baseFingerprint,
            confirmationToken: confirmation.token,
          }),
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        changedFields?: string[];
        preservedFields?: string[];
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message || payload.error || 'update');
      }

      setLastSaved({
        changedFields: payload.changedFields || [],
        preservedFields: payload.preservedFields || [],
      });
      setConfirmation(null);
      setMessage(
        `Изменение записано на YouTube. Поля: ${(payload.changedFields || []).join(', ') || '—'}.`
      );
      await openVideo(video.videoId);
      await loadCatalog(pageTokens[pageIndex] ?? null);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Изменение не записано.');
    } finally {
      setEditorBusy(false);
    }
  };

  return (
    <div>
      <section className="pw-analytics-card" style={{ marginBottom: 18 }}>
        <div className="pw-analytics-card-head">
          <div>
            <span
              className={`pw-dot ${active ? 'pw-dot-growth' : 'pw-dot-attention'}`}
              aria-hidden="true"
            />
            <h2>YouTube · {projects.find((item) => item.slug === project)?.name || project}</h2>
          </div>
          <span className="pw-analytics-badge" aria-live="polite">
            {statusLoading && !status
              ? 'проверяю…'
              : status?.schemaReady === false
                ? 'миграция не применена'
                : active
                  ? 'канал привязан'
                  : 'канал не привязан'}
          </span>
        </div>

        {status?.schemaReady === false && (
          <div className="pw-analytics-error" role="alert">
            <p>
              {status.message ||
                'Аддитивная миграция multi-channel YouTube ещё не применена на этом окружении.'}
            </p>
            {status.schema?.missingTables && status.schema.missingTables.length > 0 && (
              <p className="pw-analytics-hint">
                Нет таблиц: <code>{status.schema.missingTables.join(', ')}</code>
              </p>
            )}
            {status.schema?.code && (
              <p className="pw-analytics-hint">
                Код ответа базы: <code>{status.schema.code}</code>
              </p>
            )}
          </div>
        )}

        <p className="pw-analytics-hint">
          Один Google-аккаунт может владеть несколькими каналами. Один канал можно привязать к
          нескольким проектам. Токены хранятся только на сервере и не возвращаются в браузер.
        </p>

        <p className="pw-analytics-hint">
          Администратор:{' '}
          <strong>{status?.viewer?.email || authSnapshot?.email || 'сессия не определена'}</strong>
          {authSnapshot
            ? authSnapshot.hasSession
              ? authSnapshot.expiresAtMs
                ? ` · сессия действует до ${formatDate(
                    new Date(authSnapshot.expiresAtMs).toISOString()
                  )}`
                : ' · сессия найдена'
              : ' · браузерная сессия не найдена'
            : null}
        </p>

        <div className="pw-analytics-card-actions">
          <button
            type="button"
            className="pw-analytics-button"
            disabled={connectBusy || busy}
            aria-busy={connectBusy}
            onClick={() => void startConnect()}
          >
            {connectBusy ? 'Открываю Google…' : 'Подключить Google-аккаунт'}
          </button>
          <button
            type="button"
            className="pw-analytics-button pw-analytics-button--quiet"
            disabled={statusLoading || busy}
            aria-busy={statusLoading}
            onClick={() => void loadStatus()}
          >
            {statusLoading ? 'Обновление…' : 'Обновить состояние'}
          </button>
        </div>

        {statusLoading && (
          <p className="pw-analytics-hint" role="status" aria-live="polite">
            Читаю состояние YouTube…
          </p>
        )}

        {statusError && (
          <div className="pw-analytics-error" role="alert">
            <p>{formatStatusError(statusError)}</p>
            {statusError.httpStatus === 401 ? (
              <p className="pw-analytics-hint">
                Сервер не подтвердил сессию администратора. Войдите заново и вернитесь на эту
                страницу; токены Google при этом не затрагиваются.
              </p>
            ) : null}
            <div className="pw-analytics-card-actions">
              <button
                type="button"
                className="pw-analytics-button pw-analytics-button--quiet"
                disabled={statusLoading}
                onClick={() => void loadStatus()}
              >
                {statusLoading ? 'Повторяю…' : 'Повторить'}
              </button>
              {statusError.httpStatus === 401 ? (
                <a
                  className="pw-analytics-button pw-analytics-button--quiet"
                  href={`/login?next=${encodeURIComponent('/admin/pierrot/youtube')}`}
                >
                  Войти заново
                </a>
              ) : null}
            </div>
          </div>
        )}

        {!statusLoading && !statusError && statusCheckedAt && (
          <p className="pw-analytics-hint" role="status">
            Состояние обновлено: {formatDate(statusCheckedAt)}
          </p>
        )}

        {message && <p className="pw-analytics-action">{message}</p>}
        {error && <p className="pw-analytics-error">{error}</p>}

        {status?.config?.redirectUri && (
          <p className="pw-analytics-hint">
            Redirect URI для Google Cloud: <code>{status.config.redirectUri}</code>
          </p>
        )}

        {active && (
          <div className="pw-analytics-config">
            <h3>Активный канал проекта</h3>
            <p>
              <strong>
                {active.channel.title || active.channel.handle || active.channel.channelId}
              </strong>{' '}
              · {active.channel.handle || '—'} · {active.channel.channelId}
            </p>
            <p className="pw-analytics-hint">
              Google-аккаунт: {active.connection?.googleAccountEmail || '—'} · статус:{' '}
              {active.connection?.status || '—'}
            </p>
            <div className="pw-analytics-card-actions">
              <button
                type="button"
                className="pw-analytics-button pw-analytics-button--quiet"
                disabled={busy}
                onClick={() => void runChannelAction({ action: 'unbind', project })}
              >
                Снять привязку проекта
              </button>
            </div>
          </div>
        )}

        {status?.activeByProject && Object.keys(status.activeByProject).length > 0 && (
          <p className="pw-analytics-hint">
            Общий канал используется:{' '}
            {Object.entries(status.activeByProject)
              .filter(([slug]) => slug !== project)
              .map(
                ([slug, value]) =>
                  `${projects.find((p) => p.slug === slug)?.name || slug}: ${value?.channel.title || value?.channel.channelId}`
              )
              .join(' · ') || 'других проектов нет'}
          </p>
        )}

        <h3>Подключённые Google-аккаунты</h3>
        {connections.length === 0 ? (
          <p className="pw-analytics-hint">Пока нет ни одного подключения.</p>
        ) : (
          <ul>
            {connections.map((connection) => {
              const needsReconnect =
                connection.status !== 'connected' ||
                !connection.hasRefreshToken ||
                Boolean(connection.lastErrorCode);
              const canRefresh = connection.status !== 'revoked';
              const canDisconnect = connection.status !== 'revoked';

              return (
                <li key={connection.id}>
                  <strong>{connection.googleAccountEmail}</strong> · {connection.status} ·{' '}
                  {connection.scopes.length} scopes · каналов:{' '}
                  {channels.filter((channel) => channel.connectionId === connection.id).length}
                  {connection.hasRefreshToken ? null : ' · нет refresh token'}
                  {connection.lastErrorCode ? ` · ошибка: ${connection.lastErrorCode}` : ''}
                  {connection.lastErrorMessage ? (
                    <p className="pw-analytics-hint">{connection.lastErrorMessage}</p>
                  ) : null}
                  <div className="pw-analytics-card-actions">
                    {canRefresh ? (
                      <button
                        type="button"
                        className="pw-analytics-button pw-analytics-button--quiet"
                        disabled={busy}
                        onClick={() =>
                          void runChannelAction({ action: 'refresh', connectionId: connection.id })
                        }
                      >
                        Обновить каналы
                      </button>
                    ) : null}
                    {needsReconnect ? (
                      <button
                        type="button"
                        className="pw-analytics-button pw-analytics-button--quiet"
                        disabled={connectBusy || busy}
                        onClick={() => void startConnect(connection.googleAccountEmail)}
                      >
                        Переподключить этот аккаунт
                      </button>
                    ) : null}
                    {canDisconnect ? (
                      <button
                        type="button"
                        className="pw-analytics-button pw-analytics-button--quiet"
                        disabled={busy}
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Отозвать Google-доступ для ${connection.googleAccountEmail}? Другие подключённые аккаунты не затрагиваются.`
                          );
                          if (!confirmed) return;
                          void runChannelAction({
                            action: 'disconnect',
                            connectionId: connection.id,
                          });
                        }}
                      >
                        Отозвать доступ
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <h3>Каналы, доступные аккаунту</h3>
        {channels.length === 0 ? (
          <p className="pw-analytics-hint">
            После подключения Google-аккаунта здесь появятся все каналы, включая Brand Accounts.
          </p>
        ) : (
          <>
            <div className="pw-analytics-form" style={{ maxWidth: 560 }}>
              <label>
                Google-аккаунт
                <select
                  value={selectedConnectionId}
                  onChange={(event) => setSelectedConnectionId(event.target.value)}
                >
                  {connections.map((connection) => (
                    <option key={connection.id} value={connection.id}>
                      {connection.googleAccountEmail}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Канал
                <select
                  value={selectedChannelId}
                  onChange={(event) => setSelectedChannelId(event.target.value)}
                >
                  {channelsForConnection.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.title || channel.handle || channel.channelId} · {channel.channelId}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="pw-analytics-button"
                disabled={busy || !selectedChannel}
                onClick={() =>
                  selectedChannel &&
                  void runChannelAction({
                    action: 'bind',
                    project,
                    channelRecordId: selectedChannel.id,
                  })
                }
              >
                Привязать канал к проекту
              </button>
            </div>
            <ul>
              {channels.map((channel) => (
                <li key={channel.id}>
                  {channel.title || '—'} · {channel.handle || '—'} · {channel.channelId} ·{' '}
                  {channel.status} · подписчики: {channel.subscriberCount ?? '—'} · видео:{' '}
                  {channel.videoCount ?? '—'}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {active && (
        <section className="pw-analytics-card" style={{ marginBottom: 18 }}>
          <div className="pw-analytics-card-head">
            <h2>Аналитика канала</h2>
            <span className="pw-analytics-badge">
              {analytics?.cached ? `кэш ${analytics.cacheAgeSeconds ?? 0} с` : 'свежий запрос'}
            </span>
          </div>

          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              void loadAnalytics(true);
            }}
          >
            <label>
              Начало
              <input
                type="date"
                value={period.start}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, start: event.target.value }))
                }
              />
            </label>
            <label>
              Конец
              <input
                type="date"
                value={period.end}
                onChange={(event) =>
                  setPeriod((current) => ({ ...current, end: event.target.value }))
                }
              />
            </label>
            <button type="submit" className="pw-analytics-button" disabled={analyticsLoading}>
              {analyticsLoading ? 'Загрузка…' : 'Обновить без кэша'}
            </button>
            <button
              type="button"
              className="pw-analytics-button pw-analytics-button--quiet"
              disabled={analyticsLoading}
              onClick={() => void loadAnalytics(false)}
            >
              Читать из кэша
            </button>
          </form>

          {analyticsLoading && <p className="pw-analytics-hint">Загрузка аналитики…</p>}

          {analytics && !analytics.bound && <p className="pw-analytics-hint">{analytics.reason}</p>}

          {analytics?.bound && (
            <>
              <p className="pw-analytics-hint">
                {analytics.channel?.title || analytics.channel?.id} · период{' '}
                {analytics.period?.label} · часовой пояс {analytics.period?.timezone} · обновлено{' '}
                {formatDate(analytics.fetchedAt)} · задержка API ≈ {analytics.reportingDelayDays}{' '}
                дн.
              </p>

              <div className="pw-analytics-grid" aria-label="Метрики канала">
                {(analytics.metrics ?? []).map((item) => (
                  <article key={item.key}>
                    <h3>{item.label}</h3>
                    <p className="pw-analytics-id" title={item.unavailableReason || ''}>
                      {item.available ? formatNumber(item.value, item.unit) : '—'}
                    </p>
                    {!item.available && (
                      <p className="pw-analytics-hint">
                        {item.unavailableReason || 'Метрика недоступна; это не ноль.'}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <h3>Показы и CTR</h3>
              <div className="pw-analytics-grid">
                {(analytics.impressions ?? []).map((item) => (
                  <article key={item.key}>
                    <h3>{item.label}</h3>
                    <p className="pw-analytics-id" title={item.unavailableReason || ''}>
                      {item.available ? formatNumber(item.value, item.unit) : '—'}
                    </p>
                    {!item.available && (
                      <p className="pw-analytics-hint">
                        {item.unavailableReason || 'Метрика недоступна; это не ноль.'}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <h3>Топ видео за период</h3>
              {(analytics.topVideos ?? []).length === 0 ? (
                <p className="pw-analytics-hint">Нет данных о видео за выбранный период.</p>
              ) : (
                <div className="pw-table-wrap">
                  <table className="pw-analytics-table">
                    <thead>
                      <tr>
                        <th>Видео</th>
                        <th>Просмотры</th>
                        <th>Минуты</th>
                        <th>AVD</th>
                        <th>Лайки</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(analytics.topVideos ?? []).map((item) => (
                        <tr key={item.videoId}>
                          <td>
                            <a href={item.url} target="_blank" rel="noreferrer">
                              {item.title || item.videoId}
                            </a>
                          </td>
                          <td>{item.views ?? '—'}</td>
                          <td>{item.watchMinutes ?? '—'}</td>
                          <td>{formatNumber(item.averageViewDuration, 'seconds')}</td>
                          <td>{item.likes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <details className="pw-analytics-details">
                <summary>Динамика по дням</summary>
                {(analytics.series ?? []).length === 0 ? (
                  <p className="pw-analytics-hint">Дневная динамика недоступна.</p>
                ) : (
                  <div className="pw-table-wrap">
                    <table className="pw-analytics-table">
                      <thead>
                        <tr>
                          <th>Дата</th>
                          <th>Просмотры</th>
                          <th>Минуты</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(analytics.series ?? []).map((row) => (
                          <tr key={row.date}>
                            <td>{row.date}</td>
                            <td>{row.views ?? '—'}</td>
                            <td>{row.watchMinutes ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </details>

              <details className="pw-analytics-details">
                <summary>Источник, кэш и ограничения</summary>
                <ul>
                  <li>Data API: {(analytics.provenance?.dataApi ?? []).join(', ') || '—'}</li>
                  <li>
                    Analytics API: {(analytics.provenance?.analyticsApi ?? []).join(', ') || '—'}
                  </li>
                  <li>Квоты: {analytics.provenance?.quotaStrategy || '—'}</li>
                  <li>
                    TTL кэша: {analytics.cacheTtlSeconds ?? '—'} с; обновлено:{' '}
                    {formatDate(analytics.fetchedAt)}
                  </li>
                  {(analytics.limitations ?? []).map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </section>
      )}

      {active && (
        <section className="pw-analytics-card" style={{ marginBottom: 18 }}>
          <div className="pw-analytics-card-head">
            <h2>Каталог видео</h2>
            <span className="pw-analytics-badge">
              {catalog?.totalResults ? `всего ${catalog.totalResults}` : 'постранично'}
            </span>
          </div>

          {catalogLoading && <p className="pw-analytics-hint">Загрузка каталога…</p>}

          {catalog && (
            <div className="pw-table-wrap">
              <table className="pw-analytics-table">
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Приватность</th>
                    <th>Язык</th>
                    <th>Теги</th>
                    <th>Просмотры</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {catalog.items.map((item) => (
                    <tr key={item.videoId}>
                      <td>
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.title || item.videoId}
                        </a>
                        <div className="pw-analytics-hint">{item.descriptionPreview || '—'}</div>
                      </td>
                      <td>{item.privacyStatus || '—'}</td>
                      <td>{item.defaultLanguage || '—'}</td>
                      <td>{item.tags.length}</td>
                      <td>{item.views ?? '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="pw-analytics-button pw-analytics-button--quiet"
                          disabled={editorBusy}
                          onClick={() => void openVideo(item.videoId)}
                        >
                          Метаданные
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="pw-analytics-card-actions">
            <button
              type="button"
              className="pw-analytics-button pw-analytics-button--quiet"
              disabled={pageIndex === 0 || catalogLoading}
              onClick={goPrevious}
            >
              Назад
            </button>
            <span className="pw-analytics-hint">Страница {pageIndex + 1}</span>
            <button
              type="button"
              className="pw-analytics-button pw-analytics-button--quiet"
              disabled={!catalog?.nextPageToken || catalogLoading}
              onClick={goNext}
            >
              Вперёд
            </button>
          </div>
        </section>
      )}

      {video && (
        <section className="pw-analytics-card">
          <div className="pw-analytics-card-head">
            <h2>Редактор метаданных</h2>
            <span className="pw-analytics-badge">
              {video.privacyStatus || '—'} · {video.videoId}
            </span>
          </div>

          <p className="pw-analytics-hint">
            Редактируются только title, description и tags. Ничего не записывается без отдельного
            подтверждения. Остальные snippet-поля сохраняются сервером.
          </p>
          <p className="pw-analytics-hint">
            Приватность: {video.privacyStatus || '—'} · upload: {video.uploadStatus || '—'} ·
            categoryId: {video.categoryId || '—'} · язык: {video.defaultLanguage || '—'} ·
            опубликовано: {formatDate(video.publishedAt)}
          </p>

          {analysis && (
            <div className="pw-analytics-config">
              <h3>Анализ</h3>
              <p>{analysis.summary}</p>
              <p className="pw-analytics-hint">Уверенность: {analysis.confidence}</p>
              {analysis.needsContext && (
                <p className="pw-analytics-action">{analysis.contextRequest}</p>
              )}
              {analysis.issues.length > 0 ? (
                <ul>
                  {analysis.issues.map((issue) => (
                    <li key={`${issue.code}-${issue.field}`}>
                      [{issue.severity}] {issue.field}: {issue.message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="pw-analytics-hint">Проблем не найдено.</p>
              )}
              <ul>
                {analysis.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
              {analysis.proposedChanges && (
                <button
                  type="button"
                  className="pw-analytics-button pw-analytics-button--quiet"
                  disabled={editorBusy}
                  onClick={() => {
                    setForm({
                      title:
                        analysis.proposedChanges?.title !== undefined
                          ? analysis.proposedChanges.title
                          : video.title,
                      description:
                        analysis.proposedChanges?.description !== undefined
                          ? analysis.proposedChanges.description
                          : video.description,
                      tags:
                        analysis.proposedChanges?.tags !== undefined
                          ? tagsToInput(analysis.proposedChanges.tags)
                          : tagsToInput(video.tags),
                    });
                    setMessage('Предложения перенесены в поля. Проверьте diff перед записью.');
                  }}
                >
                  Перенести предложения в поля
                </button>
              )}
            </div>
          )}

          <form
            className="pw-analytics-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPreview('preview');
            }}
          >
            <label>
              Title
              <input
                value={form.title}
                maxLength={100}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={form.description}
                maxLength={5000}
                rows={8}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </label>
            <label>
              Tags (через запятую)
              <input
                value={form.tags}
                onChange={(event) =>
                  setForm((current) => ({ ...current, tags: event.target.value }))
                }
              />
            </label>
            <div className="pw-analytics-card-actions">
              <button type="submit" disabled={editorBusy}>
                Показать diff
              </button>
              <button
                type="button"
                className="pw-analytics-button"
                disabled={editorBusy}
                onClick={() => void submitPreview('update')}
              >
                Запросить подтверждение
              </button>
              <button
                type="button"
                className="pw-analytics-button pw-analytics-button--quiet"
                disabled={editorBusy}
                onClick={() => {
                  setVideo(null);
                  setDiff(null);
                  setConfirmation(null);
                }}
              >
                Закрыть
              </button>
            </div>
          </form>

          {diff && (
            <div className="pw-table-wrap">
              <table className="pw-analytics-table">
                <thead>
                  <tr>
                    <th>Поле</th>
                    <th>Было</th>
                    <th>Станет</th>
                  </tr>
                </thead>
                <tbody>
                  {diff.map((row) => (
                    <tr key={row.field}>
                      <td>{row.field}</td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>
                        {Array.isArray(row.before) ? row.before.join(', ') : row.before || '—'}
                      </td>
                      <td style={{ whiteSpace: 'pre-wrap' }}>
                        {Array.isArray(row.after) ? row.after.join(', ') : row.after || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {confirmation && (
            <div className="pw-analytics-config" role="alert">
              <h3>Явное подтверждение записи</h3>
              <p>
                Токен подтверждения действует до {formatDate(confirmation.expiresAt)}. Это
                единственное реальное изменение; массовых операций нет.
              </p>
              <div className="pw-analytics-card-actions">
                <button
                  type="button"
                  className="pw-analytics-button"
                  disabled={editorBusy}
                  onClick={() => void applyConfirmed()}
                >
                  Записать на YouTube
                </button>
                <button
                  type="button"
                  className="pw-analytics-button pw-analytics-button--quiet"
                  disabled={editorBusy}
                  onClick={() => setConfirmation(null)}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {lastSaved && (
            <p className="pw-analytics-action">
              Записано: {lastSaved.changedFields.join(', ') || '—'}. Сохранены поля:{' '}
              {lastSaved.preservedFields.join(', ') || '—'}.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
