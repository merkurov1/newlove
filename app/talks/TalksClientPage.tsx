// app/talks/TalksClientPage.tsx
'use client';

import { useSession, signIn } from 'next-auth/react';
import LoungeInterface from '@/components/LoungeInterface';
import { useEffect, useState } from 'react';

// Тип для сообщений
type InitialMessage = {
  id: number;
  createdAt: Date;
  content: string;
  userId: string;
  author: {
    name: string | null;
    image: string | null;
  };
};

export default function TalksClientPage() {
  const { data: session, status } = useSession();
  const [initialMessages, setInitialMessages] = useState<InitialMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Загружаем сообщения при монтировании компонента
  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/messages')
        .then(res => res.json())
        .then(data => {
          setInitialMessages(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Failed to fetch messages', error);
          setLoading(false);
        });
    }
  }, [status]);

  // Статус 'loading' — идёт проверка
  if (status === 'loading' || loading) {
    return <p>Загрузка...</p>;
  }

  // Статус 'authenticated' — пользователь вошёл
  if (status === 'authenticated') {
    return (
      <>
        <h1>Добро пожаловать, {session.user?.name}!</h1>
        {/* ПЕРЕДАЕМ ПРОПСЫ В KOMPONENT */}
        <LoungeInterface initialMessages={initialMessages} session={session} />
      </>
    );
  }

  // Если не загрузка и не авторизован — показываем кнопку входа
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-2xl mb-4">Доступ ограничен</h1>
      <p className="mb-6">Войдите, чтобы продолжить.</p>
      <button
        onClick={() => signIn('google')}
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Войти через Google
      </button>
    </div>
  );
}