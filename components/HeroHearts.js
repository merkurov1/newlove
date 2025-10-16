"use client";
import { useState } from 'react';
import { useAuth } from '@/components/AuthContext';
import useServerEffectiveRole from '@/hooks/useServerEffectiveRole';
import ModernLoginModal from './ModernLoginModal';

export default function HeroHearts({ className = "", style }) {
  const { session, isLoading } = useAuth();
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const serverRole = useServerEffectiveRole(session?.user ? session : null);

  const isAdmin = (serverRole === 'ADMIN') || (session?.user?.role === 'ADMIN');
  const isAuthed = !!session?.user;

  // Variants
  const PublicHero = () => (
    <>
      <h1 className="font-extrabold text-gray-900 tracking-tight" style={{ fontSize: 'clamp(2.25rem, 6.5vw, 4rem)', marginBottom: '0.5em' }}>Добро пожаловать в мир медиа и технологий</h1>
      <p className="text-gray-700 font-medium" style={{ fontSize: 'clamp(1rem, 2.2vw, 1.25rem)', maxWidth: '44rem', margin: '0 auto' }}>
        Исследуем пересечение искусства, любви и денег в цифровую эпоху. Зарегистрируйтесь, чтобы получить доступ к эксклюзивным материалам и закрытому сообществу.
      </p>
      <div className="mt-6">
        {/* Use the same modal as the header LoginButton for consistent UX */}
        {/* eslint-disable-next-line react-hooks/rules-of-hooks */}
        <PublicHeroLogin />
      </div>
    </>
  );

  // Small client component to host modal state for the PublicHero login button
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

  return (
    <section
      className={`w-full flex flex-col items-center justify-center overflow-hidden text-center ${className}`}
      style={{
        ...style,
        padding: 0,
        margin: 0,
        borderRadius: 0,
        boxShadow: 'none',
        background: isAdmin ? 'linear-gradient(120deg, #fff5f8 0%, #fdebf2 100%)' : 'linear-gradient(120deg, #f8f6f2 0%, #f3e9f7 100%)',
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}>
      <div className="w-full flex flex-col items-center justify-center select-none" style={{ maxWidth: '100vw', padding: '64px 0 48px 0' }}>
        <Variant />
      </div>
    </section>
  );
}
