"use client";
import AuthGuard from '@/components/AuthGuard';
import LettersArchive from '@/components/letters/LettersArchive';
import PostcardShop from '@/components/letters/PostcardShop';
import { AnimatePresence, motion } from 'framer-motion';

export const metadata = {
  title: 'Письма и открытки | Anton Merkurov',
  description: 'Архив рассылки и заказ авторских физических открыток',
};

export default function LettersPage() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="letters-page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
      >
        <AuthGuard>
          <div className="min-h-screen bg-gray-50">
            <div className="container mx-auto px-4 py-8">
              {/* Заголовок страницы */}
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-gray-900 mb-4">
                  📮 Письма и открытки
                </h1>
                <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                  Архив авторской рассылки и заказ физических открыток с персональными сообщениями
                </p>
              </div>

              {/* Основное содержимое в две колонки */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
                {/* Левая колонка: Архив рассылки */}
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">📧</span>
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
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                        <span className="text-2xl">🎨</span>
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
      </motion.div>
    </AnimatePresence>
  );
}