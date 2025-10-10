// app/admin/projects/page.tsx
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { deleteProject } from '../actions'; // Мы добавим эту функцию в actions.js

export const dynamic = 'force-dynamic';

export default async function AdminProjectsPage() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-purple-800 tracking-tight mb-1">Проекты</h1>
          <p className="text-gray-500 text-base">Все ваши проекты и черновики.</p>
        </div>
        <Link
          href="/admin/projects/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 text-white font-semibold shadow hover:bg-purple-700 transition-all"
        >
          🚀 Новый проект
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.length === 0 ? (
          <div className="col-span-full p-6 text-center text-gray-400 bg-white rounded-xl border shadow-sm">Пока нет ни одного проекта.</div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className="bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow group">
              <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-purple-700 transition-colors">{project.title}</h3>
              <p className="text-xs text-gray-500 truncate">/{project.slug}</p>
              <div className="flex items-center gap-3 mt-2">
                <Link href={`/admin/projects/edit/${project.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-purple-50 text-purple-700 font-medium hover:bg-purple-100 transition-all text-sm">
                  ✏️ Редактировать
                </Link>
                <form action={deleteProject} className="inline">
                  <input type="hidden" name="id" value={project.id} />
                  <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-all text-sm">
                    🗑️ Удалить
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
