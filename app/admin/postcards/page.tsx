import Link from 'next/link';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

// Заглушка данных до того как Prisma модели заработают
const mockPostcards = [
  {
    id: 'postcard_1',
    title: 'Авторская открытка "Закат"',
    description: 'Уникальная открытка с авторским рисунком заката над городом',
    image: 'https://example.com/postcard1.jpg',
    price: 50000,
    available: true,
    featured: true,
    createdAt: new Date(),
    _count: { orders: 3 }
  },
  {
    id: 'postcard_2', 
    title: 'Открытка "Минимализм"',
    description: 'Стильная минималистичная открытка в черно-белых тонах',
    image: 'https://example.com/postcard2.jpg',
    price: 35000,
    available: true,
    featured: false,
    createdAt: new Date(),
    _count: { orders: 1 }
  }
];

export default async function AdminPostcardsPage() {
  // TODO: Заменить на реальный запрос когда Prisma модели заработают
  // const postcards = await prisma.postcard.findMany({
  //   orderBy: { createdAt: 'desc' },
  //   include: {
  //     _count: {
  //       select: { orders: true }
  //     }
  //   }
  // });

  const postcards = mockPostcards;

  const formatPrice = (priceInCopecks: number) => {
    return `${(priceInCopecks / 100).toFixed(0)} ₽`;
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Управление открытками</h1>
          <p className="text-gray-600 mt-2">Создание и редактирование авторских открыток</p>
        </div>
        <Link 
          href="/admin/postcards/new"
          className="bg-orange-600 text-white py-2 px-4 rounded-md hover:bg-orange-700 transition-colors"
        >
          + Добавить открытку
        </Link>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                <span className="text-orange-600 text-lg">🎨</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего открыток</p>
              <p className="text-2xl font-semibold text-gray-900">{postcards.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                <span className="text-green-600 text-lg">✅</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Доступно</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.filter(p => p.available).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-md flex items-center justify-center">
                <span className="text-yellow-600 text-lg">⭐</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Рекомендуемые</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.filter(p => p.featured).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <span className="text-blue-600 text-lg">📦</span>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Всего заказов</p>
              <p className="text-2xl font-semibold text-gray-900">
                {postcards.reduce((sum, p) => sum + p._count.orders, 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Список открыток */}
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        {postcards.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            <div className="text-4xl mb-4">🎨</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Пока нет открыток</h3>
            <p className="text-gray-500 mb-4">Создайте первую авторскую открытку</p>
            <Link 
              href="/admin/postcards/new"
              className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
            >
              Добавить открытку
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Открытка
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Цена
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Статус
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Заказов
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Создана
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {postcards.map((postcard) => (
                  <tr key={postcard.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-16 w-16">
                          <div className="h-16 w-16 rounded-lg bg-gray-200 flex items-center justify-center">
                            <span className="text-gray-400 text-2xl">🎨</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {postcard.title}
                            {postcard.featured && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                                ⭐ Рекомендуем
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {postcard.description}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatPrice(postcard.price)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        postcard.available 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {postcard.available ? '✅ Доступна' : '❌ Недоступна'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {postcard._count.orders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(postcard.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <Link 
                          href={`/admin/postcards/edit/${postcard.id}`}
                          className="text-blue-600 hover:text-blue-900 transition-colors"
                        >
                          Изменить
                        </Link>
                        <Link 
                          href={`/admin/postcards/orders/${postcard.id}`}
                          className="text-green-600 hover:text-green-900 transition-colors"
                        >
                          Заказы
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Полезные ссылки */}
      <div className="mt-8 bg-blue-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          🔗 Полезные ссылки
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link 
            href="/admin/postcards/orders"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">📦 Все заказы</div>
            <div className="text-sm text-gray-600">Управление заказами открыток</div>
          </Link>
          <Link 
            href="/letters"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">👀 Посмотреть магазин</div>
            <div className="text-sm text-gray-600">Как видят пользователи</div>
          </Link>
          <Link 
            href="/admin/media"
            className="block p-4 bg-white rounded-lg border border-blue-200 hover:border-blue-300 transition-colors"
          >
            <div className="font-medium text-gray-900">🖼️ Загрузить изображения</div>
            <div className="text-sm text-gray-600">Медиа для открыток</div>
          </Link>
        </div>
      </div>
    </div>
  );
}