import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/serverAuth';
import { analyticsEncryptionKeySource } from '@/lib/analytics/website/tokenCrypto';
import {
  WEBSITE_ANALYTICS_MEASUREMENT_ID,
  getAnalyticsTimezone,
  getGoogleOAuthConfig,
  getUmamiConfig,
} from '@/lib/analytics/website/config';
import { loadSourceHealth } from '@/lib/analytics/website/dataset';
import { loadWebsiteDashboard } from '@/lib/analytics/website/dashboard';
import type { ProviderHealth } from '@/lib/analytics/website/types';
import Sparkline from '@/components/pierrot/workspace/Sparkline';

import './analytics.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ANALYTICS',
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: getAnalyticsTimezone(),
  }).format(date);
}

function statusLabel(source: ProviderHealth): string {
  if (source.status === 'connected') {
    return source.lastSyncStatus === 'partial' ? 'подключён · частично' : 'подключён';
  }
  if (source.status === 'error') return 'ошибка';
  if (source.status === 'needs_reauthorization') return 'нужно разрешение';
  if (source.status === 'not_configured') return 'не настроен';
  if (source.status === 'disabled') return 'отключён';
  return 'не подключён';
}

function tone(source: ProviderHealth): string {
  if (source.status === 'connected' && source.lastSyncStatus === 'partial') return 'attention';
  if (source.status === 'connected') return 'growth';
  if (source.status === 'error' || source.status === 'needs_reauthorization') return 'attention';
  return 'missing';
}

const ERROR_EXPLANATIONS: Record<string, string> = {
  unauthorized: 'Google-доступ истёк или отозван. Нужно заново подключить Google.',
  invalid_grant:
    'Google больше не принимает сохранённый refresh token. Нужна повторная авторизация.',
  insufficient_permissions:
    'У Google-аккаунта нет доступа к этому ресурсу или выданы не все scopes.',
  api_not_enabled: 'Нужный Google API не включён в Google Cloud Console для этого проекта.',
  resource_not_found: 'Указанный ресурс не найден или недоступен авторизованному Google-аккаунту.',
  account_mismatch:
    'GA4 Property принадлежит другому Account ID. Account ID и Property ID — разные ресурсы.',
  measurement_id_mismatch:
    'У GA4 Property нет web data stream с ожидаемым Measurement ID. Property ID, Account ID и Measurement ID не взаимозаменяемы.',
  invalid_property_id:
    'В external_id сохранён не числовой GA4 Property ID. Нужен ID property, а не Measurement ID или Account ID.',
  invalid_site_url:
    'В external_id сохранён не URL ресурса Search Console. Нужен точный site URL из sites.list.',
  discovery_empty: 'Google вернул пустой список ресурсов для этого аккаунта.',
  network_error: 'Не удалось связаться с Google API. Повторите попытку позже.',
  timeout: 'Google API не ответил вовремя. Повторите попытку позже.',
  rate_limited: 'Google временно ограничил частоту запросов. Повторите позже.',
  upstream_error: 'Временная ошибка на стороне Google.',
  redirect_uri_mismatch: 'Redirect URI не зарегистрирован в Google Cloud Console.',
  invalid_client: 'OAuth client отклонён Google. Проверьте GOOGLE_CLIENT_ID/SECRET.',
  needs_reauthorization: 'Сохранённый Google-доступ непригоден. Нужна повторная авторизация.',
  ga4_property_discovery_failed:
    'Обнаружение GA4 не удалось. Нажмите «Повторить обнаружение»; если ошибка останется, проверьте Analytics Admin API.',
  gsc_site_discovery_failed:
    'Обнаружение Search Console не удалось. Нажмите «Повторить обнаружение»; если ошибка останется, проверьте Search Console API.',
};

function explainError(code: string | null, message?: string | null): string | null {
  if (!code) return message || null;
  const label = ERROR_EXPLANATIONS[code];
  if (label && message && !message.includes(label)) return `${label} ${message}`;
  return label || message || code;
}

function discoveryBanner(
  params: SearchParams
): { tone: 'ok' | 'warn' | 'bad'; text: string } | null {
  const discovery = one(params, 'discovery');
  if (!discovery) return null;

  if (discovery === 'error') {
    const reason = one(params, 'reason') || 'discovery_failed';
    return {
      tone: 'bad',
      text: `Повторное обнаружение не выполнено: ${explainError(reason) || reason}`,
    };
  }

  const rows = discovery
    .split(',')
    .map((entry) => {
      const [provider, status] = entry.split(':');
      const label = provider === 'search_console' ? 'GSC' : 'GA4';
      return `${label}: ${status || 'unknown'}`;
    })
    .join(' · ');

  const allConnected = discovery.split(',').every((entry) => entry.endsWith(':connected'));

  return {
    tone: allConnected ? 'ok' : 'warn',
    text: `Повторное обнаружение завершено: ${rows}. Повторная авторизация не потребовалась.`,
  };
}

function banner(params: SearchParams): { tone: 'ok' | 'warn' | 'bad'; text: string } | null {
  const connect = one(params, 'connect');
  const sync = one(params, 'sync');
  const disconnected = one(params, 'disconnected');
  const discovery = discoveryBanner(params);

  if (discovery) return discovery;

  if (connect === 'success') {
    return { tone: 'ok', text: 'Google-доступ получен. Оба источника настроены только на чтение.' };
  }
  if (connect === 'partial' || connect === 'error') {
    const reason = one(params, 'reason');
    const ga = one(params, 'ga');
    const gsc = one(params, 'gsc');

    if (reason === 'redirect_uri_mismatch') {
      return {
        tone: 'bad',
        text: `Google отклонил callback: redirect URI не зарегистрирован. Добавьте ${getGoogleOAuthConfig().redirectUri} в Authorized redirect URIs того же OAuth 2.0 Client ID, который используется Supabase Auth. Без этого получить refresh token невозможно.`,
      };
    }

    if (reason === 'no_refresh_token') {
      return {
        tone: 'bad',
        text: 'Google не вернул refresh token. Повторите подключение и подтвердите доступ; при повторном согласии Google должен выдать offline-доступ.',
      };
    }

    if (reason === 'oauth_configuration_error' || reason === 'invalid_client') {
      return {
        tone: 'bad',
        text: 'Google отклонил OAuth-запрос. Проверьте OAuth consent screen, список test users (если приложение в Testing), включённые GA4 Data API и Search Console API, а также корректность GOOGLE_CLIENT_ID/SECRET.',
      };
    }

    const detail =
      explainError(reason ?? null) ||
      [ga && `GA4: ${ga}`, gsc && `GSC: ${gsc}`].filter(Boolean).join(' · ');

    return {
      tone: ga === 'connected' || gsc === 'connected' ? 'warn' : 'bad',
      text: detail
        ? `Подключение завершилось не полностью: ${detail}. Источники можно подключить отдельно.`
        : 'Подключение завершилось не полностью. Проверьте разрешения и повторите.',
    };
  }
  if (sync) {
    return { tone: 'ok', text: `Синхронизация завершена: ${sync.replace(/,/g, ' · ')}.` };
  }
  if (disconnected) {
    const google = disconnected === 'google_analytics' || disconnected === 'search_console';

    return {
      tone: 'warn',
      text: google
        ? 'Google-разрешение отозвано, сохранённые токены удалены. Google Analytics и Search Console отключены вместе, потому что используют один grant.'
        : 'Источник Umami отключён. Сохранённые данные не удалены.',
    };
  }

  return null;
}

function metaRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function metaList(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(metaRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
}

function SourceCard({
  source,
  provider,
}: {
  source: ProviderHealth;
  provider: 'google_analytics' | 'search_console' | 'umami';
}) {
  const connectHref = `/api/admin/analytics/connect?provider=${provider}`;
  const external = metaRecord(source.externalMeta);
  const discovery = metaRecord(external?.discovery);
  const properties = metaList(external?.discovered_properties);
  const sites = metaList(external?.discovered_sites);
  const scopes = source.scopes;
  const googleProvider = provider !== 'umami';
  const canRetryDiscovery =
    googleProvider &&
    source.status !== 'not_connected' &&
    source.status !== 'not_configured' &&
    source.status !== 'disabled';
  const propertyId =
    typeof external?.property_id === 'string' ? external.property_id : source.externalId;
  const accountId = typeof external?.account_id === 'string' ? external.account_id : null;
  const measurementId =
    typeof external?.matched_measurement_id === 'string' ? external.matched_measurement_id : null;
  const permissionLevel =
    typeof external?.permission_level === 'string' ? external.permission_level : null;
  const lastDiscoverySuccess =
    typeof discovery?.last_success_at === 'string' ? discovery.last_success_at : null;

  return (
    <article className="pw-analytics-card">
      <div className="pw-analytics-card-head">
        <div>
          <span className={`pw-dot pw-dot-${tone(source)}`} aria-hidden="true" />
          <h2>{source.label}</h2>
        </div>
        <span className="pw-analytics-badge">{statusLabel(source)}</span>
      </div>

      <p className="pw-analytics-id">
        {source.accountLabel || source.externalId || 'Источник не выбран'}
      </p>

      <dl className="pw-analytics-facts">
        <div>
          <dt>Последняя проверка</dt>
          <dd>{formatDate(source.lastCheckedAt)}</dd>
        </div>
        <div>
          <dt>Успешная проверка</dt>
          <dd>{formatDate(lastDiscoverySuccess)}</dd>
        </div>
        <div>
          <dt>Последняя синхронизация</dt>
          <dd>{formatDate(source.lastSyncAt)}</dd>
        </div>
        <div>
          <dt>Успешная синхронизация</dt>
          <dd>{formatDate(source.lastSuccessAt)}</dd>
        </div>
        <div>
          <dt>Данные доступны за</dt>
          <dd>
            {source.dataFrom && source.dataTo ? `${source.dataFrom} — ${source.dataTo}` : '—'}
          </dd>
        </div>
        {provider === 'google_analytics' && accountId && (
          <div>
            <dt>GA4 account</dt>
            <dd>{accountId}</dd>
          </div>
        )}
        {provider === 'google_analytics' && propertyId && (
          <div>
            <dt>GA4 property</dt>
            <dd>
              {propertyId}
              {measurementId ? ` · ${measurementId}` : ''}
            </dd>
          </div>
        )}
        {provider === 'search_console' && permissionLevel && (
          <div>
            <dt>Уровень доступа</dt>
            <dd>{permissionLevel}</dd>
          </div>
        )}
      </dl>

      <p className="pw-analytics-hint">
        OAuth scopes:{' '}
        {scopes.length
          ? scopes.map((scope) => scope.replace('https://www.googleapis.com/auth/', '')).join(', ')
          : '—'}
      </p>

      {provider === 'google_analytics' && properties.length > 0 && (
        <details className="pw-analytics-details">
          <summary>Найденные GA4 properties: {properties.length}</summary>
          <ul>
            {properties.map((property) => (
              <li key={String(property.property_id)}>
                {String(property.display_name || property.property_id)}
                {property.account_name ? ` · ${String(property.account_name)}` : ''}
                {Array.isArray(property.measurement_ids) && property.measurement_ids.length
                  ? ` · ${property.measurement_ids.join(', ')}`
                  : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {provider === 'search_console' && sites.length > 0 && (
        <details className="pw-analytics-details">
          <summary>Найденные Search Console sites: {sites.length}</summary>
          <ul>
            {sites.map((site) => (
              <li key={String(site.site_url)}>
                {String(site.site_url)}
                {site.permission_level ? ` · ${String(site.permission_level)}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}

      {source.actionRequired && <p className="pw-analytics-action">{source.actionRequired}</p>}

      {source.lastErrorCode && (
        <p className="pw-analytics-error">
          {explainError(source.lastErrorCode, source.lastErrorMessage)}
        </p>
      )}

      {source.lastErrorCode && source.lastErrorMessage && (
        <p className="pw-analytics-hint">
          Код: {source.lastErrorCode}
          {typeof discovery?.http_status === 'number' ? ` · HTTP ${discovery.http_status}` : ''}
          {typeof discovery?.google_error_code === 'string'
            ? ` · Google: ${discovery.google_error_code}`
            : ''}
          {typeof discovery?.stage === 'string' ? ` · этап: ${discovery.stage}` : ''}
        </p>
      )}

      <div className="pw-analytics-card-actions">
        {provider === 'umami' ? (
          <span className="pw-analytics-hint">
            Настраивается переменными окружения; синхронизация — кнопкой ниже.
          </span>
        ) : source.connected ? (
          <>
            <a className="pw-analytics-link" href={connectHref}>
              Переподключить
            </a>
            {canRetryDiscovery && (
              <form action="/api/admin/analytics/retry-discovery" method="post">
                <input type="hidden" name="provider" value={provider} />
                <button className="pw-analytics-button pw-analytics-button--quiet" type="submit">
                  Повторить обнаружение
                </button>
              </form>
            )}
            <form action="/api/admin/analytics/disconnect" method="post">
              <input type="hidden" name="provider" value={provider} />
              <button className="pw-analytics-button pw-analytics-button--quiet" type="submit">
                Отключить
              </button>
            </form>
          </>
        ) : (
          <a className="pw-analytics-button" href={connectHref}>
            Подключить Google
          </a>
        )}
      </div>
    </article>
  );
}

export default async function AnalyticsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdmin();

  const params = searchParams ?? {};
  const health = await loadSourceHealth();
  const dashboard = await loadWebsiteDashboard({ days: 30 }).catch(() => null);
  const google = getGoogleOAuthConfig();
  const umami = getUmamiConfig();
  const message = banner(params);
  const encryption = analyticsEncryptionKeySource();

  const sourceFor = (provider: ProviderHealth['provider']) =>
    health.sources.find((source) => source.provider === provider);

  const ga = sourceFor('google_analytics');
  const gsc = sourceFor('search_console');
  const um = sourceFor('umami');
  const recentRuns = health.runs.slice(0, 12);

  return (
    <div className="pw-page pw-analytics">
      <div className="pw-page-inner">
        <header className="pw-analytics-head">
          <div>
            <p className="pw-kicker">ANALYTICS · WEBSITE INTELLIGENCE</p>
            <h1 className="pw-page-title">Сайт под наблюдением.</h1>
            <p className="pw-page-lede">
              Google Analytics, Search Console и Umami остаются независимыми источниками. Пьеро
              сопоставляет их с Supabase и Brain, но не выдаёт отсутствие данных за ноль.
            </p>
          </div>

          <nav className="pw-segmented" aria-label="Разделы">
            <Link href="/admin/pierrot/dash">DASH</Link>
            <Link href="/admin/observatory">OBSERVATORY</Link>
          </nav>
        </header>

        {message && (
          <div className={`pw-analytics-banner pw-analytics-banner--${message.tone}`}>
            {message.text}
          </div>
        )}

        {!google.configured && (
          <section className="pw-analytics-config" aria-labelledby="pw-analytics-config-title">
            <h2 id="pw-analytics-config-title">Нужна настройка Google OAuth</h2>
            <p>
              Не заданы: <strong>{google.missing.join(', ')}</strong>. Без них подключение
              невозможно; имитация доступа не выполняется.
            </p>
            <p>
              Redirect URI для Google Cloud Console: <code>{google.redirectUri}</code>
            </p>
            <p>
              Добавьте этот URI в тот же OAuth 2.0 Client ID, который используется Supabase Auth.
              Пользовательская авторизация сайта не меняется.
            </p>
          </section>
        )}

        {google.configured && (
          <section className="pw-analytics-config pw-analytics-config--quiet">
            <p>
              <strong>OAuth настроен.</strong> Redirect URI: <code>{google.redirectUri}</code>.
              Запрашиваются только <code>analytics.readonly</code> и{' '}
              <code>webmasters.readonly</code>.
            </p>
            {encryption === 'derived' && (
              <p>
                Ключ шифрования refresh token выводится из серверного секрета. Для независимой
                ротации задайте <code>ANALYTICS_TOKEN_ENCRYPTION_KEY</code>.
              </p>
            )}
          </section>
        )}

        <section className="pw-analytics-grid" aria-label="Источники">
          {ga && <SourceCard source={ga} provider="google_analytics" />}
          {gsc && <SourceCard source={gsc} provider="search_console" />}
          {um && <SourceCard source={um} provider="umami" />}
        </section>

        <section className="pw-analytics-charts" aria-labelledby="pw-analytics-charts-title">
          <div className="pw-analytics-charts-head">
            <div>
              <p className="pw-kicker">ДИНАМИКА · 30 ДНЕЙ</p>
              <h2 id="pw-analytics-charts-title">Что уже сохранено</h2>
            </div>
            <span className="pw-analytics-hint">
              Графики строятся только по сохранённым данным; API при открытии страницы не
              вызывается.
            </span>
          </div>

          <div className="pw-analytics-chart-grid">
            <article className="pw-analytics-chart">
              <div className="pw-analytics-chart-label">
                <span>Сессии GA4</span>
                <strong>{formatNumber(dashboard?.dataset.ga4.totals.sessions.value)}</strong>
              </div>
              <Sparkline series={dashboard?.sessionsSeries ?? null} label="Сессии GA4" />
              <p>
                {dashboard?.dataset.ga4.available
                  ? `Период: ${dashboard.period.label}.`
                  : 'Нет сохранённых данных GA4. Это не ноль.'}
              </p>
            </article>

            <article className="pw-analytics-chart">
              <div className="pw-analytics-chart-label">
                <span>Клики Google Search</span>
                <strong>{formatNumber(dashboard?.dataset.gsc.totals.clicks.value)}</strong>
              </div>
              <Sparkline series={dashboard?.clicksSeries ?? null} label="Клики Google Search" />
              <p>
                {dashboard?.dataset.gsc.available
                  ? `Период: ${dashboard.period.label}.`
                  : 'Нет сохранённых данных Search Console. Это не ноль.'}
              </p>
            </article>
          </div>
        </section>

        <section className="pw-analytics-sync" aria-labelledby="pw-analytics-sync-title">
          <div>
            <p className="pw-kicker">СИНХРОНИЗАЦИЯ</p>
            <h2 id="pw-analytics-sync-title">Ручной запуск</h2>
            <p>
              Работает независимо от scheduler. Повторная загрузка периода идемпотентна: дубликаты
              не создаются, история сохраняется. Последние дни перезагружаются повторно, потому что
              Google отдаёт их с задержкой.
            </p>
            <p className="pw-analytics-hint">
              Автоматическое расписание не создаётся. Совместимый endpoint:{' '}
              <code>/api/cron/analytics-sync</code> с заголовком{' '}
              <code>Authorization: Bearer CRON_SECRET</code>.
            </p>
          </div>

          <form action="/api/admin/analytics/sync" method="post" className="pw-analytics-sync-form">
            <label>
              Период
              <select name="days" defaultValue="30">
                <option value="7">7 дней</option>
                <option value="30">30 дней</option>
                <option value="90">90 дней</option>
              </select>
            </label>
            <button className="pw-analytics-button" type="submit">
              Синхронизировать всё
            </button>
          </form>
        </section>

        {!umami.configured && (
          <section className="pw-analytics-config pw-analytics-config--quiet">
            <h2>Umami</h2>
            <p>
              Не подключён. Для независимой проверки посещаемости задайте{' '}
              {umami.missing.map((name, index) => (
                <span key={name}>
                  <code>{name}</code>
                  {index < umami.missing.length - 1 ? ', ' : ''}
                </span>
              ))}
              . Источник остаётся подготовленным и не считается работающим.
            </p>
          </section>
        )}

        <section className="pw-analytics-history" aria-labelledby="pw-analytics-history-title">
          <div className="pw-dash-panel-head">
            <h2 id="pw-analytics-history-title">Журнал синхронизации</h2>
            <span>{recentRuns.length === 0 ? 'пусто' : `${recentRuns.length} записей`}</span>
          </div>

          {recentRuns.length === 0 ? (
            <p className="pw-dash-missing">Синхронизаций ещё не было.</p>
          ) : (
            <div className="pw-table-wrap">
              <table className="pw-analytics-table">
                <thead>
                  <tr>
                    <th>Источник</th>
                    <th>Режим</th>
                    <th>Статус</th>
                    <th>Период</th>
                    <th>Записей</th>
                    <th>Начало</th>
                    <th>Ошибка</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map((run) => (
                    <tr key={run.id}>
                      <td>
                        {run.provider === 'google_analytics'
                          ? 'GA4'
                          : run.provider === 'search_console'
                            ? 'GSC'
                            : 'Umami'}
                      </td>
                      <td>{run.mode}</td>
                      <td>{run.status}</td>
                      <td>
                        {run.range_start && run.range_end
                          ? `${run.range_start} — ${run.range_end}`
                          : '—'}
                      </td>
                      <td>{run.rows_written}</td>
                      <td>{formatDate(run.started_at)}</td>
                      <td>{run.error_code || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="pw-analytics-note">
          <h2>Что именно считается</h2>
          <ul>
            <li>
              GA4: сессии, пользователи, просмотры, каналы, источники, страницы, устройства, страны,
              события.
            </li>
            <li>
              Search Console: клики, показы, CTR, средняя позиция, запросы, страницы, страны,
              устройства.
            </li>
            <li>
              Umami: независимые просмотры, визиты и посетители — только для сравнения, не для
              суммирования.
            </li>
            <li>
              Supabase: подтверждённые подписки, пожертвования, покупки и внутренние диалоги
              Pierrot.
            </li>
          </ul>
          <p>
            Measurement ID <code>{WEBSITE_ANALYTICS_MEASUREMENT_ID}</code> — это не GA4 Property ID.
            Числовой Property ID определяется автоматически через Google Admin API при подключении.
          </p>
          <p>
            Первичная загрузка: до 90 дней (настраивается <code>ANALYTICS_BACKFILL_DAYS</code>).
            Search Console может отдавать данные с задержкой 2–3 дня; это указывается в отчётах.
          </p>
        </section>
      </div>
    </div>
  );
}
