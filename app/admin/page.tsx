async function getStats() {
  try {
    const prisma = (await import('@/lib/prisma')).default;
    return await Promise.all([
      prisma.user.count(),
      prisma.article.count(),
      prisma.project.count(),
      prisma.letter.count(),
      prisma.subscriber.count(),
      prisma.message.count(),
    ]);
  } catch {
    return null;
  }
}

export default async function AdminDashboard() {
  const stats = await getStats();
  if (!stats) {
    return (
      <div className="max-w-xl mx-auto py-12 text-center">
        <h1 className="text-2xl font-bold mb-4">Demo Admin</h1>
        <p className="text-gray-500 mb-8">База данных недоступна. Это демо-версия админки для деплоя на Vercel.</p>
      </div>
    );
  }
  // ...остальной код...
}