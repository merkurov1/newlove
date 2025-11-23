'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Script from 'next/script';

export default function TempleWrapper() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isTemple = !!(searchParams && searchParams.get && searchParams.get('mode') === 'temple');

  useEffect(() => {
    if (!isTemple) return;

    // Логика для кнопки Назад в Телеграме
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => {
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.BackButton.show();
            tg.BackButton.onClick(() => {
                router.push('/temple');
            });
        }
    };
    document.head.appendChild(script);

    return () => {
        // При уходе со страницы
        const tg = (window as any).Telegram?.WebApp;
        if (tg) {
            tg.BackButton.hide();
            // Важно: удаляем листенер, чтобы не двоилось
            tg.BackButton.offClick(); 
        }
    };
  }, [isTemple, router]);

  if (!isTemple) return null;

  return (
    <>
      {/* Скрываем хедер сайта только в режиме Temple */}
      <style jsx global>{`
        header, footer, nav, .site-header { display: none !important; }
        /* Можно добавить черный фон, если в приложении он не черный по умолчанию */
        /* body { background: #000 !important; } */
      `}</style>
      
      {/* Кнопка "Закрыть" для веба (вместо кнопки Назад телеграма) */}
      <div 
        onClick={() => router.push('/temple')}
        style={{
            position: 'fixed', top: '20px', left: '20px', zIndex: 9999,
            width: '30px', height: '30px', background: 'rgba(0,0,0,0.5)', 
            borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'white', cursor: 'pointer', border: '1px solid #333'
        }}
      >
        ✕
      </div>
    </>
  );
}