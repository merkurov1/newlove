import type { Metadata } from 'next';
import Link from 'next/link';

import { requireAdmin } from '@/lib/serverAuth';
import YouTubeChannelManager from '@/components/youtube/YouTubeChannelManager';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'YouTube',
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * One shared channel manager for both project contexts. The `project` query is
 * presentation/routing metadata only: the channel connection and permissions
 * are the same owner-level resource.
 */
export default async function YouTubeManagementPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  const params = searchParams ?? {};
  const project = one(params, 'project') === 'unframed' ? 'unframed' : 'pierrot';

  return (
    <div className="pw-page">
      <div className="pw-page-inner">
        <header className="pw-analytics-head">
          <div>
            <p className="pw-kicker">YOUTUBE · SHARED CHANNEL</p>
            <h1 className="pw-page-title">Один канал. Два проекта.</h1>
            <p className="pw-page-lede">
              Pierrot и UNFRAMED используют одно подключение и один выбранный канал. Аналитика и
              управление хранятся раздельно: подключение write-доступа не меняет аналитический
              grant.
            </p>
          </div>
          <nav className="pw-segmented" aria-label="Контекст проекта">
            <Link href="/admin/pierrot/youtube?project=pierrot">PIERROT</Link>
            <Link href="/admin/pierrot/youtube?project=unframed">UNFRAMED</Link>
            <Link href="/admin/pierrot/analytics">ANALYTICS</Link>
          </nav>
        </header>

        <YouTubeChannelManager project={project} />
      </div>
    </div>
  );
}
