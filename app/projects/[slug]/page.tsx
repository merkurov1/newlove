


import { prisma } from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';
import type { EditorJsBlock } from '@/types/blocks';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await prisma.project.findUnique({ where: { slug: params.slug } });
  if (!project) return <div>Проект не найден</div>;

  let blocks: EditorJsBlock[] = [];
  try {
    const raw = typeof project.content === 'string' ? project.content : JSON.stringify(project.content);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      blocks = parsed.filter(
        (b): b is EditorJsBlock =>
          b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
      );
    }
  } catch {
    // blocks останется пустым
  }

  if (!blocks.length) {
    return (
      <div className="text-red-600 bg-red-50 p-4 rounded">
        Ошибка: контент проекта повреждён или отсутствует.
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{project.title}</h1>
      <BlockRenderer blocks={blocks} />
    </div>
  );
}