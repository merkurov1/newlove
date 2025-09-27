// app/admin/layout.js
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/authOptions';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic'; // <<< ДОБАВЛЕНО: Запрещаем статическую генерацию

export default async function AdminLayout({ children }) {
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== 'ADMIN') {
    redirect('/');
  }

  return <>{children}</>;
}
