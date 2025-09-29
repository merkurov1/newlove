// app/articles/page.js

import Link from 'next/link';
import prisma from '@/lib/prisma';

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = {
  title: 'Все публикации',
  description: 'Архив всех публикаций Антона Меркурова на темы медиа, технологий и искусства.',
};

export const dynamic = 'force-dynamic';

export default async function ArticlesPage() {
  const articles = await prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Публикации</h1>
      <div className="space-y-6">
        {articles.length > 0 ? (
          articles.map(article => (
            <Link key={article.id} href={`/${article.slug}`} className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
              <h2 className="text-2xl font-semibold text-gray-800">{article.title}</h2>
              <p className="text-gray-500 mt-2">
                {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </Link>
          ))
        ) : (
          <p className="text-gray-600">Здесь пока ничего нет. Но скоро появится!</p>
        )}
      </div>
    </div>
  );
}
