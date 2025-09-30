// ВРЕМЕННО: тестовая ошибка для Sentry
if (typeof window !== 'undefined') {
  // @ts-ignore
  myUndefinedFunction();
}
// app/admin/page.tsx


import Link from 'next/link';
import prisma from '@/lib/prisma';

export default async function AdminDashboard() {
  // Получаем статистику
  const [userCount, articleCount, projectCount, letterCount, subscriberCount, messageCount] = await Promise.all([
    prisma.user.count(),
    prisma.article.count(),
    prisma.project.count(),
    prisma.letter.count(),
    prisma.subscriber.count(),
    prisma.message.count(),
  ]);

  const quickLinks = [
    { href: '/admin/users', label: 'Пользователи', icon: '👤' },
    { href: '/admin/products', label: 'Товары', icon: '🛍️' },
    { href: '/admin/orders', label: 'История заказов', icon: '📦' },
    { href: '/admin/subscribers', label: 'Подписчики', icon: '📬' },
    { href: '/admin/articles', label: 'Статьи', icon: '📝' },
    { href: '/admin/projects', label: 'Проекты', icon: '📁' },
    { href: '/admin/letters', label: 'Рассылки', icon: '✉️' },
  ];

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Добро пожаловать!</h1>
      <p className="mt-2 text-gray-600">
        Выберите раздел в меню слева или используйте быстрые ссылки ниже.
      </p>
      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-6">
        <StatCard label="Пользователи" value={userCount} icon="👤" />
        <StatCard label="Статьи" value={articleCount} icon="📝" />
        <StatCard label="Проекты" value={projectCount} icon="📁" />
        <StatCard label="Выпуски" value={letterCount} icon="✉️" />
        <StatCard label="Подписчики" value={subscriberCount} icon="📬" />
        <StatCard label="Сообщения" value={messageCount} icon="💬" />
      </div>
      <div className="mt-10">
        <h2 className="text-xl font-semibold mb-4">Быстрые ссылки</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {quickLinks.map(link => (
            <Link key={link.href} href={link.href} className="flex items-center gap-2 px-4 py-3 bg-white rounded-lg shadow hover:bg-blue-50 transition">
              <span className="text-2xl">{link.icon}</span>
              <span className="font-medium text-gray-800">{link.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-6 flex flex-col items-center justify-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-gray-500 mt-1 text-sm">{label}</div>
    </div>
  );
}
