// app/talks/page.tsx
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import prisma from '@/lib/prisma';
import TalksClientPage from './TalksClientPage';
import AuthGuard from '@/components/AuthGuard';

export const metadata = {
  title: 'Talks | Закрытое общение',
  description: 'Закрытый раздел для зарегистрированных пользователей',
};

// Эта страница остается серверным компонентом для загрузки данных
export default async function TalksPage() {
  // Получаем сессию
  const session = await getServerSession(authOptions);

  // Получаем сообщения из базы данных
  const messages = await prisma.message.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          name: true,
          image: true,
        },
      },
    },
  });

  return (
    <AuthGuard>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Talks</h1>
          <p className="text-gray-600 mt-2">Закрытое общение для зарегистрированных пользователей</p>
        </div>
        <TalksClientPage initialMessages={messages} session={session} />
      </div>
    </AuthGuard>
  );
}
