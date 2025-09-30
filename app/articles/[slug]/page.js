// app/articles/[slug]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

import { getFirstImage, generateDescription } from '@/lib/contentUtils';
import md from '@/lib/markdown';
import sanitizeHtml from 'sanitize-html';

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
  const content = article.content;
  const isHtml = content.trim().startsWith('<');

  let html;
  if (isHtml) {
    html = sanitizeHtml(content, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'iframe', 'del', 'ins', 'kbd', 's', 'u', 'div']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        a: ['href', 'name', 'target', 'rel'],
        iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen'],
        span: ['class'],
        div: ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowProtocolRelative: true,
    });
  } else {
    html = sanitizeHtml(md.render(content), {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'span', 'iframe', 'del', 'ins', 'kbd', 's', 'u', 'div']),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
        a: ['href', 'name', 'target', 'rel'],
        iframe: ['src', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen'],
        span: ['class'],
        div: ['class'],
      },
      allowedSchemes: ['http', 'https', 'mailto'],
      allowProtocolRelative: true,
    });
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
      <div className="prose lg:prose-xl max-w-none" dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
