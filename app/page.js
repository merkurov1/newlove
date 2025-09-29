// app/page.js

import prisma from '../lib/prisma';
import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

// НОВАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
// Ищет в HTML-строке первый тег <img> и возвращает его атрибут src.
// Если изображение не найдено, возвращает null.
function getFirstImage(content) {
  if (!content) return null;
  const regex = /<img.*?src=["'](.*?)["']/;
  const match = content.match(regex);
  return match ? match[1] : null;
}

async function getArticles() {
  try {
    const articles = await prisma.article.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 9,
      include: {
        author: {
          select: { name: true, image: true },
        },
      },
    });
    return articles;
  } catch (error) {
    console.error("!!! Ошибка при загрузке статей для главной страницы:", error);
    return [];
  }
}

export default async function HomePage() {
  const rawArticles = await getArticles();

  // ОБНОВЛЕННАЯ ЛОГИКА
  // Проходим по каждому посту и добавляем поле `previewImage`
  const articles = rawArticles.map(article => ({
    ...article,
    previewImage: getFirstImage(article.content)
  }));

  return (
    <div className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles && articles.length > 0 ? (
          articles.map((article) => (
            <div
              key={article.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden" // Добавлен overflow-hidden
            >
              {/* НОВЫЙ БЛОК ДЛЯ ИЗОБРАЖЕНИЯ */}
              {article.previewImage && (
                <Link href={`/${article.slug}`} className="block relative w-full h-48">
                  <Image
                    src={article.previewImage}
                    alt={article.title}
                    fill // Растягивает изображение на весь контейнер
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </Link>
              )}
              
              <div className="p-6 flex-grow flex flex-col">
                <Link href={`/${article.slug}`}>
                  <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
                    {article.title}
                  </h2>
                </Link>
                
                {article.publishedAt && (
                    <p className="text-sm text-gray-500 mb-4">
                    {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                    })}
                    </p>
                )}
                {/* Убрали лишний текст из контента, т.к. есть картинка */}
                <p className="text-gray-700 mb-4 line-clamp-3 overflow-hidden flex-grow">
                  {article.content.replace(/<[^>]*>?/gm, '').substring(0, 150)}...
                </p>
                <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100">
                  {article.author.image && (
                    <Image src={article.author.image} alt={article.author.name || ''} width={32} height={32} className="rounded-full" />
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
