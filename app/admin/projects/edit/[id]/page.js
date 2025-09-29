// app/admin/projects/edit/[id]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateProject } from '../../../actions';

async function getProject(id) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!project) notFound();
  return project;
}

export default async function EditProjectPage({ params }) {
  const project = await getProject(params.id);

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование проекта</h1>
      <ContentForm 
        initialData={project} 
        saveAction={updateProject} 
        type="проект" 
      />
    </div>
  );
}
