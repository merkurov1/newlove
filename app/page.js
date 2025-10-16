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


// Надёжный SSR-запрос опубликованных статей через anon key
async function getArticles(excludeIds = []) {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    // Try to filter out soft-deleted rows. Different deployments may use
    // different column names (deletedAt, deleted_at, deleted). We'll try
    // the common candidates and fall back to no deleted filter if none exist.
    const deletedCols = ['deletedAt', 'deleted_at', 'deleted'];
    const buildQuery = (deletedCol) => {
      let q = supabase
        .from('articles')
        .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
        .eq('published', true)
        .order('updatedAt', { ascending: false })
        .limit(15);
      if (deletedCol) q = q.is(deletedCol, null);
      return q;
    };
    // start by trying each deleted column candidate until one succeeds
    let q = null;
    let data = null;
    let error = null;
    for (const col of [...deletedCols, null]) {
      try {
        q = buildQuery(col);
        // apply exclusion if provided
        if (Array.isArray(excludeIds) && excludeIds.length > 0) {
          const quoted = excludeIds.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
          q = q.not('id', 'in', `(${quoted})`);
        }
        const res = await q;
        data = res && res.data;
        error = res && res.error;
        if (error) throw error;
        // success
        break;
      } catch (e) {
        // try next column candidate
        data = null;
        error = e;
        continue;
      }
    }
    if (error && !data) {
      console.error('Supabase fetch articles error', error);
      return [];
    }
    if (Array.isArray(excludeIds) && excludeIds.length > 0) {
      // Supabase expects an SQL-style list for `in`, quote IDs safely
      const quoted = excludeIds.map(id => `'${String(id).replace(/'/g, "''")}'`).join(',');
      q = q.not('id', 'in', `(${quoted})`);
    }
    if (!Array.isArray(data)) {
      console.error('Supabase articles: data is not array', data);
      return [];
    }
    // Enrich articles with server-side previewImage so the feed can render thumbnails
    const enriched = await Promise.all(
      data.map(async (a) => {
        let previewImage = null;
        try {
          previewImage = a.content ? await getFirstImage(a.content) : null;
        } catch (e) {
          console.debug('getArticles: getFirstImage failed for', a.id, e);
          previewImage = null;
        }
        return {
          id: a.id,
          title: a.title,
          slug: a.slug,
          content: a.content,
          publishedAt: a.publishedAt,
          updatedAt: a.updatedAt,
          author: a.author || null,
          previewImage,
        };
      })
    );
    return enriched;
  } catch (e) {
    console.error('SSR getArticles fatal error', e);
    return [];
  }
}
import { getArticlesByTag } from '@/lib/tagHelpers';

// Fetch articles for the special "auction" tag using shared helpers
async function getAuctionArticles() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    const arts = await getArticlesByTag(supabase, 'auction', 50);
    return arts;
  } catch (e) {
    console.error('getAuctionArticles wrapper error', e);
    return [];
  }
}
export default async function Home() {
  // SSR: Получаем сначала статьи для auction, then exclude them from main feed
  const auctionArticles = await getAuctionArticles();
  const auctionIds = (auctionArticles || []).map(a => a.id).filter(Boolean);
  const articles = await (async () => {
    try {
      // call internal getArticles with exclusion list
      const impl = await import('@/app/page');
      // this file exports getArticles, but we've made it return default _inner when called without args
    } catch (e) {
      // ignore, we'll call module-local helper below
    }
    // Call the local inner implementation by invoking getArticles with excludeIds
    return await getArticles(auctionIds);
  })();

  return (
    <main>
      <div className="mb-8">
        <CloseableHero />
      </div>
      {/* Auction slider for articles tagged 'auction' - placed right after hero */}
      {auctionArticles && auctionArticles.length > 0 && (
        <section className="max-w-4xl mx-auto py-12 px-4">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">🏷️ Auction</h2>
            <Link href="/tags/auction" className="text-sm text-gray-500 hover:text-gray-700">Все по тегу →</Link>
          </div>
          <AuctionSlider articles={auctionArticles} />
        </section>
      )}

      {/* Main articles feed excluding auction-tagged articles */}
      <section className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">Последние статьи</h1>
        <ArticlesFeed initialArticles={articles} />
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
