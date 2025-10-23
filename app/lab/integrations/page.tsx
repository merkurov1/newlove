// app/lab/integrations/page.tsx
import AuthGuard from '@/components/AuthGuard';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Medium & YouTube Integration | Lab',
  description: 'Интеграция с Medium и YouTube для импорта и синхронизации контента',
});

export default function IntegrationsLabPage() {
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
            📺 Medium & YouTube Integration
          </h1>
          <p className="text-gray-600 mt-2">
            Интеграция с популярными платформами для импорта и синхронизации контента
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-yellow-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-yellow-900">Планируется</h3>
              <p className="text-yellow-700">Анализируются API и возможности интеграции</p>
            </div>
          </div>
        </div>

        {/* Platforms Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Medium */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center mb-4">
              <div className="bg-black text-white rounded-lg p-2 mr-3">
                <span className="font-bold text-sm">M</span>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Medium</h3>
            </div>
            
            <h4 className="font-medium text-gray-900 mb-3">Планируемые возможности:</h4>
            <ul className="space-y-2 text-gray-600 mb-4">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Импорт статей с Medium
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Синхронизация метаданных
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Кросс-постинг на Medium
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Отслеживание статистики
              </li>
            </ul>
            
            <div className="text-sm text-gray-500">
              <strong>API:</strong> Medium API для чтения и публикации
            </div>
          </div>

          {/* YouTube */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center mb-4">
              <div className="bg-red-600 text-white rounded-lg p-2 mr-3">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900">YouTube</h3>
            </div>
            
            <h4 className="font-medium text-gray-900 mb-3">Планируемые возможности:</h4>
            <ul className="space-y-2 text-gray-600 mb-4">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Импорт метаданных видео
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-3"></span>
                Встраивание видео в статьи
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Автоматические транскрипты
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Уведомления о новых видео
              </li>
            </ul>
            
            <div className="text-sm text-gray-500">
              <strong>API:</strong> YouTube Data API v3
            </div>
          </div>
        </div>

        {/* Technical Architecture */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🏗️ Техническая архитектура</h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="bg-white rounded-lg p-4">
              <div className="text-center mb-4">
                <div className="bg-blue-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.79 4 8 4s8-1.79 8-4V7c0-2.21-3.79-4-8-4s-8 1.79-8 4z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">Data Layer</h3>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Prisma ORM для хранения</li>
                <li>• Кэширование API ответов</li>
                <li>• Очереди для фоновой синхронизации</li>
                <li>• Webhook для real-time обновлений</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg p-4">
              <div className="text-center mb-4">
                <div className="bg-green-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">API Layer</h3>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Next.js API Routes</li>
                <li>• OAuth для авторизации</li>
                <li>• Rate limiting защита</li>
                <li>• Error handling и retry логика</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg p-4">
              <div className="text-center mb-4">
                <div className="bg-purple-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
                  </svg>
                </div>
                <h3 className="font-semibold text-gray-900">UI Layer</h3>
              </div>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• React компоненты</li>
                <li>• Drag & drop для импорта</li>
                <li>• Progress indicators</li>
                <li>• Превью и настройки</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Implementation Roadmap */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🗺️ Дорожная карта</h2>
          
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-4 mt-1">
                1
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Исследование и планирование</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Изучение API ограничений, rate limits, возможностей авторизации
                </p>
                <div className="mt-2">
                  <span className="inline-block bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                    В процессе
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-gray-300 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-4 mt-1">
                2
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Базовая интеграция</h3>
                <p className="text-gray-600 text-sm mt-1">
                  OAuth настройка, базовые операции чтения данных
                </p>
                <div className="mt-2">
                  <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                    Планируется
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-gray-300 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-4 mt-1">
                3
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Импорт и синхронизация</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Массовый импорт контента, автоматическая синхронизация
                </p>
                <div className="mt-2">
                  <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                    Планируется
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-start">
              <div className="bg-gray-300 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-semibold mr-4 mt-1">
                4
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Продвинутые возможности</h3>
                <p className="text-gray-600 text-sm mt-1">
                  Кросс-постинг, аналитика, автоматизация workflow
                </p>
                <div className="mt-2">
                  <span className="inline-block bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded">
                    Планируется
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-blue-900 mb-3">📋 Важные заметки</h2>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 mt-2"></span>
              <span><strong>Medium API</strong> имеет ограничения на чтение - нужно изучить альтернативы</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 mt-2"></span>
              <span><strong>YouTube API</strong> требует верификации приложения для доступа к данным</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 mt-2"></span>
              <span><strong>Rate Limits</strong> - нужно реализовать умное кэширование и очереди</span>
            </li>
            <li className="flex items-start">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-3 mt-2"></span>
              <span><strong>Безопасность</strong> - все API ключи должны быть защищены через environment variables</span>
            </li>
          </ul>
        </div>
      </div>
    </AuthGuard>
  );
}