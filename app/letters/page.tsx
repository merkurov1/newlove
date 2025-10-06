import AuthGuard from '@/components/AuthGuard';
import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';

export const metadata = {
  title: 'Письма и открытки | Anton Merkurov',
  description: 'Архив рассылки и заказ авторских физических открыток',
};

export default function LettersPage() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-pink-100 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          {/* Заголовок страницы */}
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl font-extrabold bg-gradient-to-r from-blue-600 via-purple-500 to-pink-400 bg-clip-text text-transparent mb-4">
              📮 Письма и открытки
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Архив авторской рассылки и заказ физических открыток с персональными сообщениями
            </p>
          </div>

          {/* Основное содержимое в две колонки */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
            {/* Левая колонка: Архив рассылки */}
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.01] transition-all duration-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-3xl">📧</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Архив рассылки</h2>
                    <p className="text-gray-600">Все выпуски личных писем</p>
                  </div>
                </div>
                <LettersArchive />
              </div>
            </div>
            {/* Правая колонка: Заказ открыток */}
            <div className="space-y-6">
              <div className="bg-white/80 backdrop-blur rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-2xl hover:-translate-y-1 hover:scale-[1.01] transition-all duration-200">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                    <span className="text-3xl">🎨</span>
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">Авторские открытки</h2>
                    <p className="text-gray-600">Физические открытки с доставкой</p>
                  </div>
                </div>
                <PostcardShop />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}