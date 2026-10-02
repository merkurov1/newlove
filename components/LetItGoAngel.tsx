'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/components/AuthContext';

const ANGEL_WITH_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';
const ANGEL_WITHOUT_HEART =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0918.png';
const HEART_IMAGE =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0920.png';

export default function LetItGoAngel() {
  const { user, profile, session } = useAuth();
  const [flyingHearts, setFlyingHearts] = useState<{ id: number }[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [showWithoutHeart, setShowWithoutHeart] = useState(false);
  const [skyGradient, setSkyGradient] = useState('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');

  // Вычисляем имя автора ровно так же, как в Header.tsx
  const currentAuthorName = profile?.name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Visitor';

  const clickCountRef = useRef(clickCount);
  clickCountRef.current = clickCount;
  const authorRef = useRef(currentAuthorName);
  authorRef.current = currentAuthorName;

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = session?.access_token || null;

  const heartIdCounter = useRef(0);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) {
      setSkyGradient('bg-gradient-to-b from-[#A2D2FF] via-[#BDE0FE] to-[#FFC8DD]');
    } else if (hour >= 12 && hour < 18) {
      setSkyGradient('bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F6FF]');
    } else if (hour >= 18 && hour < 21) {
      setSkyGradient('bg-gradient-to-b from-[#FFB703] via-[#FB8500] to-[#6A0DAD]');
    } else {
      setSkyGradient('bg-gradient-to-b from-[#0B132B] via-[#1C2541] to-[#3A506B]');
    }
  }, []);

  // Отправка данных при уходе со страницы с токеном и реальным автором
  useEffect(() => {
    return () => {
      const count = clickCountRef.current;
      if (count > 0) {
        const payload = {
          event_type: 'ASH',
          message: `Released ${count}${count === 1 ? 'burden' : 'burdens'} into the digital sky.`,
          author: authorRef.current,
          token: tokenRef.current
        };

        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(payload)], { type: 'application/json'}`;
          navigator.sendBeacon('/api/temple_logs', blob);
        } else {
          fetch('/api/temple_logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true
          }).catch(() => {});
        }
      }
    };
  }, []);

  const handleClick = () => {
    if (showWithoutHeart) return;

    const newHeartId = ++heartIdCounter.current;
    setFlyingHearts((prev) => [...prev, { id: newHeartId }]);
    setClickCount((prev) => prev + 1);

    setShowWithoutHeart(true);
    setTimeout(() => {
      setShowWithoutHeart(false);
    }, 1800);

    setTimeout(() => {
      setFlyingHearts((prev) => prev.filter((h) => h.id !== newHeartId));
    }, 6000);
  };

  return (
    <main className={`relative w-full h-[100dvh] overflow-hidden ${skyGradient} flex flex-col items-center justify-end select-none animate-fade-in transition-colors duration-1000`}>
      
      {/* Верхняя панель: Кнопка посередине вверху, счетчик справа */}
      <header className="absolute top-0 left-0 w-full z-50 flex justify-between items-center p-6 sm:p-12 pointer-events-none">
        <div className="hidden sm:block w-32" /> {/* Балансирующий блок слева для центрирования */}

        <div className="pointer-events-auto">
          <Link 
            href="/heartandangel/world"
            className="flex items-center gap-2 px-6 py-2.5 rounded-full backdrop-blur-md border border-white/30 bg-white/80 text-stone-900 shadow-md transition-all text-xs font-serif tracking-wider hover:bg-white cursor-pointer"
          >
            <span>← Back to World</span>
          </Link>
        </div>

        <div className="text-stone-900 font-mono text-xs sm:text-sm tracking-[0.2em] bg-white/80 px-4 py-2 rounded-full backdrop-blur-md border border-white/30 shadow-md animate-fade-in pointer-events-auto">
          ❤️ {clickCount}
        </div>
      </header>

      <div className="absolute bottom-0 left-0 w-full h-[22vh] bg-gradient-to-t from-[#4A7c23] to-[#68a434] z-10 shadow-[inset_0_10px_20px_rgba(0,0,0,0.15)] pointer-events-none" />

      <div className="relative w-full max-w-3xl h-full flex items-end justify-center pb-[10vh] z-20">
        <div 
          className={`relative transition-transform duration-200 flex items-center justify-center p-4 w-[480px] h-[480px] max-w-[65vw] max-h-[55vh] animate-fade-in ${
            showWithoutHeart ? 'cursor-default' : 'cursor-pointer active:scale-95'
          }`}
          onClick={handleClick}
          title={showWithoutHeart ? "Wait for the angel..." : "Click to let go"}
        >
          <Image
            src={ANGEL_WITH_HEART}
            alt="Angel with heart"
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-0' : 'opacity-100'
            }`}
            priority
          />

          <Image
            src={ANGEL_WITHOUT_HEART}
            alt="Angel without heart"
            width={480}
            height={480}
            className={`absolute inset-0 w-full h-full object-contain drop-shadow-[0_15px_25px_rgba(0,0,0,0.15)] pointer-events-none transition-opacity duration-200 ${
              showWithoutHeart ? 'opacity-100' : 'opacity-0'
            }`}
            priority
          />
        </div>

        {flyingHearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute pointer-events-none z-30 animate-fly-away"
            style={{
              bottom: '24%',
              left: '50%',
              width: 450,
              height: 450,
              marginLeft: '-225px',
            }}
          >
            <Image
              src={HEART_IMAGE}
              alt="Flying Heart"
              width={450}
              height={450}
              className="object-contain filter drop-shadow-[0_0_25px_rgba(255,100,100,0.8)]"
            />
          </div>
        ))}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes flyAway {
          0% { transform: translateY(0) scale(0.3) rotate(0deg); opacity: 1; }
          15% { opacity: 1; }
          100% { transform: translateY(-80vh) scale(1.15) translateX(25px) rotate(15deg); opacity: 0; }
        }
        .animate-fade-in { animation: fadeIn 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fly-away { animation: flyAway 6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
      ` }} />
    </main>
  );
}
