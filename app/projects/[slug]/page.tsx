// app/projects/[slug]/page.tsx
import React from 'react';
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
      {/* DEBUG BLOCK: максимально заметный */}
      <div style={{
        background: '#ff0',
        color: '#d00',
        border: '4px solid #d00',
        padding: '2rem',
        margin: '2rem 0',
        fontSize: '18px',
        zIndex: 9999,
        position: 'relative',
        boxShadow: '0 0 16px 4px #d00',
        textAlign: 'left',
        fontWeight: 'bold',
        lineHeight: 1.4,
        wordBreak: 'break-all',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'auto',
        opacity: 1,
        display: 'block',
      }}>
        <div style={{fontSize:'22px',marginBottom:'1rem'}}>=== DEBUG BLOCKS START ===</div>
        <pre style={{
          background: 'none',
          color: '#222',
          fontSize: '16px',
          margin: 0,
          padding: 0,
          border: 'none',
          boxShadow: 'none',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          fontWeight: 'normal',
        }}>{JSON.stringify(blocks, null, 2)}</pre>
        <div style={{fontSize:'22px',marginTop:'1rem'}}>=== DEBUG BLOCKS END ===</div>
      </div>
      {/* Плагин TailwindCSS Typography сделает текст из блоков красивым */}
      <div className="prose lg:prose-xl max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </article>
  );
}
