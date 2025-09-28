import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  // Находим только опубликованные проекты
  const projects = await prisma.project.findMany({
    where: { published: true },
    orderBy: { publishedAt: 'desc' },
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-4xl font-bold mb-8">Проекты</h1>
      <div className="space-y-6">
        {projects.length > 0 ? (
          projects.map(project => (
            <Link key={project.id} href={`/projects/${project.slug}`} className="block p-6 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">
              <h2 className="text-2xl font-semibold text-gray-800">{project.title}</h2>
              <p className="text-gray-500 mt-2">
                {new Date(project.publishedAt).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </Link>
          ))
        ) : (
          <p className="text-gray-600">Здесь пока ничего нет. Но скоро появится!</p>
        )}
      </div>
    </div>
  );
}

