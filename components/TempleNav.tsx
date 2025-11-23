'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function TempleNav() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Проверяем, есть ли ?mode=temple в ссылке
  const isTempleMode = !!searchParams && searchParams.get('mode') === 'temple';

  useEffect(() => {
    if (isTempleMode && typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      
      try { tg.BackButton?.show?.(); } catch (e) {}
      try { tg.BackButton?.onClick?.(() => { router.push('/temple'); }); } catch (e) {}

      // При выходе (размонтировании) скрываем стрелку, чтобы не мешала на других страницах
      return () => {
        try { tg.BackButton?.hide?.(); } catch (e) {}
        try { tg.BackButton?.offClick?.(); } catch (e) {}
      };
    }
  }, [isTempleMode, router]);

  // Если мы не в режиме храма — ничего не делаем, компонент-призрак
  if (!isTempleMode) return null;

  return (
    <>
      {/* Кнопка "Закрыть" для обычного браузера (поверх всего) */}
      <div 
        onClick={() => router.push('/temple')}
        style={{
            position: 'fixed', 
            top: '20px', 
            left: '20px', 
            zIndex: 999999,
            width: '40px', 
            height: '40px',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)',
            borderRadius: '50%',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'white',
            fontSize: '20px',
            lineHeight: '0'
        }}
      >
        ✕
      </div>

      {/* Глобальный стиль: Скрываем шапку и подвал сайта ТОЛЬКО в этом режиме */}
      <style jsx global>{`
        body > header, body > footer, body > nav,
        .nextjs-portal, [class*="Header"], [class*="Footer"] {
            display: none !important;
        }
        /* Гарантируем черный фон */
        body { background-color: #000 !important; }
      `}</style>
    </>
  );
}