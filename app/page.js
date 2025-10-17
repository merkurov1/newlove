// app/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import nextDynamic from 'next/dynamic';

// SEO: Импортируем и используем компоненты структурированных данных
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import { safeData } from '@/lib/safeSerialize';

// Динамический импорт клиентских компонентов для оптимизации
const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });
const BackgroundShapes = nextDynamic(() => import('@/components/BackgroundShapes'), { ssr: false });

export const metadata = {
  title: 'Главная | Anton Merkurov',
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.'
};

// Компонент-заглушка (скелет) для слайдера, пока он грузится на клиенте
const AuctionSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-pulse">
    {[...Array(3)].map((_, i) => (
      <div key={i} className="block rounded-lg overflow-hidden shadow-sm bg-white/80 dark:bg-neutral-900/80">
        <div className="h-48 w-full bg-gray-300 dark:bg-neutral-800"></div>
        <div className="p-3 space-y-3">
          <div className="h-5 bg-gray-300 dark:bg-neutral-700 rounded w-3/4"></div>
          <div className="h-3 bg-gray-300 dark:bg-neutral-700 rounded w-full"></div>
          <div className="h-3 bg-gray-300 dark:bg-neutral-700 rounded w-1/2"></div>
        </div>
      </div>
    ))}
  </div>
);


/**
 * Упрощенная и надежная функция для получения статей по тегу через RPC-вызов.
 * @param {SupabaseClient} supabase - Клиент Supabase.
 * @param {string} tagSlug - Slug тега.
 * @param {number} [limit=50] - Лимит статей.
 * @returns {Promise<Array>} - Массив статей.
 */
async function getAuctionArticles(supabase, tagSlug, limit = 50) {
  const { data, error } = await supabase.rpc('get_articles_by_tag_slug', {
    tag_slug_param: tagSlug
  }).limit(limit);

  if (error) {
    console.error(`Ошибка при получении статей с тегом "${tagSlug}":`, error);
    return [];
  }
  return data || [];
}

/**
 * Упрощенная функция для получения статей, исключая определенный тег.
 * @param {SupabaseClient} supabase - Клиент Supabase.
 * @param {string} tagToExclude - Slug тега для исключения.
 * @param {number} [limit=15] - Лимит статей.
 * @returns {Promise<Array>} - Массив статей.
 */
async function getArticlesExcludingTag(supabase, tagToExclude, limit = 15) {
  const articlesToExclude = await getAuctionArticles(supabase, tagToExclude, 2000);
  const excludedIds = articlesToExclude.map(a => a.id).filter(Boolean);

  let query = supabase
    .from('articles')
    .select('id, title, slug, previewImage, preview_image, description, excerpt, publishedAt')
    .eq('published', true)
    .order('publishedAt', { ascending: false })
    .limit(limit);

  if (excludedIds.length > 0) {
    query = query.not('id', 'in', `(${excludedIds.join(',')})`);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Ошибка при получении ленты новостей:', error);
    return [];
  }
  return data || [];
}


export default async function Home() {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const auctionArticles = await getAuctionArticles(supabase, 'auction', 20);
  const newsArticles = await getArticlesExcludingTag(supabase, 'auction', 15);

  return (
    <main className="relative overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([PersonSchema, WebsiteSchema, BlogSchema]) }}
      />

      <BackgroundShapes />
      <CloseableHero className="relative max-w-5xl mx-auto px-4 py-6 sm:py-10 lg:py-8 mb-6" />

      {/* Секция аукциона */}
      {Array.isArray(auctionArticles) && auctionArticles.length > 0 && (
        <section className="max-w-5xl mx-auto py-3 sm:py-4 lg:py-4 px-4" aria-label="Аукционные статьи">
          <div className="rounded-2xl p-3 sm:p-4 bg-gradient-to-r from-white/40 to-white/10 border border-white/10 backdrop-blur-md">
            <Suspense fallback={<AuctionSkeleton />}>
              <AuctionSlider articles={safeData(auctionArticles)} />
            </Suspense>
          </div>
        </section>
      )}

      {/* Основная лента статей */}
      <section id="articles" className="max-w-5xl mx-auto py-4 sm:py-6 lg:py-4 lg:-mt-6 px-4">
        <div className="rounded-2xl p-3 sm:p-4 bg-white/30 backdrop-blur-sm border border-white/10">
          <ArticlesFeed initialArticles={newsArticles} includeTag="news" />
        </div>
      </section>

      {/* Лента Flow */}
      <section className="max-w-5xl mx-auto py-6 sm:py-8 px-4">
        <div className="flex items-center justify-between mb-4 sm:mb-6">
          <h2 className="text-2xl font-semibold">🌊 Flow</h2>
          <Link href="/lab/feed" className="text-sm text-gray-500 hover:text-gray-700">Сводная лента →</Link>
        </div>
        <div>
          <FlowFeed limit={12} />
        </div>
      </section>
    </main>
  );
}
