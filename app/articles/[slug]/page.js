import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Эта функция находит статью в базе по slug из URL
async function getArticle(slug) {
  const article = await prisma.article.findUnique({
    where: {
      slug: slug,
      // Важно: на публичном сайте показываем только опубликованные статьи
      published: true, 
    },
    include: {
      author: {
        select: { name: true, image: true },
      },
    },
  });

  if (!article) {
    notFound(); // Если статья не найдена или не опубликована, показываем 404
  }
  return article;
}

export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{article.title}</h1>
      <div className="flex items-center space-x-4 mb-8 text-gray-500">
        {article.author.image && (
          <img src={article.author.image} alt={article.author.name} className="w-10 h-10 rounded-full" />
        )}
        <span>{article.author.name}</span>
        <span>&middot;</span>
        <time dateTime={article.publishedAt.toISOString()}>
          {new Date(article.publishedAt).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </div>
      
      {/* Используем ReactMarkdown для красивого отображения контента */}
      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {article.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

// Эта функция генерирует метаданные (заголовок) для страницы
export async function generateMetadata({ params }) {
    const article = await getArticle(params.slug);
    return {
      title: article.title,
    };
}

