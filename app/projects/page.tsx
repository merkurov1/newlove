
"use client";
// app/projects/page.tsx

import Link from 'next/link';
import Image from 'next/image';
import prisma from '@/lib/prisma';
import { AnimatePresence, motion } from 'framer-motion';

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

  if (!projects || projects.length === 0) {
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key="projects-empty"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -30 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="max-w-7xl mx-auto px-4 py-12"
        >
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-12 text-center">
            Проекты
          </h1>
          <p className="text-center mt-12 text-gray-600">Проекты пока не добавлены.</p>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="projects-page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="max-w-7xl mx-auto px-2 sm:px-4 py-8 sm:py-12"
      >
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-gray-900 mb-8 sm:mb-12 text-center">
          Проекты
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-8">
          {projects.map((project) => (
            <Link href={`/${project.slug}`} key={project.id} className="block group">
              <div className="flex flex-col h-full bg-white rounded-xl shadow-lg overflow-hidden transition-shadow duration-300 hover:shadow-xl">
                <div className="relative w-full h-48 sm:h-56 bg-gray-200">
                  {project.previewImage && typeof project.previewImage === 'object' && (project.previewImage as any).url && (
                    <Image
                      src={(project.previewImage as any).url}
                      alt={(project.previewImage as any).alt || project.title}
                      fill
                      style={{ objectFit: 'cover' }}
                      className="transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                  )}
                </div>
                <div className="p-4 sm:p-6 flex-grow">
                  <h2 className="text-lg sm:text-2xl font-bold text-gray-800 truncate">{project.title}</h2>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
