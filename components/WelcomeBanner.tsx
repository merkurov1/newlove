"use client";

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';

export default function WelcomeBanner({ variant = 'public', forceShow = false, onClose }: { variant?: string; forceShow?: boolean; onClose?: () => void }) {
  const { user, profile, session, isLoading } = useAuth();

  if (isLoading && !forceShow) return null;

  // Безопасно извлекаем username из профиля БД или метаданных
  const username = profile?.username || user?.user_metadata?.username || (user as any)?.username || null;
  const profileHref = username ? `/you/${username}` : '/profile';

  return (
    <div className="bg-gradient-to-r from-neutral-900 to-neutral-800 text-white p-6 rounded-2xl shadow-xl relative my-6">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Добро пожаловать в Digital Temple</h2>
        <p className="text-neutral-300 text-sm leading-relaxed mb-4">
          Пространство, объединяющее медиа, технологии и искусство. Управляйте своей сессией и профилем в единой архитектуре.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link 
            href={profileHref}
            className="bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-rose-700 transition-colors text-center"
          >
            Мой профиль
          </Link>
          {onClose && (
            <button
              onClick={onClose}
              className="bg-neutral-800 text-neutral-300 px-4 py-3 rounded-lg hover:bg-neutral-700 transition-colors text-sm"
            >
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
