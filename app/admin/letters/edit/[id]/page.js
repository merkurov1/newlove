// Это теперь чистый Серверный Компонент. Директива 'use client' здесь не нужна.
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';

import ContentForm from '@/components/admin/ContentForm';
import { updateLetter } from '../../../actions';
import SendLetterForm from '@/components/admin/SendLetterForm';

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
      
      {/* Форма отправки рассылки */}
      {letter.published ? (
        <div className="mt-8 p-6 bg-blue-50 border border-blue-200 rounded-lg">
          <h2 className="text-xl font-semibold text-blue-900 mb-4">
            📧 Отправка рассылки подписчикам
          </h2>
          <SendLetterForm letter={letter} />
        </div>
      ) : (
        <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-700 mb-2">
            📧 Отправка рассылки
          </h2>
          <p className="text-gray-600">
            Сначала опубликуйте письмо на сайте, затем здесь появится возможность отправить рассылку подписчикам.
          </p>
        </div>
      )}
    </div>
  );
}


