

import { prisma } from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await prisma.project.findUnique({ where: { slug: params.slug } });
  if (!project) return <div>Проект не найден</div>;

  // Всегда ожидаем только EditorJsBlock[]
  let blocks: any[] = [];
  if (typeof project.content === 'string') {
    try {
      const parsed = JSON.parse(project.content);
      blocks = Array.isArray(parsed) ? parsed : [];
    } catch {
      blocks = [];
    }
  } else if (Array.isArray(project.content)) {
    blocks = project.content;
  } else {
    blocks = [];
  }
  // Жёсткая фильтрация
  const validBlocks = blocks.filter(
    b => b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
  );
  if (validBlocks.length === 0) {
    return (
      <div className="text-red-600 bg-red-50 p-4 rounded">
        Ошибка: некорректные блоки данных для рендера.<br />
        <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(blocks, null, 2)}</pre>
      </div>
    );
  }
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">{project.title}</h1>
      <BlockRenderer blocks={validBlocks} />
    </div>
  );
}