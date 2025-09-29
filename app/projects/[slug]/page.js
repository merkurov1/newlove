import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';
import MarkdownImage from '@/components/MarkdownImage';
// --- 1. Импортируем наши новые общие функции ---
import { getFirstImage, generateDescription } from '@/lib/contentUtils';

// Эта функция находит проект в базе по slug из URL
async function getProject(slug) {
  const project = await prisma.project.findUnique({
    where: { slug: slug, published: true },
    include: { author: { select: { name: true, image: true } } },
  });
  if (!project) notFound();
  return project;
}

// Функция генерации метаданных теперь использует импортированные функции
export async function generateMetadata({ params }) {
    const project = await getProject(params.slug);
    const previewImage = getFirstImage(project.content);
    const description = generateDescription(project.content);
    const baseUrl = 'https://merkurov.love';

    return {
      title: project.title,
      description: description,
      openGraph: {
        title: project.title,
        description: description,
        url: `${baseUrl}/projects/${project.slug}`,
        siteName: 'Anton Merkurov',
        images: previewImage ? [{ url: previewImage, width: 1200, height: 630 }] : [],
        locale: 'ru_RU', type: 'article',
      },
    };
}

export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);
  const components = { img: MarkdownImage };
  const content = project.content;
  const firstImageMatch = content.match(/!\[.*?\]\(.*?\)/);
  const firstImageIndex = firstImageMatch ? content.indexOf(firstImageMatch[0]) : -1;
  const descriptionContent = firstImageIndex !== -1 ? content.substring(0, firstImageIndex) : content;
  const galleryContent = firstImageIndex !== -1 ? content.substring(firstImageIndex) : '';

  return (
    <article className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
        <div className="flex items-center justify-center space-x-4 text-gray-500">
          {project.author.image && <Image src={project.author.image} alt={project.author.name} width={40} height={40} className="w-10 h-10 rounded-full" />}
          <span>{project.author.name}</span>
          <span>&middot;</span>
          <time dateTime={project.publishedAt.toISOString()}>{new Date(project.publishedAt).toLocaleDateString('ru-RU', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
        </div>
      </div>
      
      {descriptionContent.trim() && (
        <div className="prose lg:prose-xl max-w-3xl mx-auto mb-12">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{descriptionContent}</ReactMarkdown>
        </div>
      )}
      
      {galleryContent.trim() && (
        <div className="columns-1 md:columns-2 lg:columns-3 gap-8">
          <ReactMarkdown components={components} remarkPlugins={[remarkGfm]} className="prose prose-lg max-w-none">{galleryContent}</ReactMarkdown>
        </div>
      )}
    </article>
  );
}
