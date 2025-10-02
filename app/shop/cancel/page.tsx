import Link from 'next/link';

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto pt-24 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          {/* Cancel Icon */}
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Оплата отменена
          </h1>
          
          <p className="text-gray-600 mb-8">
            Платёж был отменён или не завершён. Вы можете попробовать снова или выбрать другой товар.
          </p>

          <div className="space-y-3">
            <Link
              href="/shop"
              className="block w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors"
            >
              Вернуться в магазин
            </Link>
            
            <Link
              href="/"
              className="block w-full bg-gray-100 text-gray-700 font-semibold py-3 px-6 rounded-xl hover:bg-gray-200 transition-colors"
            >
              На главную
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
