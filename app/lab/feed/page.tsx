// app/lab/feed/page.tsx
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';

export const metadata = {
  title: 'Сводная лента | Lab',
  description: 'Единая лента из всех подключенных сервисов и платформ',
};

export default function FeedLabPage() {
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
            📰 Сводная лента
          </h1>
          <p className="text-gray-600 mt-2">
            Единая лента активности из всех подключенных сервисов и платформ
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-gray-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Концепция</h3>
              <p className="text-gray-700">Идея объединения всех источников контента в единую ленту</p>
            </div>
          </div>
        </div>

        {/* Feed Concept */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🎯 Концепция ленты</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Источники контента:</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                  Статьи с сайта
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                  Проекты и обновления
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-purple-500 rounded-full mr-3"></span>
                  Посты из Bluesky
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-black rounded-full mr-3"></span>
                  Статьи с Medium
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                  Видео с YouTube
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-yellow-500 rounded-full mr-3"></span>
                  Commits из GitHub
                </li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Возможности фильтрации:</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  По типу контента
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  По датам
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  По тегам и категориям
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  По популярности
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  Только новые
                </li>
                <li className="flex items-center">
                  <span className="w-2 h-2 bg-orange-500 rounded-full mr-3"></span>
                  Персональные рекомендации
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Feed Prototype */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🖼️ Прототип ленты</h2>
          
          <div className="space-y-4">
            {/* Feed Item 1 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 opacity-50">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-sm font-medium text-gray-900">Новая статья</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">2 часа назад</span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">Новые возможности Next.js 15</h3>
                  <p className="text-sm text-gray-600">Обзор новых возможностей и изменений в последней версии Next.js...</p>
                </div>
              </div>
            </div>

            {/* Feed Item 2 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 opacity-50">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-purple-600 font-semibold text-sm">🦋</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-sm font-medium text-gray-900">Bluesky пост</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">4 часа назад</span>
                  </div>
                  <p className="text-sm text-gray-600">Размышления о будущем децентрализованных социальных сетей и AT Protocol...</p>
                </div>
              </div>
            </div>

            {/* Feed Item 3 */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 opacity-50">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-sm font-medium text-gray-900">Обновление проекта</span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs text-gray-500">6 часов назад</span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">Migration Toolkit v2.0</h3>
                  <p className="text-sm text-gray-600">Выпущена новая версия инструмента для миграций базы данных...</p>
                </div>
              </div>
            </div>
          </div>

          <div className="text-center mt-8 py-8 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-4xl mb-4">🔮</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Скоро здесь будет живая лента</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              После реализации интеграций с Bluesky, Medium и YouTube здесь появится 
              объединенная лента всех ваших активностей.
            </p>
          </div>
        </div>

        {/* Technical Implementation */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">⚙️ Техническая реализация</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Агрегация данных:</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>• <strong>Webhook</strong> для real-time обновлений</li>
                <li>• <strong>Cron jobs</strong> для периодической синхронизации</li>
                <li>• <strong>Cache layer</strong> для быстрого доступа</li>
                <li>• <strong>Queue system</strong> для обработки больших объемов</li>
              </ul>
              
              <h3 className="font-semibold text-gray-900 mb-3 mt-6">База данных:</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>• Единая таблица <code className="bg-gray-100 px-1 rounded">feed_items</code></li>
                <li>• Полиморфные связи с источниками</li>
                <li>• Индексы для быстрой сортировки</li>
                <li>• Архивирование старых записей</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-gray-900 mb-3">Frontend:</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>• <strong>Infinite scroll</strong> для длинных лент</li>
                <li>• <strong>Virtual scrolling</strong> для производительности</li>
                <li>• <strong>Real-time updates</strong> через WebSocket</li>
                <li>• <strong>PWA</strong> для мобильного опыта</li>
              </ul>
              
              <h3 className="font-semibold text-gray-900 mb-3 mt-6">Персонализация:</h3>
              <ul className="space-y-2 text-gray-600 text-sm">
                <li>• Алгоритмы рекомендаций</li>
                <li>• Машинное обучение для интересов</li>
                <li>• A/B тестирование ленты</li>
                <li>• Пользовательские настройки</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Future Vision */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">🚀 Видение будущего</h2>
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-700">
              Сводная лента станет центральным местом для отслеживания всей активности. 
              Это не просто хронологический список, а умная система, которая:
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">🤖 Умная фильтрация</h4>
                <p className="text-sm text-gray-600">
                  Использует машинное обучение для показа наиболее релевантного контента 
                  в зависимости от времени дня, активности пользователя и его интересов.
                </p>
              </div>
              
              <div className="bg-white rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-2">📊 Аналитика влияния</h4>
                <p className="text-sm text-gray-600">
                  Отслеживает метрики взаимодействий, помогает понять какой контент 
                  лучше всего резонирует с аудиторией на разных платформах.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}