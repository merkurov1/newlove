import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import MarkdownImage from '@/components/MarkdownImage';

// ... (вспомогательные функции и generateMetadata остаются без изменений)
function getFirstImage(content) { /* ... */ }
function generateDescription(content) { /* ... */ }
async function getProject(slug) { /* ... */ }
export async function generateMetadata({ params }) { /* ... */ }

export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);
  const components = { img: MarkdownImage };

  // --- НОВАЯ ЛОГИКА РАЗДЕЛЕНИЯ КОНТЕНТА ---
  const content = project.content;
  const firstImageMatch = content.match(/!\[.*?\]\(.*?\)/);
  const firstImageIndex = firstImageMatch ? content.indexOf(firstImageMatch[0]) : -1;

  // Всё, что ДО первой картинки - это описание
  const descriptionContent = firstImageIndex !== -1 ? content.substring(0, firstImageIndex) : content;
  // Всё, что ПОСЛЕ (включая первую картинку) - это галерея
  const galleryContent = firstImageIndex !== -1 ? content.substring(firstImageIndex) : '';

  return (
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
      
      {/* Отрисовываем описание, если оно есть */}
      {descriptionContent.trim() && (
        <div className="prose lg:prose-xl max-w-3xl mx-auto mb-12">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {descriptionContent}
          </ReactMarkdown>
        </div>
      )}
      
      {/* Отрисовываем галерею, если она есть */}
      {galleryContent.trim() && (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={components}
            className="prose prose-lg max-w-none"
          >
            {galleryContent}
          </ReactMarkdown>
        </div>
      )}
    </article>
  );
}
