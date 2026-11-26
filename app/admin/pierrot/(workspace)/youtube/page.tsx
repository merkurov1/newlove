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

function noticeFrom(params: SearchParams): string | null {
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
  const missing = one(params, 'missing');
  return `Подключение не завершено: ${reason}${missing ? ` (${missing})` : ''}.`;
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
              Google OAuth connection, YouTube-канал и привязка к проекту — отдельные сущности.
              Один аккаунт может владеть несколькими каналами, один канал может работать в
              нескольких проектах. Сейчас доступны аналитика и редактирование метаданных уже
              опубликованных видео.
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
