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
const ArticlesFeed = nextDynamic(() => import('@/components/ArticlesFeed'), { ssr: false });
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });


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
  const rawArticles = await getArticles();
  // Для каждой статьи вычисляем previewImage
  const articles = await Promise.all(
    rawArticles.map(async (article) => {
      const previewImage = await getFirstImage(article.content);
      return { ...article, previewImage };
    })
  );
  // 1. Отбираем статьи с тегом auction (регистр не важен)
  const auctionArticles = articles.filter(a => a.tags && a.tags.some(t => t.slug?.toLowerCase() === 'auction'));
  // 2. Остальные статьи (без auction)
  const otherArticles = articles.filter(a => !(a.tags && a.tags.some(t => t.slug?.toLowerCase() === 'auction')));
  // Hero-article: первый article из otherArticles
  const heroArticle = otherArticles[0];
  const feedArticles = otherArticles.slice(1);
  return (
    <div className="relative min-h-screen bg-white pb-0">
      {/* Новый HeroHearts — edge-to-edge */}
      <div className="w-full pt-0 pb-0">
        <HeroHearts />
      </div>

      {/* Auction Slider Section — edge-to-edge, no max-w, no border-radius */}
      {auctionArticles.length > 0 && (
        <section className="w-full mt-0 mb-0">
          <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center tracking-tight" style={{letterSpacing:'-0.01em'}}>Экономлю время, нахожу лучшее</h2>
          <AuctionSlider articles={auctionArticles} />
        </section>
      )}

      {/* Hero Article Section — edge-to-edge, no rounded, no card */}
      {heroArticle && (
        <section className="w-full mb-0">
          <article className="w-full flex flex-col items-center">
            {heroArticle.previewImage && (
              <div className="w-full aspect-[4/2] relative overflow-hidden mb-4">
                <SafeImage src={heroArticle.previewImage} alt={heroArticle.title} fill className="object-cover w-full h-full" />
              </div>
            )}
            <h2 className="text-3xl font-bold text-gray-900 mb-2 text-center max-w-3xl tracking-tight" style={{letterSpacing:'-0.01em'}}>{heroArticle.title}</h2>
            {heroArticle.description && (
              <p className="text-gray-700 mb-4 text-center max-w-2xl text-lg">{heroArticle.description}</p>
            )}
            <Link href={`/${heroArticle.slug}`} className="inline-block mt-2 px-8 py-3 border border-gray-300 text-gray-800 font-medium rounded-none hover:bg-gray-100 transition text-base">Подробнее</Link>
          </article>
        </section>
      )}

      {/* ArticlesFeed — edge-to-edge, no cards, gallery style */}
      <section className="w-full mt-12">
        <div className="mb-8 flex items-center justify-between px-4">
          <h2 className="text-lg uppercase tracking-widest text-gray-400 font-semibold">Articles</h2>
        </div>
        <ArticlesFeed initialArticles={feedArticles} />
      </section>

      {/* SOCIAL SECTION (оставим как есть, если нужно — уберём фон/карточки отдельно) */}
      <section className="max-w-7xl mx-auto mt-20 px-6 md:px-4 grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-6">
        <div className="lg:col-span-2 mt-0">
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
