// app/projects/page.tsx
import Link from 'next/link';
import prisma from '@/lib/prisma';

export const metadata = {
  title: 'Проекты',
  description: 'Портфолио проектов',
};

export const dynamic = 'force-dynamic';

// Demo projects for when DB is unavailable
const DEMO_PROJECTS = [
  {
    id: 'demo-1',
    slug: 'demo-project-1',
    title: 'Демо-проект 1',
  },
  {
    id: 'demo-2',
    slug: 'demo-project-2',
    title: 'Демо-проект 2',
  },
];

async function getProjects() {
  try {
    const projects = await prisma.project.findMany({
      where: { published: true },
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        slug: true,
        title: true,
      },
    });
    return { projects, isDemo: false };
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return { projects: DEMO_PROJECTS, isDemo: true };
  }
}

export default async function ProjectsPage() {
  const { projects, isDemo } = await getProjects();

  if (!projects || projects.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-12 text-center">
          Проекты
        </h1>
        <p className="text-center mt-12 text-gray-600">Проекты пока не добавлены.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-12 text-center">
        Проекты
      </h1>
      {isDemo && (
        <div className="mb-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-center">
          <p className="text-yellow-800">База данных недоступна. Показаны демо-данные.</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((project) => (
          <Link href={`/projects/${project.slug}`} key={project.id} className="block group">
            <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden transition-shadow duration-300 hover:shadow-xl">
              <div className="relative w-full h-56 bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center">
                <span className="text-white text-6xl font-bold opacity-20">P</span>
              </div>
              <div className="p-6 flex-grow">
                <h2 className="text-2xl font-bold text-gray-800 group-hover:text-blue-600 transition-colors">
                  {project.title}
                </h2>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
