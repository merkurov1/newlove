
// app/projects/page.tsx

import Link from 'next/link';
import Image from 'next/image';
// Use a dynamic import for the Supabase request helper to avoid circular-import
// and ESM/CJS interop issues during Next.js production builds.
import { safeData } from '@/lib/safeSerialize';
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
  // Запрашиваем только опубликованные проекты через Supabase
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
  const { supabase } = await getSupabaseForRequest(globalReq) || {};
  let projects: any[] = [];
    if (supabase) {
    const { data, error } = await supabase.from('projects').select('id,slug,title,previewImage,publishedAt').eq('published', true).order('publishedAt', { ascending: false });
    if (error) console.error('Supabase fetch projects error', error);
    projects = safeData(data || []);
  } else {
    // If no request-scoped client is available (SSR/build), use a server service-role client
    try {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      const serverSupabase = getServerSupabaseClient({ useServiceRole: true });
      const { data, error } = await serverSupabase.from('projects').select('id,slug,title,previewImage,publishedAt').eq('published', true).order('publishedAt', { ascending: false });
      if (error) console.error('Supabase fetch projects (server) error', error);
      projects = safeData(data || []);
    } catch (e) {
      console.error('Failed to fetch projects via server client', e);
      projects = [];
    }
  }

  if (!projects || projects.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 bg-clip-text mb-8 text-center">
            Проекты
          </h1>
          <p className="text-gray-400 text-center mt-12">Проекты пока не добавлены.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-blue-100 py-10 px-2">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl sm:text-4xl font-bold text-transparent bg-gradient-to-r from-pink-400 via-blue-400 to-purple-400 bg-clip-text mb-8 text-center">
          Проекты
        </h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project: any) => (
            <Link href={`/${project.slug}`} key={project.id} className="block group">
              <div className="flex flex-col h-full bg-white/70 rounded-xl overflow-hidden transition-colors hover:bg-pink-50">
                <div className="relative w-full h-40 sm:h-48 bg-gray-100">
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
                <div className="p-4 flex-grow">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">{project.title}</h2>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
