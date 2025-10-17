// app/page.js
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

// Упрощенный серверный компонент-заглушка для аукциона
import AuctionSliderNewServer from '@/components/AuctionSliderNew.server';

export const metadata = {
  title: 'Главная | Anton Merkurov',
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.'
};

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
    return []; // Возвращаем пустой массив в случае ошибки
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
  // 1. Получаем ID статей, которые нужно исключить
  const articlesToExclude = await getAuctionArticles(supabase, tagToExclude, 2000); // Получаем все ID
  const excludedIds = articlesToExclude.map(a => a.id).filter(Boolean);

  // 2. Запрашиваем статьи, которых нет в списке исключенных ID
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
  // Используем сервисный ключ для надежного доступа к данным на сервере
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  // 1. Получаем статьи для аукциона одним простым вызовом
  const auctionArticles = await getAuctionArticles(supabase, 'auction', 20);

  // 2. Получаем основную ленту, исключая статьи для аукциона
  const newsArticles = await getArticlesExcludingTag(supabase, 'auction', 15);

  return (
    <main className="relative overflow-hidden">
      {/* SEO: Вставляем JSON-LD для структурированных данных */}
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
            {/* Паттерн Progressive Enhancement:
              1. На сервере рендерится <AuctionSliderNewServer /> как простой HTML/CSS-компонент.
              2. На клиенте загружается JS, и <AuctionSlider /> заменяет его на интерактивный слайдер Swiper.
              Обертка suppressHydrationWarning нужна, чтобы React не ругался на различия между серверным и клиентским рендером.
            */}
            <div suppressHydrationWarning>
              <AuctionSliderNewServer articles={auctionArticles} />
              <AuctionSlider articles={safeData(auctionArticles)} />
            </div>
          </div>
        </section>
      )}

      {/* Основная лента статей */}
      <section id="articles" className="max-w-5xl mx-auto py-4 sm:py-6 lg:py-4 lg:-mt-6 px-4">
        <div className="rounded-2xl p-3 sm:p-4 bg-white/30 backdrop-blur-sm border border-white/10">
          {/* Убрали дублирование рендеринга. 
            Компонент ArticlesFeed теперь сам отвечает за отображение начальных статей.
          */}
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
