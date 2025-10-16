'use client';

import Link from 'next/link';
import LoginButton from '@/components/LoginButton';

export default function ProfileGuest() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <h2 className="text-2xl font-bold mb-4">Редактирование профиля</h2>
      <p className="text-gray-600 mb-6">Только зарегистрированные пользователи могут изменять свою публичную информацию. Нажмите кнопку ниже, чтобы открыть страницу редактирования профиля.</p>
      <div className="flex items-center justify-center gap-4">
        <Link href="/profile" className="inline-flex items-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold">Редактировать профиль</Link>
        <LoginButton />
      </div>
    </div>
  );
}
