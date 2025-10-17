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
import AuctionSlider from '@/components/AuctionSlider';
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });


import { getArticlesByTag, getArticlesExcludingTag, getArticlesByTagStrict } from '@/lib/tagHelpers';
import dynamic from 'next/dynamic';
const BackgroundShapes = dynamic(() => import('@/components/BackgroundShapes'), { ssr: false });
export default async function Home({ searchParams }) {
  // SSR: Получаем сначала статьи для auction, then exclude them from main feed
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });
  // Strict fetch: only articles with tag 'auction' (use strict variant)
  const auctionArticles = await getArticlesByTagStrict(supabase, 'auction', 50) || [];

  // (No extra fallbacks here — strictly only articles tagged 'auction')
  const auctionIds = (auctionArticles || []).map(a => a.id).filter(Boolean);
  // Show main feed: articles excluding auction-tagged items
  const newsArticles = await getArticlesExcludingTag(supabase, 'auction', 15);
  // Compute debug info for tag exclusion when requested
  // Prefer explicit query param `?tag_debug=1` in the server page (passed via searchParams)
  // or enable globally via env TAG_HELPERS_DEBUG
  let showDebug = !!(process && process.env && process.env.TAG_HELPERS_DEBUG);
  try {
    if (!showDebug && searchParams) {
      // searchParams may be an object of strings in Next.js server components
      if (searchParams.tag_debug === '1' || searchParams.tag_debug === 1) showDebug = true;
    }
  } catch (e) {
    // ignore
  }
  let tagDebugInfo = null;
  if (showDebug) {
    // Collect per-step diagnostic info so we can pinpoint which operation throws
      const diag = {
      tagRow: null,
      tagRowError: null,
      relsCount: 0,
        relsMethod: null,
      relsError: null,
      excludedIds: [],
      auctionIds: [],
      rpcProbe: { ok: false, count: 0, error: null, stack: null },
      tagTableChecks: [],
      error: null,
    };
    try {
      const { getTagBySlug, readArticleRelationsForTag, readArticleRelationsForTagStrict } = await import('@/lib/tagHelpers');
      // 1) get tag row
      try {
        const tagRow = await getTagBySlug(supabase, 'auction');
        diag.tagRow = tagRow ? JSON.parse(JSON.stringify(tagRow)) : null;
      } catch (e) {
        diag.tagRowError = { message: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : null };
      }

      // 2) read relations if tag found
      let rels = [];
      try {
        if (diag.tagRow && diag.tagRow.id) {
          // Try strict reader first (REST/client). If it fails, fall back to tolerant reader.
          try {
            rels = await readArticleRelationsForTagStrict(supabase, diag.tagRow.id) || [];
            diag.relsMethod = 'strict';
          } catch (e) {
            try {
              rels = await readArticleRelationsForTag(supabase, diag.tagRow.id) || [];
              diag.relsMethod = 'fallback';
            } catch (e2) {
              diag.relsMethod = 'error';
              throw e2;
            }
          }
        }
        diag.relsCount = Array.isArray(rels) ? rels.length : 0;
        diag.relsSample = Array.isArray(rels) ? (rels.slice(0,10).map(r => (r && typeof r === 'object') ? JSON.parse(JSON.stringify(r)) : r)) : [];
        diag.excludedIds = Array.from(new Set((rels || []).map(r => (r && (r.A || r.article_id || r.articleId || r.a || r.article || r.id)) || null).filter(Boolean))).map(String);
      } catch (e) {
        diag.relsError = { message: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : null };
      }

      // 3) RPC probe
      try {
        const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: 'auction' });
        const rpcData = (rpc && (rpc.data || rpc)) || [];
        diag.rpcProbe.ok = true;
        diag.rpcProbe.count = Array.isArray(rpcData) ? rpcData.length : (rpcData ? 1 : 0);
        // collect auctionIds from rpcData (try to extract ids)
        try {
          diag.auctionIds = Array.from(new Set((rpcData || []).map(d => (d && (d.id || d.article_id || d.articleId)) || null).filter(Boolean))).map(String);
        } catch (e) {
          // ignore
        }
      } catch (e) {
        diag.rpcProbe.error = e && e.message ? e.message : String(e);
        diag.rpcProbe.stack = e && e.stack ? e.stack : null;
      }

      // 4) tag table checks
      const tableCandidates = ['tags','Tag','Tags','tag'];
      for (const tbl of tableCandidates) {
        try {
          const res = await supabase.from(tbl).select('id,slug,name').ilike('slug', 'auction').limit(1);
          if (res && res.data && res.data[0]) {
            diag.tagTableChecks.push({ table: tbl, found: true, row: JSON.parse(JSON.stringify(res.data[0])) });
            continue;
          }
          const res2 = await supabase.from(tbl).select('id,slug,name').ilike('name', 'auction').limit(1);
          if (res2 && res2.data && res2.data[0]) {
            diag.tagTableChecks.push({ table: tbl, found: true, row: JSON.parse(JSON.stringify(res2.data[0])) });
            continue;
          }
          diag.tagTableChecks.push({ table: tbl, found: false });
        } catch (e) {
          diag.tagTableChecks.push({ table: tbl, error: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : null });
        }
      }

      // 5) ensure auctionIds includes auctionIds derived from page-level auctionArticles
      diag.auctionIds = Array.from(new Set([...(diag.auctionIds || []), ...(Array.isArray(auctionIds) ? auctionIds.map(String) : [])]));

      tagDebugInfo = diag;
    } catch (e) {
      tagDebugInfo = { error: { message: e && e.message ? e.message : String(e), stack: e && e.stack ? e.stack : null } };
    }
  }

  return (
    <main className="relative overflow-hidden">
      <BackgroundShapes />
      {/* Server-rendered hero fallback (progressive enhancement).
          We keep the client-only CloseableHero for enhanced behavior,
          but render a basic hero on the server so non-hydrated clients
          (tablets, noscript, partial JS failures) see content. */}
      <div className="relative max-w-5xl mx-auto px-4 py-6 sm:py-10 lg:py-8 mb-6">
        <div className="rounded-2xl p-6 bg-white/80 dark:bg-neutral-900">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Anton Merkurov</h1>
          <p className="mt-2 text-lg text-neutral-700 dark:text-neutral-300">Медиа, технологии и искусство. Персональный сайт и блог.</p>
          <div className="mt-4">
            <a href="/you" className="inline-block text-sm font-medium text-pink-600 hover:underline">Обо мне →</a>
          </div>
        </div>
      </div>
      {/* Client-only CloseableHero (enhanced behavior) */}
      <CloseableHero className="relative max-w-5xl mx-auto px-4 py-6 sm:py-10 lg:py-8 mb-6" />
      {/* New auction slider placed under the hero */}
      {Array.isArray(auctionArticles) && auctionArticles.length > 0 && (
        <section className="max-w-5xl mx-auto py-3 sm:py-4 lg:py-4 px-4" aria-label="Аукционные статьи">
          <div className="rounded-2xl p-3 sm:p-4 bg-gradient-to-r from-white/40 to-white/10 border border-white/10 backdrop-blur-md">
            {/* Server-side fallback list (progressive) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(auctionArticles || []).slice(0, 5).map((a) => (
                <a key={a.id} href={`/${a.slug}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
                  {a.previewImage ? (
                    <div className="h-40 w-full bg-gray-100 dark:bg-neutral-800">
                      <img src={a.previewImage} alt={a.title} className="object-cover w-full h-40" />
                    </div>
                  ) : (
                    <div className="h-40 w-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">📰</div>
                  )}
                  <div className="p-3">
                    <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{a.title}</h3>
                    {a.description ? <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{a.description}</p> : null}
                  </div>
                </a>
              ))}
            </div>
            {/* Client enhancement: replace with Swiper when hydrated */}
            <div className="mt-4">
              <AuctionSlider articles={auctionArticles} />
            </div>
          </div>
        </section>
      )}

      {/* Main articles feed excluding auction-tagged articles */}
  <section id="articles" className="max-w-5xl mx-auto py-4 sm:py-6 lg:py-4 lg:-mt-6 px-4">
          <div className="rounded-2xl p-3 sm:p-4 bg-white/30 backdrop-blur-sm border border-white/10">
          {/* Server-side fallback list of articles (first page) */}
          <div className="space-y-4">
            {(newsArticles || []).slice(0, 6).map((n) => (
              <article key={n.id} className="p-3 bg-white rounded-md shadow-sm">
                <a href={`/${n.slug}`} className="flex items-start gap-4">
                  {n.previewImage ? <img src={n.previewImage} alt={n.title} className="w-24 h-16 object-cover rounded" /> : <div className="w-24 h-16 bg-neutral-100 rounded" />}
                  <div>
                    <h3 className="text-lg font-semibold">{n.title}</h3>
                    {n.description ? <p className="text-sm text-neutral-600">{n.description}</p> : null}
                  </div>
                </a>
              </article>
            ))}
          </div>
          {/* Client-side ArticlesFeed enhancement */}
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
