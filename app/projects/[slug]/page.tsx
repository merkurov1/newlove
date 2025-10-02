


import prisma from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';
import type { EditorJsBlock } from '@/types/blocks';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await prisma.project.findUnique({ 
    where: { 
      slug: params.slug,
      published: true  // Показываем только опубликованные проекты
    } 
  });
  
  if (!project) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-6 bg-red-50 text-red-700 rounded shadow text-center">
        <h1 className="text-2xl font-bold mb-2">Проект не найден</h1>
        <p>Возможно, он был удалён или ещё не опубликован.</p>
      </div>
    );
  }

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
  } catch (error) {
    // Логируем только в development
    if (process.env.NODE_ENV === 'development') {
      console.error('Ошибка парсинга контента:', error);
    }
    // blocks останется пустым
  }

  if (!blocks.length) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-6 bg-red-50 text-red-700 rounded shadow text-center">
        <h1 className="text-2xl font-bold mb-2">Ошибка контента</h1>
        <p>Контент проекта повреждён или отсутствует.</p>
      </div>
    );
  }

  return (
    <article className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-8 text-center">{project.title}</h1>
      
      <div className="prose prose-lg max-w-none mx-auto">
        <BlockRenderer blocks={blocks} />
      </div>
    </article>
  );
}