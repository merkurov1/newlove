// app/lab/feed/page.tsx
import AuthGuard from '@/components/AuthGuard';
import FlowFeed from '@/components/FlowFeed';
import Link from 'next/link';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Flow | Сводная лента',
  description: 'Единая хронологическая лента из всех подключенных платформ - Bluesky, Medium, YouTube',
});

export const dynamic = 'force-dynamic';

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
            🌊 Flow
          </h1>
          <p className="text-gray-600 mt-2">
            Единая хронологическая лента из всех подключенных платформ.
            Здесь собраны последние публикации с Bluesky, статьи из Medium и YouTube Shorts.
          </p>
        </div>

        {/* Status Banner */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
          <div className="flex items-center">
            <div className="bg-green-100 rounded-full p-2 mr-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-green-900">Готово</h3>
              <p className="text-green-700">Сводная лента успешно интегрирована и работает</p>
            </div>
          </div>
        </div>

        {/* Flow Feed */}
        <FlowFeed limit={20} />
      </div>
    </AuthGuard>
  );
}