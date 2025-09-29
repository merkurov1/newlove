// app/admin/projects/edit/[id]/page.js
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ContentForm from '@/components/admin/ContentForm';
import { updateProject } from '../../../actions';

async function getProject(id) {
  const project = await prisma.project.findUnique({
    where: { id },
    include: { tags: true }, // <-- ДОБАВЛЯЕМ ЗАГРУЗКУ ТЕГОВ
  });
  if (!project) notFound();
  return project;
}

export default async function EditProjectPage({ params }) { /* ... */ }
