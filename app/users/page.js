// app/users/page.js
import prisma from '@/lib/prisma';
import Link from 'next/link';
import Image from 'next/image';

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
        {users.map((user) => (
          <Link
            key={user.id}
            href={`/you/${user.username || user.name || user.id}`}
            className="flex flex-col items-center bg-white rounded-lg shadow p-6 hover:shadow-lg transition"
          >
            <Image
              src={user.image || '/file.svg'}
              alt={user.name || 'Пользователь'}
              width={64}
              height={64}
              className="rounded-full mb-3 border"
            />
            <div className="font-semibold text-gray-900 mb-1">{user.name || 'Без имени'}</div>
            <div className="text-xs text-gray-500">{user.email}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
