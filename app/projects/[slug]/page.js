import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Эта функция находит проект в базе по slug из URL
async function getProject(slug) {
  const project = await prisma.project.findUnique({
    where: {
      slug: slug,
      published: true, // Показываем только опубликованные
    },
    include: {
      author: {
        select: { name: true, image: true },
      },
    },
  });

  if (!project) {
    notFound(); // 404, если проект не найден или не опубликован
  }
  return project;
}

export default async function ProjectPage({ params }) {
  const project = await getProject(params.slug);

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">{project.title}</h1>
      <div className="flex items-center space-x-4 mb-8 text-gray-500">
        {project.author.image && (
          <img src={project.author.image} alt={project.author.name} className="w-10 h-10 rounded-full" />
        )}
        <span>{project.author.name}</span>
        <span>&middot;</span>
        <time dateTime={project.publishedAt.toISOString()}>
          {new Date(project.publishedAt).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </time>
      </div>
      
      <div className="prose lg:prose-xl max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {project.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}

// Генерируем метаданные для страницы (заголовок вкладки)
export async function generateMetadata({ params }) {
    const project = await getProject(params.slug);
    return {
      title: project.title,
    };
}

