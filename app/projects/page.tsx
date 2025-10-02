// app/projects/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import prisma from '@/lib/prisma';

// Определяем типы для проекта, чтобы код был надежнее
interface ProjectPreview {
  id: string;
  slug: string;
  title: string;
  // Поле изображения может отсутствовать, поэтому оно опциональное (?)
  previewImage?: {
    url: string;
    alt?: string;
  };
}

export default async function ProjectsPage() {
  console.log('🔍 ProjectsPage: Загрузка списка проектов...');
  
  // Запрашиваем только опубликованные проекты через Prisma
  const projects = await prisma.project.findMany({
    where: { published: true },
    select: {
      id: true,
      slug: true,
      title: true,
      previewImage: true,
      publishedAt: true,
    },
    orderBy: { publishedAt: 'desc' },
  });

  console.log('🔍 ProjectsPage: Найдено проектов:', projects.length);

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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {projects.map((project) => (
          <Link href={`/projects/${project.slug}`} key={project.id} className="block group">
            <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden transition-shadow duration-300 hover:shadow-xl">
              <div className="relative w-full h-56 bg-gray-200">
                {/* ✅ РЕШЕНИЕ ОШИБКИ:
                  Рендерим <Image> только если project.previewImage и project.previewImage.url существуют.
                */}
                {project.previewImage && typeof project.previewImage === 'object' && (project.previewImage as any).url && (
                  <Image
                    src={(project.previewImage as any).url}
                    alt={(project.previewImage as any).alt || project.title}
                    fill
                    style={{ objectFit: 'cover' }}
                    className="transition-transform duration-300 group-hover:scale-105"
                  />
                )}
              </div>
              <div className="p-6 flex-grow">
                <h2 className="text-2xl font-bold text-gray-800">{project.title}</h2>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
