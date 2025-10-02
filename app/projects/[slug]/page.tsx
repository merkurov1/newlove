


import prisma from '@/lib/prisma';
import BlockRenderer from '@/components/BlockRenderer';
import type { EditorJsBlock } from '@/types/blocks';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  console.log('🔍 ProjectPage: Получен slug:', params.slug);
  
  const project = await prisma.project.findUnique({ 
    where: { 
      slug: params.slug,
      published: true  // Показываем только опубликованные проекты
    } 
  });
  
  console.log('🔍 ProjectPage: Найден проект:', project ? `ID: ${project.id}, Title: ${project.title}` : 'НЕ НАЙДЕН');
  
  if (!project) {
    return (
      <div className="max-w-2xl mx-auto mt-16 p-6 bg-red-50 text-red-700 rounded shadow text-center">
        <h1 className="text-2xl font-bold mb-2">Проект не найден</h1>
        <p>Возможно, он был удалён или ещё не опубликован.</p>
      </div>
    );
  }

  let blocks: EditorJsBlock[] = [];
  let debugInfo: any = {};
  
  console.log('🔍 ProjectPage: Тип контента в БД:', typeof project.content);
  console.log('🔍 ProjectPage: Содержимое (первые 200 символов):', JSON.stringify(project.content).substring(0, 200));
  
  try {
    debugInfo.rawContentType = typeof project.content;
    debugInfo.rawContent = project.content;
    
    const raw = typeof project.content === 'string' ? project.content : JSON.stringify(project.content);
    debugInfo.processedRaw = raw;
    
    const parsed = JSON.parse(raw);
    debugInfo.parsed = parsed;
    debugInfo.isArray = Array.isArray(parsed);
    
    console.log('🔍 ProjectPage: Парсинг успешен, это массив?', Array.isArray(parsed));
    
    if (Array.isArray(parsed)) {
      blocks = parsed.filter(
        (b): b is EditorJsBlock =>
          b && typeof b.type === 'string' && b.data && typeof b.data === 'object'
      );
      debugInfo.filteredBlocks = blocks;
      debugInfo.filteredBlocksCount = blocks.length;
      
      console.log('🔍 ProjectPage: Отфильтровано блоков:', blocks.length);
      blocks.forEach((block, i) => {
        console.log(`🔍 ProjectPage: Блок ${i}: тип="${block.type}", данные:`, Object.keys(block.data || {}));
      });
    } else {
      console.log('🔍 ProjectPage: Контент не является массивом, структура:', Object.keys(parsed));
    }
  } catch (error) {
    console.error('🔍 ProjectPage: Ошибка парсинга контента:', error);
    debugInfo.error = error instanceof Error ? error.message : String(error);
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
      
      {/* ВРЕМЕННАЯ ОТЛАДОЧНАЯ ИНФОРМАЦИЯ */}
      <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded">
        <h3 className="font-bold text-blue-800 mb-2">🔍 Отладочная информация:</h3>
        <div className="text-sm space-y-2">
          <div><strong>Тип контента в БД:</strong> {debugInfo.rawContentType}</div>
          <div><strong>Количество блоков:</strong> {debugInfo.filteredBlocksCount || 0}</div>
          {debugInfo.error && (
            <div className="text-red-600"><strong>Ошибка:</strong> {debugInfo.error}</div>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-blue-600">Показать полную информацию</summary>
            <pre className="mt-2 bg-white p-2 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </details>
        </div>
      </div>
      
      <div className="prose prose-lg max-w-none mx-auto">
        <BlockRenderer blocks={blocks} />
      </div>
    </article>
  );
}