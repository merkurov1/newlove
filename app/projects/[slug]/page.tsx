// app/projects/[slug]/page.tsx
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import BlockRenderer from '@/components/BlockRenderer';

// Определяем типы для данных, которые мы ожидаем
interface Block {
  type?: string;
  blockType?: string;
  [key: string]: any;
}

interface Project {
  title: string;
  content: Block[] | string;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Функция для получения данных проекта ---
async function getProject(slug: string): Promise<Project | null> {
  const { data } = await supabase
    .from('projects')
    .select('title, content')
    .eq('slug', slug)
    .single();
  return data;
}

// --- Функция для генерации метаданных для SEO ---
export async function generateMetadata({ params }: { params: { slug: string } }) {
  const project = await getProject(params.slug);
  if (!project) return { title: 'Проект не найден' };

  let description = `Проект: ${project.title}`;
  // Пытаемся взять первый текстовый блок для описания
  if (Array.isArray(project.content) && project.content.length > 0) {
    const firstTextBlock = project.content.find(b => (b.type === 'richText' || b.blockType === 'richText') && b.text);
    if (firstTextBlock) {
      description = firstTextBlock.text.replace(/<[^>]+>/g, '').substring(0, 155);
    }
  }

  return {
    title: project.title,
    description: description,
  };
}

// --- Основной компонент страницы ---
export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await getProject(params.slug);
  if (!project) notFound();

  let blocks: Block[] = [];

  // Надёжно обрабатываем контент
  if (typeof project.content === 'string') {
    try {
      blocks = JSON.parse(project.content);
    } catch (e) {
      console.error("Ошибка парсинга JSON:", e);
    }
  } else if (Array.isArray(project.content)) {
    blocks = project.content;
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-10 text-center leading-tight">
        {project.title}
      </h1>
      {/* ВРЕМЕННО: выводим структуру blocks для отладки */}
      <details style={{marginBottom: '2rem', background: '#f8f8f8', padding: '1rem', borderRadius: '8px'}}>
        <summary style={{cursor: 'pointer', fontWeight: 'bold'}}>DEBUG: blocks</summary>
        <pre style={{whiteSpace: 'pre-wrap', fontSize: '12px'}}>{JSON.stringify(blocks, null, 2)}</pre>
      </details>
      {/* Плагин TailwindCSS Typography сделает текст из блоков красивым */}
      <div className="prose lg:prose-xl max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </article>
  );
}
