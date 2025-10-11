// app/page.js



import prisma from '../lib/prisma';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { getFirstImage } from '@/lib/contentUtils';
import { PersonSchema, WebsiteSchema, BlogSchema } from '@/components/SEO/StructuredData';
import nextDynamic from 'next/dynamic';


// SSR-friendly динамический импорт HeroHearts (только на клиенте)
const HeroHearts = nextDynamic(() => import('@/components/HeroHearts'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });


// Получить статьи с тегами
async function getArticles() {
  return prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: 15,
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      publishedAt: true,
      tags: { select: { slug: true, name: true } },
      author: { select: { name: true } },
    },
  });
}

export default async function Home() {
  const articles = await getArticles();
  // 1. Отбираем статьи с тегом auction (регистр не важен)
  const auctionArticles = articles.filter(a => a.tags && a.tags.some(t => t.slug?.toLowerCase() === 'auction'));
  // 2. Остальные статьи (без auction)
  const otherArticles = articles.filter(a => !(a.tags && a.tags.some(t => t.slug?.toLowerCase() === 'auction')));
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-pink-50 via-white to-pink-100 pb-16">
      {/* Новый HeroHearts */}
      <div className="max-w-5xl mx-auto pt-8 px-6 md:px-4">
        <HeroHearts />
      </div>

      {/* Auction Slider Section */}
      {auctionArticles.length > 0 && (
        <section className="max-w-5xl mx-auto mt-10 mb-16">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 text-center">Экономлю время, нахожу лучше</h2>
          <AuctionSlider articles={auctionArticles} />
        </section>
      )}

      {/* Two-column layout: Articles + Flow */}
      <section className="max-w-7xl mx-auto mt-12 px-6 md:px-4 grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        {/* Articles Section - Left column (3/5 width on desktop) */}
        <div className="lg:col-span-3 min-w-0">
          {/* ARTICLES SECTION */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">Articles</h2>
          </div>
          <ArticlesFeed initialArticles={otherArticles} />
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
          sameAs={["https://t.me/merkurov_channel","https://twitter.com/merkurov","https://instagram.com/merkurov"]}
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
