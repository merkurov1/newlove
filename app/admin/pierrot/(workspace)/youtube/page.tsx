import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/serverAuth';
import YouTubeProjectWorkspace from '@/components/youtube/YouTubeProjectWorkspace';
import { isYouTubeProjectSlug, YOUTUBE_PROJECTS } from '@/lib/youtube/channels';

import '../analytics/analytics.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube',
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const YOUTUBE_CHANNELS_REASON_LABELS: Record<string, string> = {
  google_oauth_not_configured:
    'Google OAuth не настроен на сервере: проверьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET.',
  server_configuration_error:
    'Серверная конфигурация Supabase неполна: проверьте URL проекта и ключ service role.',
  migration_required:
    'Аддитивная миграция multi-channel YouTube не применена или PostgREST не видит её таблицы.',
  redirect_uri_mismatch:
    'Redirect URI не зарегистрирован в этом Google Cloud OAuth client. Добавьте URI, показанный на странице.',
  invalid_client:
    'Google отклонил client id/secret. Проверьте, что используется тот же OAuth client.',
  oauth_configuration_error:
    'Google отклонил параметры OAuth (scope, redirect URI или client). Проверьте настройки OAuth client.',
  oauth_preflight_failed:
    'Предварительная проверка Google OAuth не прошла. Повторите попытку после проверки конфигурации.',
  access_denied: 'Доступ отменён в Google или ограничен политикой организации.',
  invalid_state:
    'Сессия подключения устарела или не совпала. Нажмите «Подключить Google-аккаунт» ещё раз.',
  unauthorized: 'Сессия администратора истекла. Войдите снова и повторите подключение.',
  missing_code_or_state: 'Google не вернул код авторизации. Начните подключение заново.',
  missing_scopes:
    'Google не выдал все необходимые разрешения. Подключите аккаунт заново и подтвердите доступ к YouTube.',
  token_exchange_failed: 'Google не обменял код авторизации на токен. Повторите подключение.',
  connection_save_failed:
    'Не удалось сохранить Google-подключение в базе. Повторите попытку; если ошибка повторится, проверьте таблицы service role.',
  connection_read_failed:
    'Не удалось прочитать существующее Google-подключение. Повторите попытку или обратитесь к владельцу окружения.',
  channels_persist_failed:
    'Google-аккаунт сохранён, но каналы не удалось записать в базу. Нажмите «Обновить каналы».',
  channels_reconcile_failed:
    'Каналы получены, но не удалось согласовать их с сохранёнными. Нажмите «Обновить каналы».',
  token_encryption_unavailable:
    'Сервер не смог безопасно зашифровать токен. Проверьте ключ шифрования на сервере.',
  google_identity_unavailable:
    'Не удалось определить Google-аккаунт. Подключите его заново и разрешите доступ к email.',
  channels_failed:
    'Google-аккаунт сохранён, но список каналов получить не удалось. Нажмите «Обновить каналы» у подключения.',
  no_refresh_token:
    'Google не вернул refresh token. Подключите аккаунт заново с подтверждением доступа.',
};

function youtubeChannelsNotice(params: SearchParams): string | null {
  const status = one(params, 'youtube_channels');

  if (!status) return null;

  if (status === 'connected') {
    const account = one(params, 'account');
    const channels = one(params, 'channels');
    return `Google-аккаунт ${account || ''} подключён. Найдено каналов: ${
      channels || '—'
    }. Выберите канал и привяжите его к проекту.`;
  }

  const reason = one(params, 'reason') || status;
  const label = YOUTUBE_CHANNELS_REASON_LABELS[reason];
  const missing = one(params, 'missing');
  const detail = label ? `${label} (код: ${reason})` : `код: ${reason}`;

  return `Подключение не завершено: ${detail}${missing ? ` · ${missing}` : ''}.`;
}

function noticeFrom(params: SearchParams): string | null {
  const management = one(params, 'youtube_management');

  if (management) {
    if (management === 'success') {
      return `Управление YouTube подключено отдельным incremental consent. Канал: ${
        one(params, 'yt_channel') || 'канал проекта'
      }. Аналитический grant не изменён.`;
    }

    return `Управление YouTube не подключено: ${
      one(params, 'reason') || management
    }. Аналитика продолжает работать с прежним grant.`;
  }

  return youtubeChannelsNotice(params);
}

/**
 * Project-scoped YouTube workspace. Each project resolves its own binding; a
 * shared channel can be bound to several projects without duplicating the
 * Google connection or its encrypted token.
 */
export default async function YouTubeManagementPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  const params = searchParams ?? {};
  const rawProject = one(params, 'project');
  const project = isYouTubeProjectSlug(rawProject) ? rawProject : 'art-engine';

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <header className="pw-analytics-head">
          <div>
            <p className="pw-kicker">YOUTUBE · МУЛЬТИКАНАЛЬНАЯ ИНТЕГРАЦИЯ</p>
            <h1 className="pw-page-title">
              {YOUTUBE_PROJECTS.find((item) => item.slug === project)?.name || project}
            </h1>
            <p className="pw-page-lede">
              Google OAuth connection, YouTube-канал и привязка к проекту — отдельные сущности. Один
              аккаунт может владеть несколькими каналами, один канал может работать в нескольких
              проектах. Сейчас доступны аналитика и редактирование метаданных уже опубликованных
              видео.
            </p>
          </div>
          <nav className="pw-segmented" aria-label="Проект">
            {YOUTUBE_PROJECTS.map((item) => (
              <Link
                key={item.slug}
                href={`/admin/pierrot/youtube?project=${item.slug}`}
                aria-current={item.slug === project ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
            <Link href="/admin/pierrot/analytics">ANALYTICS</Link>
          </nav>
        </header>

        <YouTubeProjectWorkspace project={project} notice={noticeFrom(params)} />
      </div>
    </div>
  );
}
