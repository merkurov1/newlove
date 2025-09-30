// app/projects/page.tsx
import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@supabase/supabase-js';

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

// Используйте SERVICE_ROLE_KEY, так как это серверный компонент
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function ProjectsPage() {
  // Запрашиваем только те поля, которые нужны для превью
  const { data: projects } = await supabase
    .from('projects')
    .select('id, slug, title, previewImage')
    .order('publishedAt', { ascending: false });

  if (!projects || projects.length === 0) {
    return <p className="text-center mt-12">Проекты пока не добавлены.</p>;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-12 text-center">
        Проекты
      </h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {(projects as ProjectPreview[]).map((project) => (
          <Link href={`/projects/${project.slug}`} key={project.id} className="block group">
            <div className="flex flex-col h-full bg-white rounded-lg shadow-lg overflow-hidden transition-shadow duration-300 hover:shadow-xl">
              <div className="relative w-full h-56 bg-gray-200">
                {/* ✅ РЕШЕНИЕ ОШИБКИ:
                  Рендерим <Image> только если project.previewImage и project.previewImage.url существуют.
                */}
                {project.previewImage && project.previewImage.url && (
                  <Image
                    src={project.previewImage.url}
                    alt={project.previewImage.alt || project.title}
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
