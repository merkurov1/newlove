// app/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { safeData } from '@/lib/safeSerialize';

const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const BentoArticlesFeed = nextDynamic(() => import('@/components/BentoArticlesFeed'), { ssr: false });
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

async function getArticlesByTag(supabase: any, tagSlug: string, limit = 50) {
  const { data, error } = await supabase.rpc('get_articles_by_tag_slug', {
    tag_slug: tagSlug,
    limit_param: limit
  });

  if (error) {
    console.error(`Ошибка при получении статей с тегом "${tagSlug}":`, error);
    return [];
  }

  return (data || []).map((article: any) => ({
      ...article,
      preview_image: extractFirstImage(article.content)
  }));
}

export default async function Home() {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const auctionArticles = await getArticlesByTag(supabase, 'auction', 20);
  const newsArticles = await getArticlesByTag(supabase, 'news', 15);

  const personSchema = {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "Anton Merkurov",
    "url": "https://merkurov.love",
    "image": "https://merkurov.love/avatar.jpg",
    "jobTitle": "Artist, Developer, Entrepreneur",
    "description": "Медиа, технологии и искусство",
    "sameAs": [
      "https://twitter.com/merkurov",
      "https://github.com/merkurov1"
    ]
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "Website",
    "name": "Anton Merkurov",
    "url": "https://merkurov.love",
    "description": "Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.",
    "author": {
      "@type": "Person",
      "name": "Anton Merkurov",
      "url": "https://merkurov.love"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://merkurov.love/search?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "name": "Anton Merkurov",
    "url": "https://merkurov.love",
    "description": "Медиа, технологии и искусство. Персональный сайт и блог Антона Меркурова.",
    "author": {
      "@type": "Person",
      "name": "Anton Merkurov",
      "url": "https://merkurov.love"
    }
  };

  return (
    <main className="relative overflow-hidden py-8 sm:py-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(blogSchema) }} />
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
          <Suspense fallback={<div className="animate-pulse h-96 bg-gray-200 rounded-xl" />}>
            <BentoArticlesFeed initialArticles={safeData(newsArticles)} includeTag="news" />
          </Suspense>
        </section>

        <section>
          <div className="mb-6">
            <h2 className="text-2xl sm:text-3xl font-semibold">🌊 Flow</h2>
          </div>
          <Suspense fallback={<div className="animate-pulse h-64 bg-gray-200 rounded-xl" />}>
            <FlowFeed limit={12} />
          </Suspense>
        </section>
      </div>
    </main>
  );
}
