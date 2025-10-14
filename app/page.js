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


// Получить опубликованные статьи (без тегов)
async function getArticles() {
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient();
  const { data, error } = await supabase
    .from('articles')
    .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
    .eq('published', true)
    .order('updatedAt', { ascending: false })
    .limit(15);
  if (error) {
    return [];
  }
  return Array.isArray(data) ? data : [];
}
export default async function Home() {
  // SSR: Получаем опубликованные статьи
  const articles = await getArticles();

  return (
    <main>
      <section className="max-w-3xl mx-auto py-8 px-4">
        <h1 className="text-3xl font-bold mb-6">Последние статьи</h1>
        <ArticlesFeed initialArticles={articles} />
      </section>
    </main>
  );
}
