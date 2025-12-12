import { sanitizeMetadata } from '@/lib/metadataSanitize';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';
import type { Metadata } from 'next';

async function getDigestBySlug(slug: string) {
  const { supabase } = await getUserAndSupabaseForRequest();
  const supabaseClient = supabase;

  if (!supabaseClient) {
    // If we couldn't get a supabase client from the request or server fallback,
    // throw notFound to avoid returning null (which breaks Google Search Console)
    notFound();
  }

  try {
    const { data, error } = await supabaseClient
      .from('digests')
      .select('title, content, created_at')
      .eq('slug', slug)
      .single();

    if (error || !data) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching digest:', error);
      }
      notFound();
    }

    return data;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Unexpected error querying digests table:', err);
    }
    // На проде: если таблицы нет или запрос упал — показываем 404, не даём развалить сервер
    notFound();
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const digest = await getDigestBySlug(params.slug);
  return sanitizeMetadata({
    title: digest?.title || 'Дайджест не найден',
  });
}


export default async function DigestPage({ params }: { params: { slug: string } }) {
  const digest = await getDigestBySlug(params.slug);
  
  // Additional safety check: if digest is null/undefined, show 404
  if (!digest) {
    notFound();
  }

  let blocks = [];
  if (typeof digest.content === 'string') {
    try {
      blocks = JSON.parse(digest.content);
    } catch {
      return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: content не является валидным JSON массивом блоков!</div>;
    }
  } else if (Array.isArray(digest.content)) {
    blocks = digest.content;
  } else {
    return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: content не массив блоков!</div>;
  }
  // Валидация структуры блоков
  const valid = Array.isArray(blocks) && blocks.every(b => b.type);
  if (!valid) {
    return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: структура блоков некорректна!</div>;
  }
  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Ссылка для возврата на главную страницу */}
      <Link href="/" className="text-blue-500 hover:text-blue-600 mb-6 inline-block">
        &larr; Назад ко всем дайджестам
      </Link>

      <article>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
          {digest.title}
        </h1>
        <p className="text-md text-gray-500 mb-8">
          Опубликовано: {new Date(digest.created_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
        <BlockRenderer blocks={blocks} />
      </article>
    </div>
  );
}
