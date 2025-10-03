// app/lab/bluesky/page.tsx
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';

export const metadata = {
  title: 'Bluesky Integration | Lab',
  description: 'Экспериментальная интеграция с социальной сетью Bluesky',
};

export default function BlueskyLabPage() {
  return (
    <AuthGuard>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link 
            href="/lab" 
            className="inline-flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-4"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Вернуться в лабораторию
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            🦋 Bluesky Integration
          </h1>
          <p className="text-gray-600 mt-2">
            Экспериментальная интеграция с децентрализованной социальной сетью Bluesky
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-blue-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900">В разработке</h3>
              <p className="text-blue-700">Тестируется AT Protocol и возможности интеграции</p>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">📝 Планируемые возможности</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Автопостинг статей в Bluesky
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Импорт и отображение постов
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Синхронизация профиля
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Кросс-постинг между платформами
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">🔧 Технические детали</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                AT Protocol для децентрализации
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                OAuth для безопасной авторизации
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Webhook для реального времени
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
                Кэширование для производительности
              </li>
            </ul>
          </div>
        </div>

        {/* Demo Area */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🧪 Демо-зона</h2>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="text-center py-12">
              <div className="text-6xl mb-4">🚧</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">В разработке</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                Здесь будет интерактивная демонстрация интеграции с Bluesky. 
                Пока идет изучение AT Protocol и разработка API.
              </p>
              
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
                <div className="text-center">
                  <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                    <span className="text-blue-600 font-semibold">1</span>
                  </div>
                  <p className="text-sm text-gray-600">Подключение аккаунта</p>
                </div>
                <div className="text-center">
                  <div className="bg-gray-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                    <span className="text-gray-400 font-semibold">2</span>
                  </div>
                  <p className="text-sm text-gray-400">Синхронизация постов</p>
                </div>
                <div className="text-center">
                  <div className="bg-gray-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                    <span className="text-gray-400 font-semibold">3</span>
                  </div>
                  <p className="text-sm text-gray-400">Автопостинг</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📚 Документация</h2>
          <div className="prose prose-gray max-w-none">
            <h3>AT Protocol</h3>
            <p>
              Bluesky использует AT Protocol (Authenticated Transfer Protocol) — 
              открытый протокол для децентрализованных социальных сетей.
            </p>
            
            <h3>Этапы интеграции</h3>
            <ol>
              <li><strong>Изучение API</strong> — анализ возможностей AT Protocol</li>
              <li><strong>Авторизация</strong> — настройка OAuth для Bluesky</li>
              <li><strong>Базовые операции</strong> — создание и чтение постов</li>
              <li><strong>Автоматизация</strong> — настройка автопостинга статей</li>
              <li><strong>UI интеграция</strong> — добавление в интерфейс сайта</li>
            </ol>
            
            <h3>Преимущества</h3>
            <ul>
              <li>Децентрализованная архитектура</li>
              <li>Полный контроль над данными</li>
              <li>Открытый протокол</li>
              <li>Растущее сообщество</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}