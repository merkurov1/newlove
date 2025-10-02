// app/articles/[slug]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import BlockRenderer from '@/components/BlockRenderer';

async function getArticle(slug) {
  const article = await prisma.article.findUnique({
    where: { slug: slug, published: true },
    include: {
      author: { select: { name: true, image: true } },
      tags: true,
    },
  });
  if (!article) notFound();
  return article;
}

export async function generateMetadata({ params }) {
    const article = await getArticle(params.slug);
    const previewImage = getFirstImage(article.content);
    const description = generateDescription(article.content);
    const baseUrl = 'https://merkurov.love';

    return {
      title: article.title,
      description: description,
      keywords: article.tags.map(tag => tag.name).join(', '),
      openGraph: {
        title: article.title,
        description: description,
        url: `${baseUrl}/${article.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU', type: 'article',
      },
      twitter: { /* ... */ },
    };
}


export default async function ArticlePage({ params }) {
  const article = await getArticle(params.slug);

  let blocks = [];
  if (typeof article.content === 'string') {
    try {
      blocks = JSON.parse(article.content);
    } catch {
      return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: content не является валидным JSON массивом блоков!</div>;
    }
  } else if (Array.isArray(article.content)) {
    blocks = article.content;
  } else {
    return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: content не массив блоков!</div>;
  }
  // Валидация структуры блоков
  const valid = Array.isArray(blocks) && blocks.every(b => b.type);
  if (!valid) {
    return <div style={{background:'#f00',color:'#fff',padding:'2rem',fontWeight:'bold'}}>Ошибка: структура блоков некорректна!</div>;
  }
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
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {article.tags.map(tag => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">{tag.name}</Link>
            ))}
          </div>
        )}
      </div>
      <BlockRenderer blocks={blocks} />
    </article>
  );
}
