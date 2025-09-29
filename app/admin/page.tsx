// app/admin/page.tsx
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

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900">Добро пожаловать!</h1>
      <p className="mt-2 text-gray-600">
        Выберите раздел в меню слева, чтобы начать управление контентом.
      </p>
      <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-6">
        <StatCard label="Пользователи" value={userCount} icon="👤" />
        <StatCard label="Статьи" value={articleCount} icon="📝" />
        <StatCard label="Проекты" value={projectCount} icon="📁" />
        <StatCard label="Выпуски" value={letterCount} icon="✉️" />
        <StatCard label="Подписчики" value={subscriberCount} icon="📬" />
        <StatCard label="Сообщения" value={messageCount} icon="💬" />
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
