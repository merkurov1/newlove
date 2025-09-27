// app/talks/page.tsx
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';
import TalksClientPage from './TalksClientPage'; // Я помню, у вас был клиентский компонент

// Эта страница остается серверным компонентом для загрузки данных
export default async function TalksPage() {
  // Получаем сессию новым методом
  const session = await getServerSession(authOptions);

  // Получаем сообщения из базы данных
  const messages = await prisma.message.findMany({
    orderBy: {
      createdAt: 'asc',
    },
    include: {
      author: {
        select: {
          name: true,
          image: true,
        },
      },
    },
  });

  // Передаем данные в клиентский компонент для интерактивности
  return <TalksClientPage initialMessages={messages} session={session} />;
}
