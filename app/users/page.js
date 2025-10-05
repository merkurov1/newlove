import { prisma } from '@/lib/prisma';
import UsersClient from '@/components/UsersClient';

// Серверный компонент для публичного списка пользователей
export default async function UsersPage() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      createdAt: true,
      _count: {
        select: {
          articles: true,
          projects: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  });

  return <UsersClient users={users} />;
}