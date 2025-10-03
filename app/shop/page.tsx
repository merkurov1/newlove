// Временно отключена страница магазина
export default function ShopPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">🚧</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Магазин временно недоступен</h1>
        <p className="text-gray-600 mb-6">
          Мы работаем над улучшением системы ролей пользователей.
        </p>
        <div className="space-x-4">
          <a href="/" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors">
            На главную
          </a>
          <a href="/roles-demo" className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors">
            🎭 Демо ролей
          </a>
        </div>
      </div>
    </div>
  );
}