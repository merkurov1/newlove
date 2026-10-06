"use client";
import { Role } from '@/types/next-auth.d';
import { getRoleEmoji, getRoleName, getRoleDescription } from '@/lib/roles';
import { AnimatePresence, motion } from 'framer-motion';

const allRoles = Object.values(Role);

export default function RolesDemo() {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="roles-demo-page"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -30 }}
        transition={{ duration: 0.6, ease: 'easeInOut' }}
        className="min-h-screen bg-gray-50 p-8"
      >
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            🎭 Система ролей пользователей
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allRoles.map((role) => (
              <div 
                key={role}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">
                    {getRoleEmoji(role) || '👤'}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {getRoleName(role)}
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {getRoleDescription(role)}
                  </p>
                  <div className="bg-gray-100 rounded-lg p-3 text-sm font-mono text-gray-700">
                    {role}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-12 bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              📝 Описание системы ролей
            </h2>
            <div className="space-y-3 text-gray-700">
              <p>
                <strong>👤 USER:</strong> Базовая роль для всех зарегистрированных пользователей
              </p>
              <p>
                <strong>❤️ SUBSCRIBER:</strong> Пользователи, поддерживающие проект подпиской
              </p>
              <p>
                <strong>💖 PATRON:</strong> Постоянные спонсоры с дополнительными привилегиями
              </p>
              <p>
                <strong>💝 PREMIUM:</strong> VIP пользователи с эксклюзивным доступом
              </p>
              <p>
                <strong>❤️‍🔥 SPONSOR:</strong> Главные спонсоры проекта с максимальными привилегиями
              </p>
              <p>
                <strong>👑 ADMIN:</strong> Администраторы с полным доступом к управлению
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
