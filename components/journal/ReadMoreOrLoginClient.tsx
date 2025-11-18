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
      localStorage.setItem(
        'login_redirect_path',
        window.location.pathname + window.location.search
      );
      try {
        window.dispatchEvent(new Event('newlove:close-mobile-menu'));
      } catch (e) {}
    }
    setModalOpen(true);
  };
  const handleClose = async () => {
    setModalOpen(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      if (pathname && pathname.includes('/journal/')) {
        const slug = pathname.split('/journal/')[1]?.split('/')[0] || '';
        if (slug) {
          router.push(`/journal/${slug}/full`);
        } else {
          router.push('/journal');
        }
      } else {
        router.push('/journal');
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
            Continuation available to members only
          </h3>
          <p className="text-gray-600 mb-6 max-w-md">
            To read the full letter and leave comments, please log in to your account
          </p>
          <button
            onClick={handleOpen}
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Log in
          </button>
        </div>
      </div>
      {modalOpen && <ModernLoginModal onClose={handleClose} />}
    </>
  );
};

export default ReadMoreOrLoginClient;
