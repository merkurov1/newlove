import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  title: 'Письма и открытки | Anton Merkurov',
  description: 'Архив рассылки и заказ авторских физических открыток',
});

export default function LettersPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-100 py-8 px-2">
      <div className="max-w-5xl mx-auto">
        {/* Заголовок страницы */}
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-medium text-gray-900 mb-2">📮 Письма и открытки</h1>
          <p className="text-base text-gray-600 max-w-2xl mx-auto">
            Архив авторской рассылки и заказ физических открыток с персональными сообщениями
          </p>
        </div>
        {/* Основное содержимое в две колонки */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
          {/* Левая колонка: Архив рассылки */}
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-blue-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">📧</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Архив рассылки</h2>
              </div>
              <LettersArchive />
            </div>
          </div>
          {/* Правая колонка: Заказ открыток */}
          <div className="space-y-6">
            <div className="bg-white/90 backdrop-blur-sm border border-orange-50 rounded-2xl shadow-sm hover:shadow-md p-5 transition-all duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-2xl">🎨</span>
                </div>
                <h2 className="text-lg font-medium text-gray-900">Авторские открытки</h2>
              </div>
              <PostcardShop />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}