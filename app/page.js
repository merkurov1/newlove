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
import AuctionSliderNewServer from '@/components/AuctionSliderNew.server';
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });


import { getArticlesByTag, getArticlesExcludingTag } from '@/lib/tagHelpers';
import dynamic from 'next/dynamic';
const BackgroundShapes = dynamic(() => import('@/components/BackgroundShapes'), { ssr: false });
export default async function Home() {
  // SSR: Получаем сначала статьи для auction, then exclude them from main feed
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  // Robust lookup for auction-tagged articles. Try common variants and
  // fall back to a small news set to ensure the slider has content when
  // tag lookup fails in some schemas/environments.
  let auctionArticles = await getArticlesByTag(supabase, 'auction', 50) || [];
  if ((!auctionArticles || auctionArticles.length === 0)) {
    try { auctionArticles = await getArticlesByTag(supabase, 'auctions', 50) || []; } catch (e) { auctionArticles = []; }
  }
  if ((!auctionArticles || auctionArticles.length === 0)) {
    try { auctionArticles = await getArticlesByTag(supabase, 'auctioned', 50) || []; } catch (e) { auctionArticles = []; }
  }
  // final safe fallback: show a small set of recent news so the UI is visible
  if ((!auctionArticles || auctionArticles.length === 0)) {
    try { auctionArticles = await getArticlesByTag(supabase, 'news', 5) || []; } catch (e) { auctionArticles = []; }
  }
  const auctionIds = (auctionArticles || []).map(a => a.id).filter(Boolean);
  // Show main feed: articles tagged 'news'
  const newsArticles = await getArticlesByTag(supabase, 'news', 15);
  // Compute debug info for tag exclusion when requested
  const globalReq = (globalThis && globalThis.request) || null;
  // TEMP: force debug on to surface tag lookup details in prod for diagnosis
  let showDebug = true || !!(process && process.env && process.env.TAG_HELPERS_DEBUG);
  try {
    if (!showDebug && globalReq && typeof globalReq.url === 'string') {
      const u = new URL(globalReq.url);
      if (u.searchParams.get('tag_debug') === '1') showDebug = true;
    }
  } catch (e) {
    // ignore
  }
  let tagDebugInfo = null;
  if (showDebug) {
    try {
      const { getTagBySlug, readArticleRelationsForTag } = await import('@/lib/tagHelpers');
      const tagRow = await getTagBySlug(supabase, 'auction');
      let rels = [];
      if (tagRow && tagRow.id) {
        rels = await readArticleRelationsForTag(supabase, tagRow.id) || [];
      }
      const excludedIds = Array.from(new Set((rels || []).map(r => r && (r.A || r.article_id || r.articleId || r.a || r.article || r.id)).filter(Boolean)));
      tagDebugInfo = { tagRow, relsCount: (rels || []).length, excludedIds, auctionIds };
    } catch (e) {
      tagDebugInfo = { error: String(e) };
    }
  }

  return (
    <main className="relative overflow-hidden">
      <BackgroundShapes />
      {/* Render CloseableHero directly so when it returns null the entire hero block disappears */}
      <CloseableHero className="relative max-w-5xl mx-auto px-4 py-6 sm:py-10 lg:py-8 mb-6" />
      {/* Auction slider for articles tagged 'auction' - previous implementation commented out below */}
      {/**
       * Previous implementation:
       * {auctionArticles && auctionArticles.length > 0 && (
       *   <section className="max-w-5xl mx-auto py-3 sm:py-4 lg:py-4 px-4" aria-label="Аукционные статьи">
       *     <div className="rounded-2xl p-3 sm:p-4 bg-gradient-to-r from-white/40 to-white/10 border border-white/10 backdrop-blur-md">
       *       <AuctionSliderServer articles={auctionArticles} />
       *     </div>
       *   </section>
       * )}
       */}

      {/* New auction slider placed under the hero — always render the slot
          so the server wrapper can show a placeholder when there are no
          auction-tagged articles. This guarantees visible, testable UI. */}
      <section className="max-w-5xl mx-auto py-3 sm:py-4 lg:py-4 px-4" aria-label="Аукционные статьи">
          <div className="rounded-2xl p-3 sm:p-4 bg-gradient-to-r from-white/40 to-white/10 border border-white/10 backdrop-blur-md">
            <AuctionSliderNewServer articles={auctionArticles} tagDebugInfo={tagDebugInfo} />
          </div>
      </section>

      {/* Main articles feed excluding auction-tagged articles */}
  <section id="articles" className="max-w-5xl mx-auto py-4 sm:py-6 lg:py-4 lg:-mt-6 px-4">
    <div className="rounded-2xl p-3 sm:p-4 bg-white/30 backdrop-blur-sm border border-white/10">
          <ArticlesFeed initialArticles={newsArticles} includeTag="news" />
          {tagDebugInfo && (
            <div className="mt-6 p-4 bg-gray-50 border border-gray-200 text-sm text-gray-700 rounded">
              <div className="font-medium mb-2">DEBUG: tag exclusion info</div>
              {tagDebugInfo.error ? (
                <pre className="whitespace-pre-wrap text-red-600">{tagDebugInfo.error}</pre>
              ) : (
                <div>
                  <div><strong>tag row:</strong> {tagDebugInfo.tagRow ? JSON.stringify(tagDebugInfo.tagRow) : 'not found'}</div>
                  <div className="mt-2"><strong>relations count:</strong> {tagDebugInfo.relsCount}</div>
                  <div className="mt-2"><strong>excluded ids (sample 50):</strong> {JSON.stringify((tagDebugInfo.excludedIds || []).slice(0,50))}</div>
                  <div className="mt-2"><strong>auctionArticles ids (server RPC):</strong> {JSON.stringify((tagDebugInfo.auctionIds || []).slice(0,50))}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Flow feed follows the articles */}
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
