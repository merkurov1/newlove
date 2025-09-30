// app/projects/[slug]/page.js

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

// Утилиты для метаданных
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

// #1. Рендеринг контента: Tiptap для преобразования JSON в HTML
import { generateHTML } from '@tiptap/html';
import Document from '@tiptap/extension-document';
import Paragraph from '@tiptap/extension-paragraph';
import Text from '@tiptap/extension-text';
import Bold from '@tiptap/extension-bold';
import Italic from '@tiptap/extension-italic';
import Heading from '@tiptap/extension-heading';
import LinkExtension from '@tiptap/extension-link';
// ... и любые другие расширения Tiptap, которые вы используете в редакторе
// ВАЖНО: Если у вас есть кастомное расширение для галереи, его тоже нужно импортировать.

// #2. Рендеринг контента: Парсер для замены HTML на React-компоненты
import parse from 'html-react-parser';
import GalleryGrid from '@/components/GalleryGrid'; // Ваш React-компонент галереи
import md from '@/lib/markdown'; // Может понадобиться для старых постов

// Функция для загрузки данных проекта из базы
async function getProject(slug) {
  const project = await prisma.project.findUnique({
    where: { slug, published: true },
    include: {
      author: { select: { name: true, image: true } },
      tags: true,
    },
  });
  if (!project) {
    notFound();
  }
  return project;
}

// Генерация метаданных для SEO
export async function generateMetadata({ params }) {
    const project = await getProject(params.slug);
    // Примечание: getFirstImage и generateDescription должны уметь работать с JSON или HTML
    const description = generateDescription(project.content);
    const previewImage = await getFirstImage(project.content);
    const baseUrl = 'https://merkurov.love';

    return {
      title: project.title,
      description,
      keywords: project.tags.map(tag => tag.name).join(', '),
      openGraph: {
        title: project.title,
        description,
        url: `${baseUrl}/projects/${project.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU',
        type: 'article',
      },
    };
}

// Основной компонент страницы
export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);
  const rawContent = project.content;

  // --- Основная логика обработки контента ---
  let content;
  // Проверяем, является ли контент объектом (JSON от Tiptap)
  if (typeof rawContent === 'object' && rawContent !== null) {
    // Преобразуем JSON в HTML-строку
    content = generateHTML(rawContent, [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Heading,
      LinkExtension,
      // ❗ Добавьте сюда ВСЕ расширения Tiptap, которые используете
    ]);
  } else {
    // Обработка для старого контента (если он был в Markdown или HTML)
    const isHtml = rawContent.trim().startsWith('<');
    content = isHtml ? rawContent : md.render(rawContent);
  }

  return (
    <article className="max-w-7xl mx-auto px-4 py-12">
      {/* Шапка статьи */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {project.author.image && (
            <Image 
              src={project.author.image} 
              alt={project.author.name} 
              width={40} 
              height={40} 
              className="w-10 h-10 rounded-full" 
            />
          )}
          <span>{project.author.name}</span>
          <span>&middot;</span>
          <time dateTime={project.publishedAt.toISOString()}>
            {new Date(project.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
        </div>
        {project.tags?.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            {project.tags.map(tag => (
              <Link key={tag.id} href={`/tags/${tag.slug}`} className="bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-gray-200">
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </div>
      
      {/* Основной контент, обработанный парсером */}
      <div className="prose lg:prose-xl max-w-none">
        {parse(content, {
          replace: (domNode) => {
            // Ищем <div class="gallery-grid">
            if (
              domNode.type === 'tag' &&
              domNode.name === 'div' &&
              domNode.attribs?.class?.split(' ').includes('gallery-grid')
            ) {
              const images = [];
              // Рекурсивно ищем все вложенные теги <img>
              function findImages(children) {
                if (!children) return;
                children.forEach(child => {
                  if (child.type === 'tag' && child.name === 'img' && child.attribs?.src) {
                    images.push({
                      src: child.attribs.src,
                      alt: child.attribs.alt || 'Изображение из галереи',
                    });
                  } else if (child.children) {
                    findImages(child.children);
                  }
                });
              }
              findImages(domNode.children);
              
              if (images.length === 0) {
                return <div className="text-red-600">[gallery-grid: нет изображений]</div>;
              }
              // Заменяем найденный div на React-компонент GalleryGrid
              return <GalleryGrid images={images} />;
            }
          },
        })}
      </div>
    </article>
  );
}
