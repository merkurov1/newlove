// app/projects/[slug]/page.tsx

import { notFound } from 'next/navigation';
import GalleryGrid from '@/components/GalleryGrid';
import RichTextBlock from '@/components/RichTextBlock';
import CodeBlock from '@/components/CodeBlock';
import prisma from '@/lib/prisma';

const BLOCK_COMPONENTS = {
  richText: RichTextBlock,
  gallery: GalleryGrid,
  codeBlock: CodeBlock,
};

async function getProject(slug: string) {
  return await prisma.project.findUnique({
    where: { slug },
    select: { title: true, content: true },
  });
}

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await getProject(params.slug);
  if (!project) notFound();

  let blocks;
  try {
    blocks = JSON.parse(project.content);
  } catch {
    return <div className="bg-red-100 text-red-800 p-6 rounded">Ошибка: контент проекта повреждён.</div>;
  }
  if (!Array.isArray(blocks)) {
    return <div className="bg-red-100 text-red-800 p-6 rounded">Ошибка: контент не является массивом блоков.</div>;
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-8">{project.title}</h1>
      {blocks.length === 0 && (
        <div className="text-gray-500 text-center my-12">Контент для этого проекта отсутствует.</div>
      )}
      {blocks.map((block, idx) => {
        const Component = BLOCK_COMPONENTS[block.type as keyof typeof BLOCK_COMPONENTS];
        if (!Component) {
          return (
            <div key={idx} className="bg-yellow-100 text-yellow-800 p-4 rounded my-4">
              Неизвестный тип блока: <b>{block.type}</b>
            </div>
          );
        }
        return <Component key={idx} {...block} />;
      })}
    </article>
  );
}
