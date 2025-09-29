import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import MarkdownImage from '@/components/MarkdownImage';
// --- 1. Импортируем наши новые общие функции ---
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

// Эта функция находит статью в базе по slug из URL
async function getArticle(slug) {
  const article = await prisma.article.findUnique({
    where: { slug: slug, published: true },
    include: { author: { select: { name: true, image: true } } },
  });
  if (!article) notFound();
  return article;
}

// Функция генерации метаданных теперь использует импортированные функции
export async function generateMetadata({ params }) {
    const article = await getArticle(params.slug);
    const previewImage = getFirstImage(article.content);
    const description = generateDescription(article.content);
    const baseUrl = 'https://merkurov.love';

    return {
      title: article.title,
      description: description,
      openGraph: {
        title: article.title,
        description: description,
        url: `${baseUrl}/${article.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU', type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title: article.title,
        description: description,
        images: previewImage ? [previewImage] : [],
      },
    };
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
