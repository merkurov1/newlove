

import { prisma } from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await prisma.project.findUnique({ where: { slug: params.slug } });
  if (!project) return <div>Проект не найден</div>;

  // Editor.js OutputData: { time, blocks, version }
  let blocks: any[] = [];
  // Если content — объект с полем blocks (Editor.js OutputData)
  if (
    project.content &&
    typeof project.content === 'object' &&
    !Array.isArray(project.content) &&
    'blocks' in project.content &&
    Array.isArray((project.content as any).blocks)
  ) {
    blocks = (project.content as any).blocks;
  } else if (Array.isArray(project.content)) {
    blocks = project.content;
  } else if (typeof project.content === 'string') {
    try {
      const parsed = JSON.parse(project.content);
      blocks = Array.isArray(parsed.blocks) ? parsed.blocks : Array.isArray(parsed) ? parsed : [];
    } catch {
      blocks = [];
    }
  }

  // Дополнительная валидация структуры blocks
  const isValidBlocks = Array.isArray(blocks) && blocks.every(
    b => b && typeof b === 'object' && typeof b.type === 'string'
  );
  if (!isValidBlocks) {
    console.error('Некорректные блоки для BlockRenderer:', blocks);
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
      <BlockRenderer blocks={blocks} />
    </div>
  );
}