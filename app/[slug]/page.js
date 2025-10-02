// app/[slug]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import BlockRenderer from '@/components/BlockRenderer';

async function getContent(slug) {
  // Исключаем статические маршруты
  const staticRoutes = ['admin', 'api', 'articles', 'auth', 'digest', 'profile', 'projects', 'rss.xml', 'sentry-example-page', 'shop', 'tags', 'talks', 'users', 'you'];
  if (staticRoutes.includes(slug)) {
    return null;
  }
  
  // Сначала ищем статью
  const article = await prisma.article.findUnique({
    where: { slug: slug, published: true },
    include: {
      author: { select: { name: true, image: true } },
      tags: true,
    },
  });
  
  if (article) {
    return { type: 'article', content: article };
  }
  
  // Если статья не найдена, ищем проект
  const project = await prisma.project.findUnique({
    where: { slug: slug, published: true }
  });
  
  if (project) {
    return { type: 'project', content: project };
  }
  
  return null;
}

export async function generateMetadata({ params }) {
  const result = await getContent(params.slug);
  if (!result) return { title: 'Не найдено' };
  
  const { type, content } = result;
  const previewImage = getFirstImage(content.content);
  const description = generateDescription(content.content);
  const baseUrl = 'https://merkurov.love';

  return {
    title: content.title,
    description: description,
    openGraph: {
      title: content.title,
      description: description,
      url: `${baseUrl}/${content.slug}`,
      images: previewImage ? [{ url: previewImage }] : [],
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: content.title,
      description: description,
      images: previewImage ? [previewImage] : [],
    },
  };
}

export default async function ContentPage({ params }) {
  const result = await getContent(params.slug);
  
  if (!result) {
    notFound();
  }
  
  const { type, content } = result;
  
  if (type === 'article') {
    return <ArticleComponent article={content} />;
  } else {
    return <ProjectComponent project={content} />;
  }
}

function ArticleComponent({ article }) {
  let blocks = [];
  try {
    const raw = typeof article.content === 'string' ? article.content : JSON.stringify(article.content);
    const parsed = JSON.parse(raw);
    blocks = Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('Ошибка парсинга контента статьи:', error);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <article>
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{article.title}</h1>
          
          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-6">
            {article.author?.image && (
              <Image
                src={article.author.image}
                alt={article.author.name || 'Автор'}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <span>Автор: {article.author?.name || 'Неизвестен'}</span>
            <span>•</span>
            <time dateTime={article.createdAt}>
              {new Date(article.createdAt).toLocaleDateString('ru-RU')}
            </time>
          </div>
          
          {article.tags && article.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {article.tags.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tags/${tag.name}`}
                  className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full hover:bg-blue-200"
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}
        </header>
        
        <div className="prose prose-lg max-w-none">
          <BlockRenderer blocks={blocks} />
        </div>
      </article>
    </div>
  );
}

function ProjectComponent({ project }) {
  let blocks = [];
  try {
    const raw = typeof project.content === 'string' ? project.content : JSON.stringify(project.content);
    const parsed = JSON.parse(raw);
    blocks = Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    console.error('Ошибка парсинга контента проекта:', error);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <article>
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">{project.title}</h1>
          
          <div className="text-sm text-gray-600 mb-6">
            <time dateTime={project.createdAt}>
              Опубликовано: {new Date(project.createdAt).toLocaleDateString('ru-RU')}
            </time>
          </div>
        </header>
        
        <div className="prose prose-lg max-w-none">
          <BlockRenderer blocks={blocks} />
        </div>
      </article>
    </div>
  );
}