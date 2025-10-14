// app/lab/youtube/page.tsx
import AuthGuard from '@/components/AuthGuard';
import YouTubeShorts from '@/components/YouTubeShorts';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'YouTube Shorts Integration | Lab',
  description: 'Интеграция с YouTube для отображения коротких видео @heartandangel',
});

export default function YouTubeLabPage() {
  return (
    <AuthGuard>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Link 
            href="/lab" 
            className="inline-flex items-center text-red-600 hover:text-red-800 transition-colors mb-4"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Вернуться в лабораторию
          </Link>
          
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            🎬 YouTube Shorts Integration
          </h1>
          <p className="text-gray-600 mt-2">
            Интеграция с YouTube для отображения коротких видео с канала @heartandangel
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-red-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900">🎯 YouTube Data API v3 готов!</h3>
              <p className="text-red-700">Автоматическое получение коротких видео через официальный API с фильтрацией по длительности.</p>
            </div>
          </div>
        </div>

        {/* Features Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">🚀 Реализованные возможности</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                YouTube Data API v3 интеграция
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                Автоматическая фильтрация Shorts (≤60 сек)
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                Миниатюры высокого качества
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                Статистика просмотров и лайков
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-red-500 rounded-full mr-3"></span>
                Кеширование на 30 минут
              </li>
            </ul>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">🔧 Технические детали</h3>
            <ul className="space-y-2 text-gray-600">
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                YouTube Data API v3 (search + videos)
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                ISO 8601 duration парсинг
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Backend кеширование данных
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                TypeScript типизация
              </li>
              <li className="flex items-center">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-3"></span>
                Адаптивная grid сетка
              </li>
            </ul>
          </div>
        </div>

        {/* Configuration Status */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <div className="flex items-start">
            <div className="bg-yellow-100 rounded-full p-2 mr-4 mt-1">
              <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">⚙️ Требуется настройка канала</h3>
              <p className="text-yellow-700 mb-3">
                Для работы интеграции нужно указать правильный ID канала @heartandangel
              </p>
              <div className="bg-white rounded-lg p-4 text-sm">
                <h4 className="font-medium text-gray-900 mb-2">Инструкция по настройке:</h4>
                <ol className="list-decimal list-inside space-y-1 text-gray-700">
                  <li>Откройте канал <a href="https://youtube.com/@heartandangel" target="_blank" className="text-blue-600 hover:underline">@heartandangel</a></li>
                  <li>Скопируйте ID канала из URL или используйте YouTube Data API</li>
                  <li>Обновите <code className="bg-gray-100 px-1 rounded">YOUTUBE_CHANNEL_ID</code> в .env.local</li>
                  <li>Перезапустите сервер разработки</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        {/* YouTube Shorts Demo */}
        <div className="bg-gray-50 rounded-xl p-8 mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">🎬 YouTube Shorts</h2>
          
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <p className="text-gray-600">
                Короткие видео с канала <strong>@heartandangel</strong> (до 60 секунд)
              </p>
              <a 
                href="https://youtube.com/@heartandangel?feature=shorts"
                target="_blank"
                rel="noopener noreferrer"
                className="text-red-600 hover:text-red-800 transition-colors text-sm flex items-center"
              >
                Открыть на YouTube
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
            
            <YouTubeShorts limit={12} />
          </div>
        </div>

        {/* API Documentation */}
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">📚 API Documentation</h2>
          <div className="prose prose-gray max-w-none">
            <h3>YouTube Data API v3 Integration</h3>
            <p>
              Интеграция использует официальный YouTube Data API v3 для получения коротких видео.
              Автоматически фильтруются только видео длительностью до 60 секунд.
            </p>
            
            <h3>API Endpoint</h3>
            <div className="bg-gray-100 rounded p-3 font-mono text-sm">
              GET /api/youtube/shorts?limit=12
            </div>
            
            <h3>Возможности</h3>
            <ol>
              <li><strong>✅ Автоматическая фильтрация</strong> — только видео ≤60 секунд</li>
              <li><strong>✅ Статистика</strong> — просмотры, лайки, дата публикации</li>
              <li><strong>✅ Миниатюры HD</strong> — высокое качество изображений</li>
              <li><strong>✅ Метаданные</strong> — заголовок, описание, канал</li>
              <li><strong>✅ Кеширование</strong> — оптимизация запросов к API</li>
            </ol>
            
            <h3>Особенности реализации</h3>
            <ul>
              <li>Парсинг ISO 8601 duration для фильтрации Shorts</li>
              <li>Получение детализированной статистики через videos API</li>
              <li>Адаптивная сетка с hover эффектами</li>
              <li>Прямые ссылки на YouTube с автоматическим открытием</li>
            </ul>
            
            <h3>Планы развития</h3>
            <ul>
              <li>Интеграция с плейлистами Shorts</li>
              <li>Автоматический cross-posting на другие платформы</li>
              <li>Аналитика популярности контента</li>
              <li>Встроенный проигрыватель</li>
            </ul>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}