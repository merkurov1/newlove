'use client';

import Link from 'next/link';
import LoginButton from '@/components/LoginButton';

export default function ProfileGuest() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center">
      <h2 className="text-2xl font-bold mb-4">Войдите, чтобы редактировать профиль</h2>
      <p className="text-gray-600 mb-6">Только зарегистрированные пользователи могут изменять свою публичную информацию.</p>
      <div className="flex items-center justify-center gap-4">
        <LoginButton />
        <Link href="/" className="text-sm text-gray-500 hover:underline">Вернуться на главную</Link>
      </div>
    </div>
  );
}
