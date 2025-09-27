// app/admin/layout.js
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }) {
  // Используем новый метод для получения сессии на сервере
  const session = await getServerSession(authOptions);

  // Логика проверки остается той же
  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/');
  }

  return <>{children}</>;
}
