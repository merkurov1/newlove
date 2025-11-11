import { notFound } from 'next/navigation';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';
import Image from 'next/image';
import SafeImage from '@/components/SafeImage';
import dynamic from 'next/dynamic';
import type { Metadata } from 'next';

const AuctionGrid = dynamic(() => import('@/components/AuctionGrid'), { ssr: false });

async function getTagData(slug: string) {
  const normalized = String(slug || '').trim();
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const supabase = getServerSupabaseClient({ useServiceRole: true });

  const { getTagBySlug, getArticlesByTag } = await import('@/lib/tagHelpers');
  // Find tag (tolerant lookup inside helper)
  const tag = await getTagBySlug(supabase, normalized);
  if (!tag) {
    notFound();
  }

  const lookupKey = tag.slug || tag.name || normalized;
  const articles = await getArticlesByTag(supabase, lookupKey, 50);
  // Attach tags to fetched articles for UI (best effort)
  try {
    const { attachTagsToArticles } = await import('@/lib/attachTagsToArticles');
    tag.articles = await attachTagsToArticles(supabase, articles || []);
  } catch (e) {
    tag.articles = articles || [];
  }

  // Fallbacks: if helper/RPC returned empty result, try stricter/junction-based reads
  if ((!Array.isArray(tag.articles) || tag.articles.length === 0)) {
    try {
      const { getArticlesByTagStrict, readArticleRelationsForTagStrict } = await import('@/lib/tagHelpers');
      // Try strict junction-based fetch first
      const strict = await getArticlesByTagStrict(supabase, lookupKey, 50).catch(() => []);
      if (Array.isArray(strict) && strict.length > 0) {
        tag.articles = strict;
      } else {
        // If strict didn't work, try reading junction relations to surface IDs
        const th = await import('@/lib/tagHelpers');
        const tagRow = await th.getTagBySlug(supabase, lookupKey);
        if (tagRow && tagRow.id) {
          const rels = await readArticleRelationsForTagStrict(supabase, tagRow.id).catch(() => []);
          const ids = Array.from(new Set((rels || []).map((r: any) => (r && (r.A || r.a || r.article_id || r.articleId || (r.article && (r.article.id || r.article._id)) || null))).filter(Boolean).map(String)));
          if (ids && ids.length > 0) {
            // Fetch articles by ids via supabase (tolerant select shapes)
            try {
              const res = await supabase.from('articles').select('*').in('id', ids).limit(50);
              const rows = (res && res.data) ? res.data : (Array.isArray(res) ? res : []);
              if (Array.isArray(rows) && rows.length > 0) {
                const { getFirstImage } = await import('@/lib/contentUtils');
                tag.articles = rows.map((a: any) => ({ ...a, preview_image: a.previewImage || a.preview_image || (a.content ? getFirstImage(a.content) : null) }));
              }
            } catch (e) {
              // ignore
            }
          }
        }
      }
    } catch (e) {
      // ignore overall fallback errors
    }
  }
  if (!Array.isArray(tag.articles)) tag.articles = [];
  return tag;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const tag = await getTagData(params.slug);
  const meta = {
    title: `Материалы по тегу: ${tag.name}`,
    description: `Все статьи и проекты, отмеченные тегом "${tag.name}"`,
  };
  return sanitizeMetadata(meta);
}

export default async function TagPage({ params }: { params: { slug: string } }) {
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

  function getFirstImage(content: any) {
    if (!content || typeof content !== 'string') return null;
    try {
        const contentArray = JSON.parse(content);
        if (Array.isArray(contentArray)) {
            for (const block of contentArray) {
                const html = block?.data?.html;
                if (html && typeof html === 'string') {
                    const match = html.match(/<img[^>]+src="([^"]+)"/);
                    if (match && match[1]) {
                        return match[1].replace(/([^:]\/)\/+/g, "$1");
                    }
                }
            }
        }
    } catch (e) { /* Игнорируем ошибку парсинга JSON */ }
    
    // Fallback для HTML и markdown
    const fallbackMatch = content.match(/<img[^>]+src="([^"]+)"/);
    if (fallbackMatch && fallbackMatch[1]) {
        return fallbackMatch[1].replace(/([^:]\/)\/+/g, "$1");
    }
    
    const mdMatch = content.match(/!\[.*?\]\((.*?)\)/);
    return mdMatch ? mdMatch[1] : null;
  }

  // Специальная обработка для тега "Auction" - показываем полноэкранный слайдер
  const isAuctionTag = params.slug.toLowerCase() === 'auction';

  if (isAuctionTag && articles.length > 0) {
    const articlesWithImages = articles.map((article: any) => ({
      ...article,
      preview_image: getFirstImage(article.content) || null,
      excerpt: article.excerpt || null
    }));

    return <AuctionGrid articles={articlesWithImages} />;
  }

  // Обычное отображение для других тегов
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-12 px-4">
      <div className="max-w-4xl mx-auto mb-12">
        <p className="text-lg text-gray-500 mb-2">Материалы по тегу</p>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400 bg-clip-text text-transparent"># {tag.name}</h1>
      </div>

      {/* --- СЕТКА СТАТЕЙ (аналогично главной странице) --- */}
      {articles.length > 0 ? (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-2">
          {articles.map((article: any) => {
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
                      {article.tags.map((t: any) => (
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
