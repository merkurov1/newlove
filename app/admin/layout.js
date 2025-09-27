// app/admin/layout.js
import { auth } from '@/lib/auth'; // Путь к вашему файлу next-auth
import { redirect } from 'next/navigation';

export default async function AdminLayout({ children }) {
  const session = await auth();

  // Проверяем, есть ли сессия и является ли пользователь админом
  if (!session?.user || session.user.role !== 'ADMIN') {
    // Если нет, перенаправляем на главную страницу
    redirect('/');
  }

  // Если проверка пройдена, показываем содержимое страницы
  return <>{children}</>;
}
