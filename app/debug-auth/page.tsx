// app/debug-auth/page.tsx
'use client';


import { useSession } from 'next-auth/react';
import { AnimatePresence, motion } from 'framer-motion';

export default function DebugAuthPage() {
  const { data: session, status } = useSession();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="debug-auth-page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="max-w-4xl mx-auto px-4 py-8"
      >
        <h1 className="text-3xl font-bold mb-8">🔍 Отладка авторизации</h1>
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Статус сессии</h2>
          <div className="space-y-2">
            <div><strong>Status:</strong> {status}</div>
            <div><strong>User ID:</strong> {session?.user?.id || 'undefined'}</div>
            <div><strong>Name:</strong> {session?.user?.name || 'undefined'}</div>
            <div><strong>Email:</strong> {session?.user?.email || 'undefined'}</div>
            <div><strong>Role:</strong> {session?.user?.role || 'undefined'}</div>
            <div><strong>Image:</strong> {session?.user?.image || 'undefined'}</div>
          </div>
        </div>
        <div className="mt-6 bg-blue-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Полный объект сессии</h2>
          <pre className="text-sm overflow-auto">
            {JSON.stringify(session, null, 2)}
          </pre>
        </div>
        <div className="mt-6 bg-yellow-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Проверка EditButton</h2>
          <div className="space-y-2">
            <div><strong>Should show EditButton:</strong> {
              session?.user?.role === 'ADMIN' ? '✅ YES' : '❌ NO'
            }</div>
            <div><strong>Current role check:</strong> '{session?.user?.role}' === 'ADMIN'</div>
          </div>
        </div>
        {session?.user?.role !== 'ADMIN' && (
          <div className="mt-6 bg-red-50 p-6 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">❌ Проблема с ролью</h2>
            <p>Ваша роль не 'ADMIN'. Необходимо обновить роль в базе данных.</p>
            <p className="mt-2">Используйте Prisma Studio для изменения роли на 'ADMIN'.</p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}