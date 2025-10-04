// Это теперь чистый Серверный Компонент. Директива 'use client' здесь не нужна.
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';


import ContentForm from '@/components/admin/ContentForm';
import { updateLetter } from '../../../actions';

export default async function EditLetterPage({ params }) {
  const letterId = params.id;
  const letter = await prisma.letter.findUnique({
    where: { id: letterId },
    include: { tags: true } // Включаем теги для редактирования
  });
  if (!letter) notFound();
  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование выпуска рассылки</h1>
      <ContentForm initialData={letter} saveAction={updateLetter} type="выпуск" />
    </div>
  );
}


