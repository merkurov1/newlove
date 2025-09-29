// app/profile/page.js

import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';
import prisma from '@/lib/prisma';
import ProfileForm from '@/components/profile/ProfileForm'; // Мы создадим этот компонент на след. шаге

// Эта функция загружает актуальные данные пользователя из БД
async function getUserData(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });
  return user;
}

export default async function ProfilePage() {
  const session = await getServerSession(authOptions);

  // Если пользователя нет в сессии, отправляем на главную
  if (!session?.user?.id) {
    redirect('/');
  }

  const userData = await getUserData(session.user.id);

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Ваш профиль</h1>
      <p className="text-gray-600 mb-8">Здесь вы можете обновить свою публичную информацию.</p>
      
      {/* Передаем данные пользователя в клиентский компонент формы */}
      <ProfileForm user={userData} />
    </div>
  );
}
