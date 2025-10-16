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


// SSR-friendly динамический импорт CloseableHero (client-only)
const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });


import { getArticlesByTag, getArticlesExcludingTag } from '@/lib/tagHelpers';
import dynamic from 'next/dynamic';
const BackgroundShapes = dynamic(() => import('@/components/BackgroundShapes'), { ssr: false });
export default async function Home() {
  // SSR: Получаем сначала статьи для auction, then exclude them from main feed
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  const auctionArticles = await getArticlesByTag(supabase, 'auction', 50);
  const auctionIds = (auctionArticles || []).map(a => a.id).filter(Boolean);
  const articles = await getArticlesExcludingTag(supabase, 'auction', 15);

  return (
    <main className="relative overflow-hidden">
      <BackgroundShapes />
      <div className="mb-8">
        {/* Keep CloseableHero for other pages, but on homepage we render HeroHearts directly */}
        <div className="relative max-w-5xl mx-auto px-4 py-12 sm:py-20">
          <div className="bg-white/40 backdrop-blur-md border border-white/20 rounded-3xl p-8 md:p-12 shadow-2xl overflow-hidden">
              {/* Use CloseableHero so users can close the hero; it delegates to HeroHearts internally */}
              <div className="w-full">
                <CloseableHero />
              </div>
            </div>
        </div>
      </div>
      {/* Auction slider for articles tagged 'auction' - placed right after hero */}
      {auctionArticles && auctionArticles.length > 0 && (
        <section className="max-w-6xl mx-auto py-8 px-4" aria-label="Аукционные статьи">
          <div className="rounded-2xl p-4 bg-gradient-to-r from-white/40 to-white/10 border border-white/10 backdrop-blur-md">
            <AuctionSlider articles={auctionArticles} />
          </div>
        </section>
      )}

      {/* Main articles feed excluding auction-tagged articles */}
      <section id="articles" className="max-w-6xl mx-auto py-12 px-4">
        <h1 className="text-3xl sm:text-4xl font-bold mb-6">Последние статьи</h1>
        <div className="rounded-2xl p-4 bg-white/30 backdrop-blur-sm border border-white/10">
          <ArticlesFeed initialArticles={articles} excludeTag="auction" />
        </div>
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
