// app/talks/TalksClientPage.tsx
'use client';

import { useSession, signIn } from 'next-auth/react';
import LoungeInterface from '@/components/LoungeInterface'; // Ваш компонент с контентом

export default function TalksClientPage() {
  // Получаем данные о сессии
  const { data: session, status } = useSession();

  // Статус 'loading' — идёт проверка
  if (status === 'loading') {
    return <p>Загрузка...</p>;
  }

  // Статус 'authenticated' — пользователь вошёл
  if (status === 'authenticated') {
    return (
      <>
        <h1>Добро пожаловать, {session.user?.name}!</h1>
        <LoungeInterface />
        {/* Здесь можно добавить кнопку выхода, если нужно */}
      </>
    );
  }

  // Если не загрузка и не авторизован — показываем кнопку входа
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <h1 className="text-2xl mb-4">Доступ ограничен</h1>
      <p className="mb-6">Войдите, чтобы продолжить.</p>
      <button
        onClick={() => signIn('google')} // <-- Вызываем вход через Google
        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
      >
        Войти через Google
      </button>
    </div>
  );
}
