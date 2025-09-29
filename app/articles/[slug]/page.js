import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import Link from 'next/link'; // <-- Добавляем импорт Link
import MarkdownImage from '@/components/MarkdownImage';
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

async function getArticle(slug) {
  const article = await prisma.article.findUnique({
    where: { slug: slug, published: true },
    // --- 1. ДОБАВЛЯЕМ ЗАГРУЗКУ ТЕГОВ ---
    include: {
      author: { select: { name: true, image: true } },
      tags: true, // Загружаем связанные теги
    },
  });
  if (!article) notFound();
  return article;
}

export async function generateMetadata({ params }) {
    const article = await getArticle(params.slug);
    // ... (остальная часть функции без изменений)
}

export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);
  const heroImage = getFirstImage(article.content);
  const contentWithoutHero = heroImage ? article.content.replace(/!\[.*?\]\(.*?\)\n?/, '') : article.content;
  const components = { img: MarkdownImage };

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{article.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {article.author.image && <Image src={article.author.image} alt={article.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />}
          <span>{article.author.name}</span>
          <span>&middot;</span>
          <time dateTime={article.publishedAt.toISOString()}>{new Date(article.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
        </div>
        
        {/* --- 2. НОВЫЙ БЛОК ДЛЯ ОТОБРАЖЕНИЯ ТЕГОВ --- */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {article.tags.map(tag => (
              <Link 
                key={tag.id}
                href={`/tags/${tag.slug}`} 
                className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      
      {heroImage && (
        <div className="mb-12">
          <Image src={heroImage} alt={article.title} width={1200} height={675} className="rounded-xl shadow-lg w-full" priority />
        </div>
      )}

      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{contentWithoutHero}</ReactMarkdown>
      </div>
    </article>
  );
}
