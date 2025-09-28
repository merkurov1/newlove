// Это теперь чистый Серверный Компонент. Директива 'use client' здесь не нужна.
import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import EditLetterForm from '@/components/admin/EditLetterForm'; // Импортируем наш новый клиентский компонент

export default async function EditLetterPage({ params }) {
  const letterId = params.id;
  
  // 1. Быстро загружаем все необходимые данные на сервере
  const letter = await prisma.letter.findUnique({
    where: { id: letterId },
  });

  if (!letter) {
    notFound();
  }

  // Также загружаем количество подписчиков
  const subscriberCount = await prisma.subscriber.count();

  // 2. Передаем эти данные как пропсы в наш интерактивный клиентский компонент
  return <EditLetterForm letter={letter} subscriberCount={subscriberCount} />;
}


