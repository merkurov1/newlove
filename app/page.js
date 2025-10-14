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


// Надёжный SSR-запрос опубликованных статей через anon key
async function getArticles() {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      console.error('Supabase env vars missing');
      return [];
    }
    const supabase = createClient(supabaseUrl, anonKey);
    const { data, error } = await supabase
      .from('articles')
      .select('id,title,slug,content,publishedAt,updatedAt,author:authorId(name)')
      .eq('published', true)
      .order('updatedAt', { ascending: false })
      .limit(15);
    if (error) {
      console.error('Supabase fetch articles error', error);
      return [];
    }
    if (!Array.isArray(data)) {
      console.error('Supabase articles: data is not array', data);
      return [];
    }
    // Гарантируем структуру для компонента
    return data.map(a => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      content: a.content,
      publishedAt: a.publishedAt,
      updatedAt: a.updatedAt,
      author: a.author || null,
    }));
  } catch (e) {
    console.error('SSR getArticles fatal error', e);
    return [];
  }
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
