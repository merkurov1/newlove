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
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Проекты</h1>
        <Link 
          href="/admin/projects/new" // TODO: Создать страницу
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          + Добавить проект
        </Link>
      </div>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {projects.length === 0 ? (
            <li className="p-4 text-center text-gray-500">Пока нет ни одного проекта.</li>
          ) : (
            projects.map((project) => (
              <li key={project.id} className="p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{project.title}</h3>
                  <p className="text-sm text-gray-500">/{project.slug}</p>
                </div>
                <div className="flex items-center space-x-4">
                  <Link href={`/admin/projects/edit/${project.id}`} className="text-blue-500 hover:underline">
                    Редактировать
                  </Link>
                  <form action={deleteProject}>
                    <input type="hidden" name="id" value={project.id} />
                    <button type="submit" className="text-red-500 hover:underline">
                      Удалить
                    </button>
                  </form>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
