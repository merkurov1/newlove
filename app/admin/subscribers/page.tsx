import prisma from '@/lib/prisma';

export default async function AdminSubscribersPage() {
  const subscribers = await prisma.subscriber.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      createdAt: true,
      userId: true,
    },
  });

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Подписчики рассылки</h1>
      <table className="min-w-full bg-white border rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-3">Email</th>
            <th className="p-3">Дата подписки</th>
            <th className="p-3">Пользователь</th>
            <th className="p-3">Действия</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map(sub => (
            <tr key={sub.id} className="border-t hover:bg-gray-50">
              <td className="p-3">{sub.email}</td>
              <td className="p-3">{new Date(sub.createdAt).toLocaleDateString()}</td>
              <td className="p-3">{sub.userId ? <span className="text-green-600">Пользователь</span> : <span className="text-gray-400">Гость</span>}</td>
              <td className="p-3">
                {/* Здесь будет кнопка удаления/блокировки */}
                <button className="text-red-600 hover:underline">Удалить</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
