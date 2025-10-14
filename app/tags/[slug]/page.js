// app/tags/[slug]/page.js

// (helper loaded dynamically inside getTagData)
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import SafeImage from '@/components/SafeImage';

// --- 1. ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ ДАННЫХ ---
// Находит тег по его slug и подгружает все связанные с ним статьи
async function getTagData(slug) {
  const globalReq = (globalThis && globalThis.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const getUserAndSupabaseFromRequest = mod.getUserAndSupabaseFromRequest || mod.default || mod;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
  if (!supabase) notFound();
  // Поиск тега по slug (регистр игнорируем вручную)
  const { data: tags } = await supabase.from('Tag').select('*').ilike('slug', slug).limit(1);
  const tag = (tags && tags[0]) || null;
  if (!tag) notFound();
  // Получаем связанные статьи через junction _ArticleToTag
  const { data: articles } = await supabase.rpc('get_articles_by_tag', { tag_slug: tag.slug }).catch(async () => {
    // fallback: query articles by checking tags relation manually if rpc not present
    const { data: rels } = await supabase.from('_ArticleToTag').select('A').eq('B', tag.id);
    const ids = (rels || []).map(r => r.A);
    if (ids.length === 0) return { data: [] };
    const { data: arts } = await supabase.from('articles').select('*, author:authorId(name,image)').in('id', ids).eq('published', true).order('publishedAt', { ascending: false });
    // attach tags via helper
    const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
    const artsWithTags = await attachTagsToArticles(supabase, arts || []);
    return { data: artsWithTags };
  });
  tag.articles = (articles && articles.data) || (articles || []);
  return tag;
}

// --- 2. ГЕНЕРИРУЕМ МЕТАДАННЫЕ ДЛЯ SEO ---
export async function generateMetadata({ params }) {
  const tag = await getTagData(params.slug);
  const meta = {
    title: `Материалы по тегу: ${tag.name}`,
    description: `Все статьи и проекты, отмеченные тегом "${tag.name}"`,
  };
  return sanitizeMetadata(meta);
}

// --- 3. САМ КОМПОНЕНТ СТРАНИЦЫ ---
export default async function TagPage({ params }) {
  let tag;
  try {
    tag = await getTagData(params.slug);
  } catch (e) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 text-center p-8">
        <h1 className="text-6xl font-bold text-blue-600 mb-4">404</h1>
        <h2 className="text-2xl font-semibold text-gray-800 mb-2">Тег не найден</h2>
        <p className="text-gray-500 mb-8">Возможно, вы ошиблись адресом или тег был удалён.</p>
        <Link href="/" className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition">На главную</Link>
      </div>
    );
  }
  const articles = tag.articles;

  // Функция для получения превью-картинки (можно вынести в утилиты)
  function getFirstImage(content) {
    if (!content) return null;
    const regex = /!\[.*?\]\((.*?)\)/;
    const match = content.match(regex);
    return match ? match[1] : null;
  }

    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-12 px-4">
        <div className="max-w-4xl mx-auto mb-12">
          <p className="text-lg text-gray-500 mb-2">Материалы по тегу</p>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400 bg-clip-text text-transparent"># {tag.name}</h1>
        </div>

      {/* --- СЕТКА СТАТЕЙ (аналогично главной странице) --- */}
      {articles.length > 0 ? (
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-2">
          {articles.map((article) => {
            const previewImage = getFirstImage(article.content);
            return (
              <div key={article.id} className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden">
                {previewImage && (
                  <Link href={`/${article.slug}`} className="block relative w-full h-48">
                    <Image src={previewImage} alt={article.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  </Link>
                )}
                <div className="p-6 flex-grow flex flex-col">
                  <Link href={`/${article.slug}`}>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">{article.title}</h2>
                  </Link>
                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {article.tags.map(t => (
                        <Link key={t.id} href={`/tags/${t.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{t.name}</Link>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100">
                    {article.author.image && <SafeImage src={article.author.image} alt={article.author.name || ''} width={32} height={32} className="rounded-full" />}
                    <span className="text-sm font-medium text-gray-600">{article.author.name}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500 col-span-full">По этому тегу пока нет ни одной опубликованной статьи.</p>
      )}
    </div>
  );
}
