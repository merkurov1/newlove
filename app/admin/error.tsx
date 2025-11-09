'use client'

import { useEffect } from 'react'

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log error to console in development
    if (process.env.NODE_ENV !== 'production') {
      console.error('Admin panel error:', error)
    }
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
            <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
            Ошибка в админ-панели
          </h2>
          <p className="text-gray-600 mb-6 text-center text-sm">
            Произошла ошибка при выполнении операции. Проверьте права доступа и попробуйте снова.
          </p>
          
          <div className="space-y-2">
            <button
              onClick={reset}
              className="w-full px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors text-sm font-medium"
            >
              Попробовать снова
            </button>
            <a
              href="/admin"
              className="block w-full px-4 py-2 bg-gray-100 text-gray-900 rounded hover:bg-gray-200 transition-colors text-sm font-medium text-center"
            >
              Вернуться в админ-панель
            </a>
          </div>

          {error.digest && (
            <p className="mt-4 text-xs text-gray-400 text-center">
              Error ID: {error.digest}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
