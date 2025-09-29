// app/admin/projects/edit/[id]/page.js

import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import EditProjectForm from '@/components/admin/EditProjectForm'; // Импортируем нашу новую форму

// Эта функция теперь выполняется на сервере!
async function getProject(id) {
  const project = await prisma.project.findUnique({
    where: { id },
  });
  if (!project) {
    notFound();
  }
  return project;
}

// Сама страница теперь тоже серверный компонент
export default async function EditProjectPage({ params }) {
  // 1. Получаем данные напрямую из базы на сервере
  const project = await getProject(params.id);

  // 2. Рендерим заголовок и передаем данные в клиентский компонент формы
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование проекта</h1>
      <EditProjectForm project={project} />
    </div>
  );
}
