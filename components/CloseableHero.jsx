"use client";
import { useState, useEffect } from 'react';
import { useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import useServerEffectiveRole from '@/hooks/useServerEffectiveRole';
import ModernLoginModal from './ModernLoginModal';

const STORAGE_KEY = 'closeable_hero_closed_at_v1';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function CloseableHero({ className = '' }) {
  const { session, isLoading } = useAuth();
  const serverRole = useServerEffectiveRole(session?.user ? session : null);

  const isAdmin = (serverRole === 'ADMIN') || (String(session?.user?.role || '').toUpperCase() === 'ADMIN');
  const isAuthed = !!session?.user;

  const [closed, setClosed] = useState(false);

  // Build a per-user storage key so closing the hero doesn't leak between users
  const storageKey = session?.user?.id ? `${STORAGE_KEY}:${session.user.id}` : STORAGE_KEY;

  useEffect(() => {
    try {
      // If there is no authenticated user, we don't persist a closed state for "anon"
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

  // Build the Hero content variants (moved from HeroHearts for consolidation)
  const PublicHero = () => (
    <>
      <h1 className="font-extrabold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(2.25rem, 6.5vw, 4rem)', marginBottom: '0.5em' }}>Добро пожаловать в мир медиа и технологий</h1>
      <p className="text-gray-700 font-medium" style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', maxWidth: '44rem', margin: '0 auto' }}>
        Исследуем пересечение искусства, любви и денег в цифровую эпоху. Зарегистрируйтесь, чтобы получить доступ к эксклюзивным материалам и закрытому сообществу.
      </p>
      <div className="mt-6">
        <PublicHeroLogin />
      </div>
    </>
  );

  function PublicHeroLogin() {
    const [modalOpen, setModalOpen] = useState(false);
    const handleOpen = () => {
      try { if (typeof window !== 'undefined') localStorage.setItem('login_redirect_path', window.location.pathname + window.location.search); } catch (e) {}
      setModalOpen(true);
    };
    return (
      <>
        <button onClick={handleOpen} className="px-6 py-3 bg-pink-600 text-white rounded-md font-semibold">Войти / Зарегистрироваться</button>
        {modalOpen && <ModernLoginModal onClose={() => setModalOpen(false)} />}
      </>
    );
  }

  const UserHero = () => (
    <>
      <h1 className="font-extrabold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(2.25rem, 6.5vw, 4rem)', marginBottom: '0.5em' }}>Добро пожаловать в круг близких!</h1>
      <p className="text-gray-700 font-medium" style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', maxWidth: '44rem', margin: '0 auto' }}>
        Вам открыты все публикации, включая личные истории и творческие эксперименты. Подпишитесь на рассылку и следите за свежими материалами.
      </p>
      <div className="mt-6 flex gap-3">
        <a href="/articles" className="px-5 py-3 bg-blue-600 text-white rounded-md font-semibold">Читать материалы</a>
        <a href="/you" className="px-4 py-2 border border-gray-200 rounded-md">Мой профиль</a>
      </div>
    </>
  );

  const AdminHero = () => (
    <>
      <h1 className="font-extrabold text-pink-900 tracking-tight" style={{ fontSize: 'clamp(2.25rem, 6.5vw, 4rem)', marginBottom: '0.5em' }}>Панель администратора</h1>
      <p className="text-pink-800 font-medium" style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', maxWidth: '44rem', margin: '0 auto' }}>
        Вы управляете контентом и доступами. Здесь показываются служебные уведомления и быстрые ссылки на редактор.
      </p>
      <div className="mt-6 flex gap-3">
        <a href="/admin" className="px-5 py-3 bg-pink-700 text-white rounded-md font-semibold">Перейти в админку</a>
        <a href="/admin/articles" className="px-4 py-2 border border-pink-200 rounded-md">Редактировать статьи</a>
      </div>
    </>
  );

  let Variant = PublicHero;
  if (isAdmin) Variant = AdminHero;
  else if (isAuthed) Variant = UserHero;

  // Admins always see the hero regardless of close state
  if (isAdmin) {
    return (
      <div className={className}>
        <section
          className={`w-full flex flex-col items-center justify-center overflow-hidden text-center`}
          style={{
            padding: 0,
            margin: 0,
            borderRadius: 0,
            boxShadow: 'none',
            background: 'linear-gradient(120deg, #fff5f8 0%, #fdebf2 100%)',
            maxWidth: '100vw',
            overflowX: 'hidden',
          }}
        >
          <div className="w-full flex flex-col items-center justify-center select-none" style={{ maxWidth: '100vw', padding: '64px 0 48px 0' }}>
            <Variant />
          </div>
        </section>
      </div>
    );
  }

  // Unauthenticated always see the hero
  if (!isAuthed) {
    return (
      <div className={className}>
        <section
          className={`w-full flex flex-col items-center justify-center overflow-hidden text-center`}
          style={{
            padding: 0,
            margin: 0,
            borderRadius: 0,
            boxShadow: 'none',
            background: 'linear-gradient(120deg, #f8f6f2 0%, #f3e9f7 100%)',
            maxWidth: '100vw',
            overflowX: 'hidden',
          }}
        >
          <div className="w-full flex flex-col items-center justify-center select-none" style={{ maxWidth: '100vw', padding: '64px 0 48px 0' }}>
            <Variant />
          </div>
        </section>
      </div>
    );
  }

  // Authed non-admin: show hero unless closed within WEEK_MS
  if (closed) return null;

  return (
    <div className={`relative ${className}`}>
      <div className="absolute top-3 right-3 z-20">
        <button onClick={doClose} aria-label="Закрыть" className="text-gray-500 hover:text-gray-800 bg-white/60 rounded-full p-1">
          ✕
        </button>
      </div>
      <section
        className={`w-full flex flex-col items-center justify-center overflow-hidden text-center`}
        style={{
          padding: 0,
          margin: 0,
          borderRadius: 0,
          boxShadow: 'none',
          background: 'linear-gradient(120deg, #f8f6f2 0%, #f3e9f7 100%)',
          maxWidth: '100vw',
          overflowX: 'hidden',
        }}
      >
        <div className="w-full flex flex-col items-center justify-center select-none" style={{ maxWidth: '100vw', padding: '64px 0 48px 0' }}>
          <Variant />
        </div>
      </section>
    </div>
  );
}
