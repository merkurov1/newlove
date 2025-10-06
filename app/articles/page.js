// app/articles/page.js


import Link from 'next/link';
import prisma from '@/lib/prisma';
// Framer Motion удалён, только Tailwind

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-10 bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400 bg-clip-text text-transparent">Публикации</h1>
        <div className="space-y-6">
          {articles.length > 0 ? (
            articles.map(article => (
              <Link key={article.id} href={`/${article.slug}`} className="block p-6 bg-white/80 backdrop-blur rounded-2xl shadow-lg hover:shadow-2xl border border-gray-100 hover:-translate-y-1 hover:scale-[1.01] transition-all duration-200">
                <h2 className="text-2xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{article.title}</h2>
                <p className="text-gray-500 mt-2 text-sm">
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
    </div>
  );
}
