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


// Получить статьи с тегами
async function getArticles() {

  // Для публичной главной всегда используем только публичный anon Supabase client (без cookies)
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient();

  const { data, error } = await supabase
    .from('articles')
    .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
    .eq('published', true)
    .order('updatedAt', { ascending: false })
    .limit(15);
  if (error) {
    // Если ошибка доступа к articles — вернуть ошибку
    return { error, data: [] };
  }
  // attach tags after fetch, но если ошибка — вернуть статьи без тегов
  const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
  const safeRows = Array.isArray(data) ? data : [];
  try {
    const dataWithTags = await attachTagsToArticles(supabase, safeRows);
    return dataWithTags || [];
  } catch (e) {
    console.error('attachTagsToArticles failed', e);
    // Вернуть статьи без тегов, если ошибка доступа к тегам
    return safeRows;
  }
}
export default async function Home() {
  // Ensure articles are fully serializable before using them in client components
  const articlesResult = await getArticles();
  const rawArticles = safeData(Array.isArray(articlesResult) ? articlesResult : articlesResult.data || []);
  const fetchError = articlesResult && articlesResult.error;

  // Для каждой статьи вычисляем previewImage
  const articles = await Promise.all(
    rawArticles.map(async (article) => {
      const previewImage = await getFirstImage(article.content);
      // safeData to strip any remaining unserializable props
      return safeData({ ...article, previewImage });
    })
  );

  // 1. Отбираем статьи с тегом auction (регистр не важен)
  const auctionArticles = articles.filter((a) => a.tags && a.tags.some((t) => t.slug?.toLowerCase() === 'auction'));
  // 2. Остальные статьи (без auction)
  const otherArticles = articles.filter((a) => !(a.tags && a.tags.some((t) => t.slug?.toLowerCase() === 'auction')));
  // Все статьи без auction
  const feedArticles = otherArticles;

  return (
    <div className="relative min-h-screen bg-white pb-0 overflow-x-hidden">
      {fetchError && (
        <div className="bg-red-100 text-red-700 p-4 mb-4 rounded border border-red-300">
          <b>Ошибка загрузки статей:</b> {fetchError.message}
        </div>
      )}

      {/* Новый HeroHearts — edge-to-edge */}
      <div className="w-full pt-0 pb-0">
        <HeroHearts />
      </div>
      {/* Отступ после hero */}
      <div style={{ height: 64 }} />

      {/* Auction Slider Section */}
      {auctionArticles.length > 0 && (
        <section className="w-full mt-0 mb-0 px-2 md:px-6">
          <div className="flex flex-col items-center justify-center w-full">
            <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center tracking-tight" style={{ letterSpacing: '-0.01em' }}>
              Экономлю время, нахожу лучшее
            </h2>
          </div>
          <AuctionSlider articles={auctionArticles} />
        </section>
      )}

      {/* ArticlesFeed */}
      <section className="w-full mt-16 px-2 md:px-6">
        <div className="max-w-6xl mx-auto px-4 md:px-10">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-lg uppercase tracking-widest text-gray-400 font-semibold">Articles</h2>
          </div>
          <ArticlesFeed initialArticles={feedArticles} />
        </div>
      </section>

      {/* Social section */}
      <section className="w-full mt-20 px-0">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex items-center justify-between px-4">
            <h2 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">Social</h2>
            <Link href="/lab" className="px-6 py-2 border border-gray-300 text-gray-800 font-medium rounded-none hover:bg-gray-100 transition text-sm" aria-label="Перейти в лабораторию">
              View all posts
            </Link>
          </div>
          <FlowFeed limit={6} />
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
          sameAs={["https://t.me/merkurov_channel", "https://twitter.com/merkurov", "https://instagram.com/merkurov"]}
        />
        <WebsiteSchema name="Anton Merkurov" url="https://merkurov.love" description="Персональный сайт и блог Антона Меркурова о медиа, технологиях и современном искусстве" author="Anton Merkurov" />
        <BlogSchema name="Anton Merkurov Blog" url="https://merkurov.love" description="Блог о медиа, технологиях, digital-маркетинге и современном искусстве" author="Anton Merkurov" />
      </div>
    </div>
  );
}
