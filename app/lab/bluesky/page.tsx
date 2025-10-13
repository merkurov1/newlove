// app/lab/bluesky/page.tsx
import AuthGuard from '@/components/AuthGuard';
import BlueskyFeed from '@/components/BlueskyFeed';
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
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900">🎉 Готово к работе!</h3>
              <p className="text-blue-700">Интеграция с Bluesky активна. Ниже вы можете видеть последние посты.</p>
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

        {/* Bluesky Feed Demo */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🟦 Живая лента Bluesky</h2>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-gray-600">
                Прямая интеграция с аккаунтом <strong>@merkurov.love</strong>
              </p>
              <a 
                href="https://bsky.app/profile/merkurov.love"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 transition-colors text-sm"
              >
                Открыть в Bluesky →
              </a>
            </div>
            
            <BlueskyFeed />
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
            
            <h3>Реализованные возможности</h3>
            <ol>
              <li><strong>✅ AT Protocol API</strong> — подключение к Bluesky через @atproto/api</li>
              <li><strong>✅ Авторизация</strong> — безопасная аутентификация через App Password</li>
              <li><strong>✅ Чтение постов</strong> — получение ленты пользователя в реальном времени</li>
              <li><strong>✅ UI интеграция</strong> — красивое отображение постов в дизайне сайта</li>
              <li><strong>🔄 Автопостинг</strong> — планируется автоматическая публикация статей</li>
            </ol>
            
            <h3>Технические особенности</h3>
            <ul>
              <li>Backend proxy для безопасности credentials</li>
              <li>Поддержка изображений и внешних ссылок</li>
              <li>Lazy loading с кнопкой &quot;Загрузить ещё&quot;</li>
              <li>Адаптивный дизайн для мобильных устройств</li>
              <li>Обработка ошибок и loading состояний</li>
            </ul>
            
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