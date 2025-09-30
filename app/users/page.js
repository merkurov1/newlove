// app/users/page.js

import prisma from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';

// Skeleton для карточек пользователей
function UserCardSkeleton() {
  return (
    <div className="flex flex-col items-center bg-white rounded-lg shadow p-6 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-gray-200 mb-3" />
      <div className="h-4 w-24 bg-gray-200 rounded mb-2" />
      <div className="h-3 w-32 bg-gray-100 rounded" />
    </div>
  );
}

// Fallback-аватар по первой букве
function FallbackAvatar({ name }) {
  const letter = (name || '?').charAt(0).toUpperCase();
  return (
    <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold mb-3 border">
      {letter}
    </div>
  );
}

export const metadata = {
  title: 'Пользователи',
  description: 'Список всех пользователей сайта',
};


export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      image: true,
      email: true,
      username: true,
    },
  });

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Пользователи</h1>
      <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {users.length === 0 && Array.from({ length: 8 }).map((_, i) => <UserCardSkeleton key={i} />)}
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/you/${user.username || user.name || user.id}`}
            className="flex flex-col items-center bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            {user.image ? (
              <Image
                src={user.image}
                alt={user.name || 'Пользователь'}
                width={64}
                height={64}
                className="rounded-full mb-3 border"
              />
            ) : (
              <FallbackAvatar name={user.name} />
            )}
            <div className="font-semibold text-gray-900 mb-1">{user.name || 'Без имени'}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
