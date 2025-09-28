import prisma from '../lib/prisma';
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

async function getArticles() {
  // ... эта функция без изменений ...
}

export default async function HomePage() {
  const articles = await getArticles();

  return (
    <div className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.length > 0 ? (
          articles.map((article) => (
            <div key={article.id} className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group">
              <div className="p-6 flex-grow flex flex-col">
                {/* <<< ИЗМЕНЕНИЕ: Убираем /articles из URL */}
                <Link href={`/${article.slug}`}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                    {article.title}
                  </h2>
                </Link>
                {/* ... остальная часть карточки без изменений ... */}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 col-span-full">Здесь пока нет опубликованных статей. Самое время написать первую!</p>
        )}
      </div>
    </div>
  );
}


