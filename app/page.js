// app/page.js



import prisma from '../lib/prisma';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import importDynamic from 'next/dynamic';
import { getFirstImage } from '@/lib/contentUtils';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import dynamic from 'next/dynamic';

// SSR-friendly динамический импорт HeroHearts (только на клиенте)
const HeroHearts = dynamic(() => import('@/components/HeroHearts'), { ssr: false });
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
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400 bg-clip-text text-transparent">Последние статьи</h2>
            <Link 
              href="/articles" 
              className="inline-block rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 shadow-md hover:from-blue-600 hover:to-purple-600 transition-all duration-200"
              aria-label="Посмотреть все статьи"
            >
              Все статьи
            </Link>
          </div>
          <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2" role="list">
            {articles && articles.length > 0 ? (
              articles.map((article) => (
                <article
                  key={article.id}
                  className="bg-white/80 backdrop-blur rounded-2xl shadow-lg hover:shadow-2xl transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden p-4 sm:p-6"
                  role="listitem"
                >
                  <Link 
                    href={`/${article.slug}`} 
                    className="block relative w-full h-48 mb-4 group"
                    aria-label={`Читать статью: ${article.title}`}
                  >
                    {article.previewImage ? (
                      <SafeImage
                        src={article.previewImage}
                        alt={`Изображение к статье: ${article.title}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300 rounded-xl"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center rounded-xl">
                        <div className="text-center">
                          <div className="text-4xl text-gray-300 mb-2">📄</div>
                          <div className="text-sm text-gray-400">Без изображения</div>
                        </div>
                      </div>
                    )}
                  </Link>
                  <div className="flex-grow flex flex-col">
                    <Link href={`/${article.slug}`}>
                      <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                        {article.title}
                      </h3>
                    </Link>
                    {article.publishedAt && (
                      <time 
                        className="text-xs text-gray-500 mb-3"
                        dateTime={article.publishedAt}
                      >
                        {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                    {/* Имя автора и теги убраны по запросу — только дата публикации */}
                  </div>
                </article>
              ))
            ) : (
              <p className="text-center text-gray-500 col-span-full">Здесь пока нет опубликованных статей. Самое время написать первую!</p>
            )}
          </div>
        </div>
        {/* Flow Section - Right column (2/5 width on desktop) */}
        <div className="lg:col-span-2">
          <div className="bg-gradient-to-br from-blue-100 to-purple-100 rounded-2xl p-6 lg:sticky lg:top-8 shadow-md border border-blue-50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">🌊 Flow</h2>
              <Link 
                href="/lab"
                className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-blue-400 to-purple-400 text-white font-semibold px-4 py-1.5 shadow hover:from-blue-500 hover:to-purple-500 transition-all text-sm"
                aria-label="Перейти в лабораторию"
              >
                Лаборатория
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <FlowFeed limit={5} />
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
