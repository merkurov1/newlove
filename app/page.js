// app/page.js


import prisma from '../lib/prisma';
import Link from 'next/link';
import Image from 'next/image';
import importDynamic from 'next/dynamic';
import { getFirstImage } from '@/lib/contentUtils';

const FadeInSection = importDynamic(() => import('@/components/FadeInSection'), { ssr: false });

// --- БЛОК МЕТАДАННЫХ ---
export const metadata = {
  description: 'Главная страница персонального сайта и блога Антона Меркурова. Последние публикации о медиа, технологиях и искусстве.',
};

export const dynamic = 'force-dynamic';



async function getArticles() {
  try {
    const articles = await prisma.article.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      take: 9,
      select: {
        id: true,
        title: true,
        slug: true,
        content: true,
        publishedAt: true,
        author: {
          select: {
            name: true,
            image: true,
          },
        },
        tags: true,
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
  // Получаем previewImage для каждой статьи асинхронно
  const articles = await Promise.all(
    rawArticles.map(async (article) => ({
      ...article,
      previewImage: await getFirstImage(article.content)
    }))
  );

  return (
    <div className="space-y-12">
      <FadeInSection>
        <div className="grid gap-4 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {articles && articles.length > 0 ? (
            articles.map((article) => (
              <div
                key={article.id}
                className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden p-3 sm:p-6"
              >
                {article.previewImage && (
                  <Link href={`/${article.slug}`} className="block relative w-full h-48">
                    <Image
                      src={article.previewImage}
                      alt={article.title}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </Link>
                )}
                <div className="flex-grow flex flex-col">
                  <Link href={`/${article.slug}`}>
                    <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors duration-200">
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
                  {/* Описание/контент убран по требованию — только заголовок и картинка */}
                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {article.tags.map(tag => (
                        <Link
                          key={tag.id}
                          href={`/tags/${tag.slug}`}
                          className="bg-gray-100 text-gray-600 text-xs sm:text-xs font-medium px-3 py-2 rounded-full hover:bg-gray-200 min-h-[36px] min-w-[44px] flex items-center justify-center"
                        >
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  )}
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
      </FadeInSection>
    </div>
  );
}
