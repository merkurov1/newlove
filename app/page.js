export const metadata = {
  title: 'Главная | Anton Merkurov',
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.'
};
// app/page.js



// Use dynamic import for server helper to avoid circular import / interop issues
import { safeData } from '@/lib/safeSerialize';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { getFirstImage } from '@/lib/contentUtils';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import nextDynamic from 'next/dynamic';


// SSR-friendly динамический импорт HeroHearts (только на клиенте)

const HeroHearts = nextDynamic(() => import('@/components/HeroHearts'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });
const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });


import { getArticlesByTag, getArticlesExcludingTag } from '@/lib/tagHelpers';
export default async function Home() {
  // SSR: Получаем сначала статьи для auction, then exclude them from main feed
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const auctionArticles = await getArticlesByTag(supabase, 'auction', 50);
  const auctionIds = (auctionArticles || []).map(a => a.id).filter(Boolean);
  const articles = await getArticlesExcludingTag(supabase, 'auction', 15);

  return (
    <main>
      <div className="mb-8">
        <CloseableHero />
      </div>
      {/* Auction slider for articles tagged 'auction' - placed right after hero */}
      {auctionArticles && auctionArticles.length > 0 && (
        <section className="max-w-4xl mx-auto py-12 px-4">
          <AuctionSlider articles={auctionArticles} />
        </section>
      )}

      {/* Main articles feed excluding auction-tagged articles */}
      <section className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">Последние статьи</h1>
  <ArticlesFeed initialArticles={articles} excludeTag="auction" />
      </section>

      {/* Flow feed follows the articles */}
      <section className="max-w-4xl mx-auto py-12 px-4">
        <div className="flex items-center justify-between mb-6">
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
