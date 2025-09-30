import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import Link from 'next/link';

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      image: true,
    },
  });

  if (!users) return notFound();

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Пользователи</h1>
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3">Имя</th>
            <th className="p-3">Username</th>
            <th className="p-3">Email</th>
            <th className="p-3">Роль</th>
            <th className="p-3">Статус</th>
            <th className="p-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id} className="border-t hover:bg-gray-50">
              <td className="p-3 flex items-center gap-2">
                {user.image ? (
                  <img src={user.image ?? undefined} alt={user.name || user.username || ''} className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold">
                    {(user.name || user.username || '?')[0].toUpperCase()}
                  </div>
                )}
                <span>{user.name || user.username}</span>
              </td>
              <td className="p-3">{user.username}</td>
              <td className="p-3">{user.email}</td>
              <td className="p-3 font-semibold">{user.role}</td>
              <td className="p-3">Активен</td>
              <td className="p-3">
                <Link href={`/admin/users/${user.id}`} className="text-blue-600 hover:underline mr-2">Изменить</Link>
                {/* Здесь будут кнопки блокировки/удаления */}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
