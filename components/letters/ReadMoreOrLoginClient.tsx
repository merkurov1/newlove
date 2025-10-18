'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter, usePathname } from 'next/navigation';
import ModernLoginModal from '@/components/ModernLoginModal';
import type { FC } from 'react';

const ReadMoreOrLoginClient: FC = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleOpen = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('login_redirect_path', window.location.pathname + window.location.search);
      try {
        window.dispatchEvent(new Event('newlove:close-mobile-menu'));
      } catch (e) {}
    }
    setModalOpen(true);
  };

  const handleClose = async () => {
    setModalOpen(false);
    // После закрытия модалки проверяем, залогинен ли пользователь
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      // Проверяем, что pathname не null и содержит /letters/
      if (pathname && pathname.includes('/letters/')) {
        const slug = pathname.split('/letters/')[1]?.split('/')[0] || '';
        if (slug) {
          // Редирект на полную версию
          router.push(`/letters/${slug}/full`);
        } else {
          // Если slug отсутствует, редирект на архив
          router.push('/letters');
        }
      } else {
        // Если pathname null или не содержит /letters/, редирект на архив
        router.push('/letters');
      }
    }
  };

  return (
    <>
      <div className="text-center">
        <div className="inline-block bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-200">
          <div className="mb-4">
            <svg
              className="w-16 h-16 mx-auto text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            Продолжение доступно только для участников
          </h3>
          
          <p className="text-gray-600 mb-6 max-w-md">
            Чтобы прочитать письмо полностью и оставлять комментарии, 
            войдите в свой аккаунт
          </p>
          
          <button
            onClick={handleOpen}
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Войти
          </button>
        </div>
      </div>
      
      {modalOpen && <ModernLoginModal onClose={handleClose} />}
    </>
  );
};

export default ReadMoreOrLoginClient;