// app/digest/[slug]/page.js
import { createClient } from '../../../lib/supabase-server'; // Убедитесь, что путь корректен
import { notFound } from 'next/navigation';
import Link from 'next/link';

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

        {/* Ключевой момент: div со стилем white-space: pre-wrap.
          Этот стиль заставляет браузер уважать все переносы строк и пробелы,
          которые сгенерировал ИИ, идеально отображая форматирование поста.
        */}
        <div 
          className="prose lg:prose-xl max-w-none text-gray-800"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {digest.content}
        </div>
      </article>
    </div>
  );
}
