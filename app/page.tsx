// app/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import { safeData } from '@/lib/safeSerialize';

const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });
const BackgroundShapes = nextDynamic(() => import('@/components/BackgroundShapes'), { ssr: false });

export const metadata = {
  title: 'Главная | Anton Merkurov',
  description: 'Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.'
};

const AuctionSkeleton = () => (
    <div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-gray-300 dark:bg-neutral-800"></div>
);

function extractFirstImage(content: any) {
    if (!content || typeof content !== 'string') return null;
    try {
        const contentArray = JSON.parse(content);
        if (Array.isArray(contentArray)) {
            for (const block of contentArray) {
                const html = block?.data?.html;
                if (html && typeof html === 'string') {
                    const match = html.match(/<img[^>]+src="([^"]+)"/);
                    if (match && match[1]) {
                        return match[1].replace(/([^:]\/)\/+/g, "$1");
                    }
                }
            }
        }
    } catch (e) { /* Игнорируем ошибку */ }
    const fallbackMatch = content.match(/<img[^>]+src="([^"]+)"/);
    if (fallbackMatch && fallbackMatch[1]) {
        return fallbackMatch[1].replace(/([^:]\/)\/+/g, "$1");
    }
    return null;
}

async function getArticlesByTag(supabase, tagSlug, limit = 50) {
  try {
    // Try direct query first for reliability
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, slug, content, publishedAt, updatedAt, previewImage')
      .order('publishedAt', { ascending: false })
      .limit(limit);

    if (error) {
      console.error(`[getArticlesByTag] Error fetching articles:`, error);
      return [];
    }

    if (!articles || articles.length === 0) {
      console.warn(`[getArticlesByTag] No articles found with tag "${tagSlug}"`);
      return [];
    }

    console.log(`[getArticlesByTag] Found ${articles.length} articles for tag "${tagSlug}"`);

    return articles.map((article: any) => {
      const previewImg = article.previewImage || article.preview_image || extractFirstImage(article.content);
      return {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        publishedAt: article.publishedAt,
        updatedAt: article.updatedAt,
        preview_image: previewImg,
        previewImage: previewImg,
      };
    });
  } catch (error) {
    console.error(`[getArticlesByTag] Exception:`, error);
    return [];
  }
}

export default async function Home() {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const auctionArticles = await getArticlesByTag(supabase, 'auction', 20);
  const newsArticles = await getArticlesByTag(supabase, 'news', 15);
  
  if (process.env.NODE_ENV !== 'production') {
    console.log('[HomePage] auctionArticles count:', auctionArticles?.length || 0);
    console.log('[HomePage] newsArticles count:', newsArticles?.length || 0);
    if (auctionArticles?.[0]) {
      console.log('[HomePage] auctionArticles[0] keys:', Object.keys(auctionArticles[0]));
    }
  }

  return (
    <main className="relative overflow-hidden py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([PersonSchema, WebsiteSchema, BlogSchema]) }} />
      <BackgroundShapes />
      
      <div className="max-w-5xl mx-auto px-4 space-y-12 sm:space-y-16">
        <CloseableHero />

        {Array.isArray(auctionArticles) && auctionArticles.length > 0 && (
          <section aria-label="Аукционные статьи">
            <Suspense fallback={<AuctionSkeleton />}>
              <AuctionSlider articles={safeData(auctionArticles)} />
            </Suspense>
          </section>
        )}

        <section id="articles">
          <ArticlesFeed initialArticles={safeData(newsArticles)} includeTag="news" />
        </section>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl sm:text-3xl font-semibold">🌊 Flow</h2>
            <Link href="/lab/feed" className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors">Сводная лента →</Link>
          </div>
          <div>
            <FlowFeed limit={12} />
          </div>
        </section>
      </div>
    </main>
  );
}
