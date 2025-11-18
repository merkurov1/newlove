"use client";
import { useState, useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import useServerEffectiveRole from '@/hooks/useServerEffectiveRole';
import ModernLoginModal from './ModernLoginModal';

const STORAGE_KEY = 'closeable_hero_closed_at_v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function CloseableHero({ className = '' }) {
  const { session } = useAuth();
  const serverRole = useServerEffectiveRole(session?.user ? session : null);

  const isAdmin = serverRole === 'ADMIN' || String(session?.user?.role || '').toUpperCase() === 'ADMIN';
  const isAuthed = !!session?.user;

  const [closed, setClosed] = useState(false);
  const storageKey = session?.user?.id ? `${STORAGE_KEY}:${session.user.id}` : STORAGE_KEY;

  useEffect(() => {
    try {
      if (!isAuthed) {
        setClosed(false);
        return;
      }
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        setClosed(false);
        return;
      }
      const ts = parseInt(raw, 10);
      if (Number.isFinite(ts) && Date.now() - ts < WEEK_MS) {
        setClosed(true);
      } else {
        setClosed(false);
      }
    } catch (e) {
      setClosed(false);
    }
  }, [isAuthed, storageKey]);

  function doClose() {
    try {
      localStorage.setItem(storageKey, String(Date.now()));
    } catch (e) {}
    setClosed(true);
  }

  function PublicHeroLogin() {
    const [modalOpen, setModalOpen] = useState(false);
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          className="px-8 py-3 bg-pink-600 text-white rounded-lg font-semibold shadow-md hover:bg-pink-700 transition-all duration-300 ease-in-out transform hover:scale-105"
        >
          Войти / Зарегистрироваться
        </button>
        {modalOpen && <ModernLoginModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  const HeroContent = () => {
    if (isAdmin) {
      return (
        <>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Панель администратора</h1>
          <p className="mt-4 text-lg text-gray-700 dark:text-gray-300 max-w-2xl mx-auto">Вы управляете контентом. Здесь быстрые ссылки на редактор.</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <a href="/admin" className="px-6 py-3 bg-pink-700 text-white rounded-lg font-semibold shadow-sm hover:bg-pink-800 transition-colors">Перейти в админку</a>
            <a href="/admin/selection" className="px-6 py-3 bg-white/50 dark:bg-white/10 border border-white/20 text-gray-800 dark:text-white rounded-lg font-semibold hover:bg-white/80 dark:hover:bg-white/20 transition-colors">Редактировать selection</a>
          </div>
        </>
      );
    }
    if (isAuthed) {
      return (
        <>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Добро пожаловать в круг близких!</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">Вам открыты все публикации, включая личные истории и творческие эксперименты. Следите за свежими материалами.</p>
        </>
      );
    }
    return (
      <>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white tracking-tight">Мир медиа, технологий и искусства</h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 max-w-2xl mx-auto">Исследуем пересечение творчества и денег в цифровую эпоху. Зарегистрируйтесь для доступа к эксклюзивным материалам.</p>
        <div className="mt-8">
          <PublicHeroLogin />
        </div>
      </>
    );
  };

  if (closed && !isAdmin) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {isAuthed && !isAdmin && (
        <button
          onClick={doClose}
          aria-label="Закрыть"
          className="absolute top-4 right-4 z-20 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white bg-white/50 dark:bg-black/20 rounded-full p-1.5 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      <section className="text-center rounded-2xl p-8 sm:p-12 bg-gradient-to-r from-white/40 to-white/10 dark:from-white/10 dark:to-white/5 border border-white/20 dark:border-white/10 backdrop-blur-md">
        <HeroContent />
      </section>
    </div>
  );
}
