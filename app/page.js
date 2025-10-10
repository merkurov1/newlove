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
import dynamic from 'next/dynamic';

const ArticlesFeed = dynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
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




async function getArticles() {
  try {
    const articles = await prisma.article.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 15,
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
      <div className="max-w-5xl mx-auto pt-8 px-6 md:px-4">
        <HeroHearts />
      </div>

    {/* Two-column layout: Articles + Flow */}
  <section className="max-w-7xl mx-auto mt-12 px-6 md:px-4 grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Articles Section - Left column (3/5 width on desktop) */}
  <div className="lg:col-span-3 min-w-0">
          {/* ARTICLES SECTION */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">Articles</h2>
          </div>
          <ArticlesFeed initialArticles={articles} />
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
