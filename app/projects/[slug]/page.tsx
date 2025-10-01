// app/projects/[slug]/page.tsx
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

// Demo project for when DB is unavailable
const DEMO_PROJECT = {
  id: 'demo-1',
  slug: 'demo-project',
  title: 'Демо-проект',
  content: [{ type: 'richText', text: 'Это демонстрационный проект. База данных недоступна.' }],
  publishedAt: new Date(),
  author: { name: 'Демо-автор' },
  tags: [],
};

async function getProject(slug: string) {
  try {
    const project = await prisma.project.findUnique({
      where: { slug, published: true },
      include: {
        author: {
          select: { name: true, image: true },
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

  // Parse content if it's a string
  let blocks = [];
  if (typeof project.content === 'string') {
    try {
      blocks = JSON.parse(project.content);
    } catch {
      blocks = [{ type: 'richText', text: project.content }];
    }
  } else if (Array.isArray(project.content)) {
    blocks = project.content;
  } else {
    blocks = [{ type: 'richText', text: 'Контент недоступен' }];
  }

  // Validate block structure
  const valid = Array.isArray(blocks) && blocks.length > 0 && blocks.every((b: any) => b.type);
  if (!valid) {
    blocks = [{ type: 'richText', text: 'Ошибка структуры контента' }];
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      {isDemo && (
        <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <p className="text-yellow-800">База данных недоступна. Показаны демо-данные.</p>
        </div>
      )}
      
      <header className="mb-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4">
          {project.title}
        </h1>
        <div className="flex items-center gap-4 text-gray-600">
          {project.author && (
            <span>Автор: {project.author.name}</span>
          )}
          {project.publishedAt && (
            <>
              <span>&middot;</span>
              <time dateTime={project.publishedAt.toISOString()}>
                {new Date(project.publishedAt).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </>
          )}
        </div>
        {!isDemo && project.tags && project.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {project.tags.map((tag: any) => (
              <Link
                key={tag.slug}
                href={`/tags/${tag.slug}`}
                className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <BlockRenderer blocks={blocks} />
    </article>
  );
}