// app/digest/[slug]/page.js
import { createClient } from '../../../lib/supabase-server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import BlockRenderer from '@/components/BlockRenderer';

// Эта функция получает данные для одного конкретного дайджеста по его slug
async function getDigestBySlug(slug) {
  const supabaseClient = createClient();

  const { data, error } = await supabaseClient
    .from('digests')
    .select('title, content, created_at')
    .eq('slug', slug) // Находим запись с совпадающим slug
    .single(); // .single() выбирает только одну запись. Если ничего не найдено, вернет null.

  if (error && !data) {
    console.error('Error fetching digest:', error);
    // Если дайджест не найден, показываем страницу 404
    notFound();
  }

  return data;
}

// Эта функция устанавливает метаданные страницы (например, заголовок во вкладке браузера)
export async function generateMetadata({ params }) {
  const digest = await getDigestBySlug(params.slug);
  return {
    title: digest?.title || 'Дайджест не найден',
  };
}


// Сама страница
export default async function DigestPage({ params }) {
  const digest = await getDigestBySlug(params.slug);

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
        <div style={{background:'#ff0',color:'#d00',border:'4px solid #d00',padding:'2rem',margin:'2rem 0',fontSize:'18px',zIndex:9999,position:'relative',boxShadow:'0 0 16px 4px #d00',textAlign:'left',fontWeight:'bold',lineHeight:1.4,wordBreak:'break-all',whiteSpace:'pre-wrap',pointerEvents:'auto',opacity:1,display:'block'}}>
          <div style={{fontSize:'22px',marginBottom:'1rem'}}>=== DEBUG BLOCKS START ===</div>
          <pre style={{background:'none',color:'#222',fontSize:'16px',margin:0,padding:0,border:'none',boxShadow:'none',whiteSpace:'pre-wrap',wordBreak:'break-all',fontFamily:'monospace',fontWeight:'normal'}}>{JSON.stringify(blocks, null, 2)}</pre>
          <div style={{fontSize:'22px',marginTop:'1rem'}}>=== DEBUG BLOCKS END ===</div>
        </div>
        <BlockRenderer blocks={blocks} />
      </article>
    </div>
  );
}
