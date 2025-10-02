import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export default async function ProjectsInfoPage() {
  let projects = [];
  let error = null;

  try {
    projects = await prisma.project.findMany({
      select: {
        id: true,
        title: true,
        slug: true,
        published: true,
        publishedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Информация о проектах</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <strong>Ошибка:</strong> {error}
        </div>
      )}
      
      <div className="bg-gray-100 p-4 rounded mb-4">
        <p><strong>Всего проектов:</strong> {projects.length}</p>
        <p><strong>Опубликованных:</strong> {projects.filter(p => p.published).length}</p>
      </div>
      
      {projects.length > 0 ? (
        <div className="space-y-4">
          {projects.map(project => (
            <div key={project.id} className="border border-gray-300 p-4 rounded">
              <h3 className="font-semibold text-lg">{project.title}</h3>
              <p><strong>Слаг:</strong> <code className="bg-gray-200 px-2 py-1 rounded">{project.slug}</code></p>
              <p><strong>Опубликован:</strong> {project.published ? '✅ Да' : '❌ Нет'}</p>
              {project.published && (
                <p><strong>Ссылка:</strong> <a href={`/projects/${project.slug}`} className="text-blue-600 underline">/projects/{project.slug}</a></p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600">Проекты не найдены.</p>
      )}
    </div>
  );
}