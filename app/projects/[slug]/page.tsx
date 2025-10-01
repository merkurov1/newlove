// app/projects/[slug]/page.tsx
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import ReactMarkdown from 'react-markdown';

export const dynamic = 'force-dynamic';

// Demo project for when DB is unavailable
const DEMO_PROJECT = {
  id: 'demo-1',
  slug: 'demo-project',
  title: 'Демо-проект',
  content: '# Демо-проект\n\nЭто демонстрационный проект. База данных недоступна.',
  publishedAt: new Date(),
  author: { name: 'Демо-автор' },
};

async function getProject(slug: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { slug, published: true },
      include: {
        author: {
          select: { name: true },
        },
        tags: {
          select: { name: true, slug: true },
        },
      },
    });
    return { project, isDemo: false };
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return { project: DEMO_PROJECT, isDemo: true };
  }
}

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const { project, isDemo } = await getProject(params.slug);

  if (!project && !isDemo) {
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      {isDemo && (
        <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <p className="text-yellow-800">База данных недоступна. Показаны демо-данные.</p>
        </div>
      )}
      
      <header className="mb-8">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
          {project.title}
        </h1>
        <div className="flex items-center gap-4 text-gray-600">
          {project.author && (
            <span>Автор: {project.author.name}</span>
          )}
          {project.publishedAt && (
            <time dateTime={project.publishedAt.toISOString()}>
              {new Date(project.publishedAt).toLocaleDateString('ru-RU', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </time>
          )}
        </div>
        {!isDemo && project.tags && project.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.map((tag: any) => (
              <span
                key={tag.slug}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="prose prose-lg max-w-none">
        <ReactMarkdown>{project.content}</ReactMarkdown>
      </div>
    </article>
  );
}