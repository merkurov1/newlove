// app/page.js



import prisma from '../lib/prisma';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { getFirstImage } from '@/lib/contentUtils';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import nextDynamic from 'next/dynamic';

// SSR-friendly динамический импорт HeroHearts (только на клиенте)
const HeroHearts = nextDynamic(() => import('@/components/HeroHearts'), { ssr: false });
import FlowFeed from '@/components/FlowFeed';
// Удалены Framer Motion и FadeInSection для server component совместимости

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = {
  title: 'Anton Merkurov | Art x Love x Money - Медиа, технологии и искусство',
  description: 'Персональный сайт и блог Антона Меркурова. Последние публикации о медиа, технологиях, digital-маркетинге и современном искусстве.',
  keywords: ['Антон Меркуров', 'медиа', 'технологии', 'digital', 'искусство', 'блог', 'статьи', 'маркетинг'],
  authors: [{ name: 'Anton Merkurov', url: 'https://merkurov.love' }],
  creator: 'Anton Merkurov',
  publisher: 'Anton Merkurov',
  alternates: {
    canonical: 'https://merkurov.love',
    types: {
      'application/rss+xml': 'https://merkurov.love/rss.xml'
    }
  },
  openGraph: {
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Персональный сайт и блог о медиа, технологиях и современном искусстве.',
    url: 'https://merkurov.love',
    siteName: 'Anton Merkurov',
    locale: 'ru_RU',
    type: 'website',
    images: [{
      url: 'https://nzasvblckrwsnlxsqfma.supabase.co/storage/v1/object/public/media/og-home.png',
      width: 1200,
      height: 630,
      alt: 'Anton Merkurov - Медиа, технологии и искусство'
    }]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Anton Merkurov | Art x Love x Money',
    description: 'Медиа, технологии и современное искусство',
    images: ['https://nzasvblckrwsnlxsqfma.supabase.co/storage/v1/object/public/media/og-home.png']
  }
};

export const dynamic = 'force-dynamic';



async function getArticles() {
  try {
    const articles = await prisma.article.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 9,
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        publishedAt: true,
        author: {
          select: {
            name: true,
            image: true,
          },
        },
        tags: true,
      },
    });
    return articles;
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error("!!! Ошибка при загрузке статей для главной страницы:", error);
    }
    return [];
  }
}

export default async function HomePage() {
  const rawArticles = await getArticles();
  
  // Получаем previewImage для каждой статьи асинхронно
  const articles = await Promise.all(
    rawArticles.map(async (article) => {
      try {
        const previewImage = await getFirstImage(article.content);
        return {
          ...article,
          previewImage
        };
      } catch (error) {
        console.error('Error getting preview image for article:', article.id, error);
        return {
          ...article,
          previewImage: null
        };
      }
    })
  );

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100 pb-16">
      {/* Новый HeroHearts */}
      <div className="max-w-5xl mx-auto pt-8 px-4">
        <HeroHearts />
      </div>

      {/* Two-column layout: Articles + Flow */}
      <section className="max-w-7xl mx-auto mt-8 px-4 grid grid-cols-1 lg:grid-cols-5 gap-10 lg:gap-16">
        {/* Articles Section - Left column (3/5 width on desktop) */}
        <div className="lg:col-span-3">
          {/* ARTICLES SECTION */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">Articles</h2>
            <Link
              href="/articles"
              className="rounded-full bg-white/90 backdrop-blur-sm border border-pink-200 text-pink-500 px-8 py-3 text-sm font-medium hover:bg-pink-50 hover:border-pink-300 transition-all duration-300"
              aria-label="Посмотреть все статьи"
            >
              Load more articles
            </Link>
          </div>
          <div className="grid gap-6 sm:gap-8 grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
            {articles && articles.length > 0 ? (
              articles.map((article, idx) => (
                <article
                  key={article.id}
                  className="bg-white/90 backdrop-blur-sm border border-pink-50 rounded-2xl shadow-sm hover:shadow-lg p-6 flex flex-col group overflow-hidden transition-all duration-300 hover:scale-[1.02] animate-fade-in-up"
                  style={{ animationDelay: `${idx * 100}ms`, animationFillMode: 'both' }}
                  role="listitem"
                >
                  {/* Время публикации */}
                  {article.publishedAt && (
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm text-gray-400">
                        {(() => {
                          const diff = Math.floor((Date.now() - new Date(article.publishedAt).getTime()) / 1000);
                          if (diff < 60) return `${diff} sec ago`;
                          if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
                          if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
                          return new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                        })()}
                      </span>
                    </div>
                  )}
                  {/* Розовая линия убрана по финальному ТЗ */}
                  {/* Изображение */}
                  <Link
                    href={`/${article.slug}`}
                    className="block relative w-full aspect-[16/9] mb-4 group"
                    aria-label={`Читать статью: ${article.title}`}
                  >
                    {article.previewImage ? (
                      <SafeImage
                        src={article.previewImage}
                        alt={`Изображение к статье: ${article.title}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover rounded-xl transition-transform duration-300 group-hover:scale-105"
                        style={{ minHeight: '120px' }}
                      />
                    ) : (
                      <div className="w-full h-full min-h-[120px] bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center rounded-xl">
                        <div className="text-center">
                          <div className="text-4xl text-gray-300 mb-2">�</div>
                          <div className="text-sm text-gray-400">No image</div>
                        </div>
                      </div>
                    )}
                  </Link>
                  {/* Заголовок и описание */}
                  <div className="flex-grow flex flex-col">
                    <Link href={`/${article.slug}`}> 
                      <h3 className="text-xl md:text-2xl font-semibold text-gray-900 mb-2 line-clamp-2">{article.title}</h3>
                    </Link>
                    {/* Краткое описание (excerpt) */}
                    {article.content && (
                      <div className="text-base leading-relaxed text-gray-600 line-clamp-2 mb-4">{article.content.replace(/<[^>]+>/g, '').slice(0, 160)}</div>
                    )}
                  </div>
                  {/* Read more кнопка убрана по финальному ТЗ */}
                </article>
              ))
            ) : (
              <p className="text-center text-gray-500 col-span-full">Здесь пока нет опубликованных статей. Самое время написать первую!</p>
            )}
          </div>
        </div>
        {/* SOCIAL SECTION */}
        <div className="lg:col-span-2 mt-20">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">Social</h2>
            <Link
              href="/lab"
              className="rounded-full bg-white/90 backdrop-blur-sm border border-pink-200 text-pink-500 px-8 py-3 text-sm font-medium hover:bg-pink-50 hover:border-pink-300 transition-all duration-300"
              aria-label="Перейти в лабораторию"
            >
              View all posts
            </Link>
          </div>
          <FlowFeed limit={6} />
          <div className="flex justify-center mt-8">
            <button
              className="rounded-full bg-white/90 backdrop-blur-sm border border-pink-200 text-pink-500 px-8 py-3 text-sm font-medium hover:bg-pink-50 hover:border-pink-300 transition-all duration-300"
              // TODO: добавить обработчик загрузки постов
            >
              Load more posts
            </button>
          </div>
        </div>
      </section>
      {/* SEO Structured Data */}
      <div className="hidden">
        <PersonSchema
          name="Anton Merkurov"
          url="https://merkurov.love"
          image="https://nzasvblckrwsnlxsqfma.supabase.co/storage/v1/object/public/media/anton-photo.jpg"
          jobTitle="Digital Strategist & Media Expert"
          description="Эксперт по медиа, технологиям и цифровым стратегиям. Автор блога о современном искусстве и digital-трендах."
          sameAs={[
            "https://t.me/merkurov_channel",
            "https://twitter.com/merkurov",
            "https://instagram.com/merkurov"
          ]}
        />
        <WebsiteSchema
          name="Anton Merkurov"
          url="https://merkurov.love"
          description="Персональный сайт и блог Антона Меркурова о медиа, технологиях и современном искусстве"
          author="Anton Merkurov"
        />
        <BlogSchema
          name="Anton Merkurov Blog"
          url="https://merkurov.love"
          description="Блог о медиа, технологиях, digital-маркетинге и современном искусстве"
          author="Anton Merkurov"
        />
      </div>
    </div>
  );
}
