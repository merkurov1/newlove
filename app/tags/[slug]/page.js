// app/tags/[slug]/page.js

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SafeImage from '@/components/SafeImage';

// --- 1. ФУНКЦИЯ ДЛЯ ЗАГРУЗКИ ДАННЫХ ---
// Находит тег по его slug и подгружает все связанные с ним статьи
async function getTagData(slug) {
  const tag = await prisma.tag.findUnique({
    where: { slug },
    include: {
      articles: {
        where: { published: true },
        orderBy: { publishedAt: 'desc' },
        include: {
          author: { select: { name: true, image: true } },
          tags: true,
        },
      },
      // В будущем можно будет добавить и проекты
      // projects: { ... }
    },
  });

  if (!tag) {
    notFound();
  }
  return tag;
}

// --- 2. ГЕНЕРИРУЕМ МЕТАДАННЫЕ ДЛЯ SEO ---
export async function generateMetadata({ params }) {
  const tag = await getTagData(params.slug);
  return {
    title: `Материалы по тегу: ${tag.name}`,
    description: `Все статьи и проекты, отмеченные тегом "${tag.name}"`,
  };
}

// --- 3. САМ КОМПОНЕНТ СТРАНИЦЫ ---
export default async function TagPage({ params }) {
  const tag = await getTagData(params.slug);
  const articles = tag.articles;

  // Функция для получения превью-картинки (можно вынести в утилиты)
  function getFirstImage(content) {
    if (!content) return null;
    const regex = /!\[.*?\]\((.*?)\)/;
    const match = content.match(regex);
    return match ? match[1] : null;
  }

  return (
    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-12">
        <p className="text-lg text-gray-500">Материалы по тегу</p>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold text-gray-900"># {tag.name}</h1>
      </div>

      {/* --- СЕТКА СТАТЕЙ (аналогично главной странице) --- */}
      {articles.length > 0 ? (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => {
            const previewImage = getFirstImage(article.content);
            return (
              <div key={article.id} className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 border border-gray-100 flex flex-col group overflow-hidden">
                {previewImage && (
                  <Link href={`/${article.slug}`} className="block relative w-full h-48">
                    <SafeImage src={previewImage} alt={article.title} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-300" />
                  </Link>
                )}
                <div className="p-6 flex-grow flex flex-col">
                  <Link href={`/${article.slug}`}>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2 group-hover:text-blue-600">{article.title}</h2>
                  </Link>
                  {article.tags && article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                      {article.tags.map(t => (
                        <Link key={t.id} href={`/tags/${t.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{t.name}</Link>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-auto pt-4 border-t border-gray-100">
                    {article.author.image && <SafeImage src={article.author.image} alt={article.author.name || ''} width={32} height={32} className="rounded-full" />}
                    <span className="text-sm font-medium text-gray-600">{article.author.name}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-gray-500 col-span-full">По этому тегу пока нет ни одной опубликованной статьи.</p>
      )}
    </div>
  );
}
