import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import MarkdownImage from '@/components/MarkdownImage';

// Вспомогательные функции и getProject остаются без изменений
function getFirstImage(content) { /* ... */ }
function generateDescription(content) { /* ... */ }
async function getProject(slug) {
  const project = await prisma.project.findUnique({
    where: { slug: slug, published: true },
    include: { author: { select: { name: true, image: true } } },
  });
  if (!project) { notFound(); }
  return project;
}

// generateMetadata остаётся без изменений
export async function generateMetadata({ params }) { /* ... */ }

export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);
  
  // Создаем объект для кастомных компонентов Markdown
  const components = { img: MarkdownImage };

  return (
    // 1. Делаем контейнер шире для галереи
    <article className="max-w-7xl mx-auto px-4 py-12">
      {/* Заголовок и мета-информация */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {project.author.image && (
            <Image src={project.author.image} alt={project.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />
          )}
          <span>{project.author.name}</span>
          <span>&middot;</span>
          <time dateTime={project.publishedAt.toISOString()}>
            {new Date(project.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>
        </div>
      </div>
      
      {/* 2. Создаем Masonry-контейнер с адаптивными колонками */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-8">
        {/* 3. Убираем логику "hero image" и выводим весь контент */}
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={components}
          // Оборачиваем Markdown в <div className="prose"> для стилизации текста, если он есть
          // но на саму галерею это не повлияет.
          className="prose prose-lg max-w-none"
        >
          {project.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
