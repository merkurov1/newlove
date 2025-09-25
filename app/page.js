// app/page.js
import { createClient } from '../lib/supabase-server';
import Link from 'next/link';
import { Fragment } from 'react'; // Импортируем Fragment для обертки

// Функция теперь получает дайджесты, а не статьи
async function getDigests() {
  const supabaseClient = createClient();

  const { data, error } = await supabaseClient
    .from('digests') // 1. Изменено: запрашиваем из таблицы 'digests'
    .select('id, title, created_at, content, slug')
    .eq('status', 'published') // 2. Добавлено: показываем только опубликованные дайджесты
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching digests:', error);
    return [];
  }
  return data;
}

export default async function HomePage() {
  const digests = await getDigests(); // Переменная переименована для ясности

  return (
    <div className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {digests.length > 0 ? (
          digests.map((digest) => (
            <div
              key={digest.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 p-6 border border-gray-100 flex flex-col"
            >
              <div className="flex-grow">
                {/* 3. Изменено: ссылка ведет на /digest/[slug] */}
                <Link href={`/digest/${digest.slug}`}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors duration-200 cursor-pointer">
                    {digest.title}
                  </h2>
                </Link>
                
                <p className="text-sm text-gray-500 mb-4">
                  {new Date(digest.created_at).toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                
                {/* 4. Изменено: показываем контент дайджеста. 
                    Стиль white-space: pre-wrap сохраняет форматирование (переносы строк). */}
                <div 
                  className="text-gray-700 mb-4 line-clamp-4 overflow-hidden" 
                  style={{ whiteSpace: 'pre-wrap' }}
                >
                  {digest.content}
                </div>
              </div>

              <Link
                href={`/digest/${digest.slug}`} // Ссылка также обновлена здесь
                className="text-blue-500 font-medium hover:text-blue-400 transition-colors duration-300 inline-flex items-center mt-auto"
              >
                Читать полностью
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="ml-1 w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 col-span-full">Пока нет опубликованных дайджестов.</p>
        )}
      </div>
    </div>
  );
}
