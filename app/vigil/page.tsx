'use client';


import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { logTempleEvent } from '@/lib/templeLogger'; // Укажите ваш путь к логгеру, например '@/utils/templeLogger' или '@/lib/templeLogger'
import TempleTopBar from '@/components/TempleTopBar';

export default function VigilPage() {
  const [activeGuards, setActiveGuards] = useState(12);
  const [hasSparked, setHasSparked] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [userName, setUserName] = useState('Pilgrim');

  useEffect(() => {
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const telegramName = tgUser?.username || tgUser?.first_name;
    if (telegramName) localStorage.setItem('temple_user', telegramName);
    // Получаем имя из localStorage или оставляем Pilgrim
    const savedName = localStorage.getItem('temple_user');
    if (savedName) {
      setUserName(savedName);
    }

    // Проверяем кулдаун 24 часа (храним в localStorage)
    const lastSpark = localStorage.getItem('last_vigil_spark');
    if (lastSpark) {
      const hoursPassed = (Date.now() - parseInt(lastSpark, 10)) / (1000 * 60 * 60);
      if (hoursPassed < 24) {
        setHasSparked(true);
      }
    }
  }, []);

  const handleSpark = async () => {
    if (hasSparked || isAnimating) return;

    setIsAnimating(true);
    setHasSparked(true);
    localStorage.setItem('last_vigil_spark', Date.now().toString());

    // Логируем событие в едином стандарте Храма
    await logTempleEvent({
      event_type: 'VIGIL',
        message: `${userName} sent a spark into the Vigil room`,
      author: userName,
      metadata: {
        action: 'spark_sent',
        client_time: new Date().toISOString()
      }
    });

    setActiveGuards(prev => prev + 1);

    setTimeout(() => {
      setIsAnimating(false);
    }, 2000);
  };

  return (
    <div className="min-h-screen bg-[#141210] text-[#ffd700] flex flex-col items-center justify-center px-4 pt-36 sm:pt-44 pb-20 relative overflow-hidden">
      <div className="noise-overlay absolute inset-0 pointer-events-none opacity-40" />
      <TempleTopBar />

      <div className="max-w-xl w-full text-center z-10 space-y-8">
        <h1 className="text-3xl sm:text-4xl font-serif tracking-widest uppercase">Vigil</h1>
        <p className="text-sm sm:text-base text-neutral-400 font-sans tracking-wide">
          Keep the light alive. Send a spark and join the living chain of guardians.
        </p>

        <div className="p-8 border border-[#ffd700]/20 rounded-2xl bg-black/40 backdrop-blur-md relative">
          <div className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Active guardians</div>
          <div className="text-5xl font-serif font-bold text-[#ffd700] mb-6">{activeGuards}</div>

          <button
            onClick={handleSpark}
            disabled={hasSparked || isAnimating}
            className={`px-8 py-4 rounded-xl font-serif tracking-wider uppercase transition-all duration-300 border ${
              hasSparked
                ? 'bg-neutral-900 border-neutral-700 text-neutral-500 cursor-not-allowed'
                : 'bg-[#ffd700]/10 border-[#ffd700]/40 text-[#ffd700] hover:bg-[#ffd700]/20 hover:border-[#ffd700]'
            }`}
          >
            {hasSparked ? 'Spark sent (24-hour cooldown)' : isAnimating ? 'Sending...' : 'Send a spark'}
          </button>
        </div>
      </div>
    </div>
  );
}
