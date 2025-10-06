// app/page.js



import prisma from '../lib/prisma';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import importDynamic from 'next/dynamic';
import { getFirstImage } from '@/lib/contentUtils';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import WelcomeBanner from '@/components/WelcomeBanner';
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
    <>
      {/* Smart Welcome Banner */}
      <WelcomeBanner />

      {/* Two-column layout: Articles + Flow */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
        {/* Articles Section - Left column (3/5 width on desktop) */}
        <div className="lg:col-span-3">
          <div className="flex items-center justify-between mb-8">
            <div className="flex-1"></div>
            <Link 
              href="/articles" 
              className="text-blue-600 hover:text-blue-700 font-medium"
              aria-label="Посмотреть все статьи"
            >
              Все статьи →
            </Link>
          </div>
          <div className="grid gap-4 sm:gap-8 grid-cols-1 sm:grid-cols-2 xl:grid-cols-2" role="list">
            {articles && articles.length > 0 ? (
              articles.map((article) => (
                <article
                  key={article.id}
                  className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden p-3 sm:p-6"
                  role="listitem"
                >
                  <Link 
                    href={`/${article.slug}`} 
                    className="block relative w-full h-48 mb-4"
                    aria-label={`Читать статью: ${article.title}`}
                  >
                    {article.previewImage ? (
                      <SafeImage
                        src={article.previewImage}
                        alt={`Изображение к статье: ${article.title}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-300 rounded-lg"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center rounded-lg">
                        <div className="text-center">
                          <div className="text-4xl text-gray-300 mb-2">📄</div>
                          <div className="text-sm text-gray-400">Без изображения</div>
                        </div>
                      </div>
                    )}
                  </Link>
                  <div className="flex-grow flex flex-col">
                    <Link href={`/${article.slug}`}>
                      <h3 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                        {article.title}
                      </h3>
                    </Link>
                    {article.publishedAt && (
                      <time 
                        className="text-sm text-gray-500 mb-4"
                        dateTime={article.publishedAt}
                      >
                        {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </time>
                    )}
                    {/* Описание/контент убран по требованию — только заголовок и картинка */}
                    {article.tags && article.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4" role="list">
                        {article.tags.map(tag => (
                          <Link
                            key={tag.id}
                            href={`/tags/${tag.slug}`}
                            className="bg-gray-100 text-gray-600 text-xs sm:text-xs font-medium px-3 py-2 rounded-full hover:bg-gray-200 min-h-[36px] min-w-[44px] flex items-center justify-center"
                            role="listitem"
                            aria-label={`Статьи с тегом ${tag.name}`}
                          >
                            {tag.name}
                          </Link>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100">
                      {article.author.image && (
                        <SafeImage 
                          src={article.author.image} 
                          alt={`Фото автора ${article.author.name}`} 
                          width={32} 
                          height={32} 
                          className="rounded-full" 
                        />
                      )}
                      <span className="text-sm font-medium text-gray-600">{article.author.name}</span>
                    </div>
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
          <div className="bg-gray-50 rounded-xl p-6 lg:sticky lg:top-8">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                🌊 Flow
              </h2>
              <Link 
                href="/lab"
                className="text-blue-600 hover:text-blue-700 font-medium text-sm flex items-center gap-1"
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
    </>
  );
}
