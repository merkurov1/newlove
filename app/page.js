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
// Fetch articles for the special "auction" tag. Try RPC first, fall back to junction query.
async function getAuctionArticles() {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const supabase = getServerSupabaseClient({ useServiceRole: true });
    // Try RPC for performance
    try {
      const rpc = await supabase.rpc('get_articles_by_tag', { tag_slug: 'auction' });
      if (rpc && !rpc.error && Array.isArray(rpc.data) && rpc.data.length > 0) {
        // Normalize shape similar to getArticles and return all found (bounded)
        const normalizedAll = await Promise.all((rpc.data || []).map(async (a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          content: a.content,
          publishedAt: a.publishedAt || a.updatedAt,
          updatedAt: a.updatedAt,
          author: a.author || null,
          previewImage: a.content ? await getFirstImage(a.content) : null,
          description: (a.excerpt || null),
        })));
        // dedupe while preserving order and cap to safe maximum (50)
        const seen = new Set();
        const normalized = [];
        for (const a of normalizedAll) {
          if (!a || !a.id) continue;
          if (seen.has(String(a.id))) continue;
          seen.add(String(a.id));
          normalized.push(a);
          if (normalized.length >= 50) break;
        }
        return normalized;
      }
    } catch (e) {
      // rpc missing or failed - continue to fallback
    }

    // Fallback: tolerant lookup for Tag table name and slug variants (some deployments differ)
    const configured = (typeof process !== 'undefined' && process.env && process.env.TAGS_TABLE_NAME) || null;
    const tableCandidates = configured ? [configured, 'Tag', 'tags', 'tag', 'Tags'] : ['Tag', 'tags', 'tag', 'Tags'];
    const slugVariants = [];
    try { slugVariants.push('auction'); } catch (e) {}
    try { slugVariants.push(decodeURIComponent('auction')); } catch (e) {}
    try { slugVariants.push(String('auction').toLowerCase()); } catch (e) {}
    const uniqSlugVariants = Array.from(new Set(slugVariants.filter(Boolean)));

    let tag = null;
    for (const tbl of tableCandidates) {
      try {
        for (const s of uniqSlugVariants) {
          const { data: tags } = await supabase.from(tbl).select('id,slug').ilike('slug', s).limit(1);
          if (tags && tags[0]) {
            tag = tags[0];
            break;
          }
        }
      } catch (e) {
        // table might not exist or permission denied - try next candidate
      }
      if (tag) break;
    }
    if (!tag) return [];

    const { data: rels } = await supabase.from('_ArticleToTag').select('A').eq('B', tag.id);
    const ids = Array.from(new Set((rels || []).map(r => r && r.A).filter(Boolean)));
    if (!ids || ids.length === 0) return [];

    // try common deleted column names like in getArticles
    const deletedCols = ['deletedAt', 'deleted_at', 'deleted'];
    let artsResp = null;
    for (const col of [...deletedCols, null]) {
      try {
        // return up to 50 auction-tagged articles; allow RPC earlier, fallback to ids
        let q = supabase.from('articles')
          .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
          .in('id', ids)
          .eq('published', true)
          .order('publishedAt', { ascending: false })
          .limit(50);
        if (col) q = q.is(col, null);
        const res = await q;
        if (res && res.error) throw res.error;
        artsResp = res;
        break;
      } catch (e) {
        // try next col candidate
        continue;
      }
    }
    const arts = (artsResp && artsResp.data) || [];
    if (!arts || !Array.isArray(arts) || arts.length === 0) return [];

    // Ensure dedupe and return up to limit
    const seenIds = new Set();
    const selected = [];
    for (const a of arts) {
      if (!a || !a.id) continue;
      if (seenIds.has(String(a.id))) continue;
      seenIds.add(String(a.id));
      selected.push(a);
      if (selected.length >= 50) break;
    }

    const enriched = await Promise.all(
      selected.map(async (a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        content: a.content,
        publishedAt: a.publishedAt,
        updatedAt: a.updatedAt,
        author: a.author || null,
        previewImage: a.content ? await getFirstImage(a.content) : null,
      }))
    );
    return enriched;
  } catch (e) {
    console.error('getAuctionArticles error', e);
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
