import prisma from '../lib/prisma'; // <<< 1. Импортируем Prisma
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

// 2. Новая функция для получения статей через Prisma
async function getArticles() {
  const articles = await prisma.article.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
    take: 9, // Показывать, например, 9 последних статей
    include: { // Включаем данные об авторе
      author: {
        select: { name: true, image: true },
      },
    },
  });
  return articles;
}

export default async function HomePage() {
  const articles = await getArticles();

  return (
    <div className="space-y-12">
      {/* Здесь может быть заголовок, например "Последние публикации" */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.length > 0 ? (
          articles.map((article) => (
            <div
              key={article.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group"
            >
              {/* 3. Адаптируем карточку для отображения статей */}
              <div className="p-6 flex-grow flex flex-col">
                <Link href={`/articles/${article.slug}`}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                    {article.title}
                  </h2>
                </Link>
                
                <p className="text-sm text-gray-500 mb-4">
                  {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>

                {/* Показываем краткое содержимое, если нужно */}
                <p className="text-gray-700 mb-4 line-clamp-3 overflow-hidden flex-grow">
                  {/* Prisma возвращает текст, убираем ReactMarkdown для превью */}
                  {article.content.substring(0, 150)}...
                </p>
                
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100">
                  {article.author.image && (
                    <Image src={article.author.image} alt={article.author.name} width={32} height={32} className="rounded-full" />
                  )}
                  <span className="text-sm font-medium text-gray-600">{article.author.name}</span>
                </div>
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

