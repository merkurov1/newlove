// app/users/page.js

import prisma from '@/lib/prisma';
import UsersClient from '@/components/UsersClient';

export const metadata = {
  title: 'Пользователи',
  description: 'Список всех пользователей сайта с их ролями и активностью',
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
      role: true,
      _count: {
        select: {
          articles: { where: { published: true } },
          projects: { where: { published: true } },
        }
      }
    },
  });

  return <UsersClient users={users} />;
}
