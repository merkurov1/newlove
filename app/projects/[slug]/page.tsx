

import { notFound } from 'next/navigation';
import BlockRenderer from '@/components/BlockRenderer';
import prisma from '@/lib/prisma';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const project = await prisma.project.findUnique({
    where: { slug: params.slug },
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      previewImage: true,
    },
  });
  if (!project) {
    notFound();
  }
  let blocks: any[] = [];
  if (Array.isArray(project.content)) {
    blocks = project.content;
  } else {
    try {
      blocks = JSON.parse(project.content);
    } catch (e) {
      blocks = [];
    }
  }
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-6">{project.title}</h1>
      {/* Диагностика: raw content из базы */}
      <details open style={{marginBottom: 16, background: '#ffecec', padding: 12, borderRadius: 8, border: '1px solid #ffb3b3'}}>
        <summary style={{cursor: 'pointer', fontWeight: 'bold', color: '#b30000'}}>RAW content из базы (project.content)</summary>
        <pre style={{fontSize: 12, whiteSpace: 'pre-wrap'}}>{typeof project.content === 'string' ? project.content : JSON.stringify(project.content, null, 2)}</pre>
      </details>
      {/* Диагностика: blocks после парсинга */}
      <details open style={{marginBottom: 16, background: '#e6f7ff', padding: 12, borderRadius: 8, border: '1px solid #91d5ff'}}>
        <summary style={{cursor: 'pointer', fontWeight: 'bold', color: '#0050b3'}}>Массив blocks после парсинга</summary>
        <pre style={{fontSize: 12, whiteSpace: 'pre-wrap'}}>{JSON.stringify(blocks, null, 2)}</pre>
      </details>
      {/* Диагностика: каждый блок отдельно */}
      <div style={{marginBottom: 24}}>
        {blocks.map((block, idx) => (
          <details key={idx} open style={{marginBottom: 8, background: '#f6ffed', padding: 8, borderRadius: 6, border: '1px solid #b7eb8f'}}>
            <summary style={{cursor: 'pointer', fontWeight: 'bold', color: '#237804'}}>Блок #{idx + 1} — type: {block.type}</summary>
            <pre style={{fontSize: 12, whiteSpace: 'pre-wrap'}}>{JSON.stringify(block, null, 2)}</pre>
          </details>
        ))}
      </div>
      <div className="prose prose-lg max-w-none">
        <BlockRenderer blocks={blocks} />
      </div>
    </div>
  );
}