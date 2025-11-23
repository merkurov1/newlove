'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// Инициализация Supabase (только если ключи есть)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export default function TemplePage() {
  const [isTelegram, setIsTelegram] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    // 1. Логика Телеграма (запускается с задержкой, чтобы скрипт успел прогрузиться)
    const checkTelegram = () => {
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
        const tg = (window as any).Telegram.WebApp;
        
        // Проверяем, что мы реально внутри ТГ
        if (tg.platform !== 'unknown') {
          setIsTelegram(true);
          tg.ready();
          tg.expand();
          
          // Пытаемся убрать кнопку назад и покрасить хедер
          try { tg.BackButton.hide(); } catch (e) {}
          try { tg.setHeaderColor('#000000'); } catch (e) {}
          try { tg.setBackgroundColor('#000000'); } catch (e) {}

          // === АВТОРИЗАЦИЯ ЧЕРЕЗ API ===
          const user = tg.initDataUnsafe?.user;
          if (user) {
            // Шлем данные на наш серверный API, который имеет права админа
            fetch('/api/temple/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(user)
            }).catch(err => console.error('Auth sync failed', err));
          }
        }
      }
    };

    // Проверяем сразу и через 500мс (на всякий случай)
    checkTelegram();
    const timer = setTimeout(checkTelegram, 500);

    // 2. Подписка на логи (Realtime)
    if (supabase) {
      const channel = supabase
        .channel('temple-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, (payload) => {
          setLogs((prev) => [payload.new, ...prev].slice(0, 4));
        })
        .subscribe();
        
      // Загрузить последние логи
      supabase.from('temple_log').select('*').order('created_at', { ascending: false }).limit(4)
        .then(({ data }) => { if (data) setLogs(data); });

      return () => { supabase.removeChannel(channel); };
    }

    return () => clearTimeout(timer);
  }, []);

  // Функция клика по меню
  const handleNavClick = async (label: string) => {
    if (supabase) {
      await supabase.from('temple_log').insert({ 
        event_type: 'nav', 
        message: `Кто-то вошел в ${label}` 
      });
    }
  };

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center p-4 font-sans relative overflow-hidden">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      
      {/* Глобальные стили для перекрытия основного сайта */}
      <style jsx global>{`
        header, footer, nav { display: none !important; }
        body, html { background-color: #000000 !important; overflow-x: hidden; }
      `}</style>

      <div className="mt-10 mb-6 text-center z-10">
        <h1 className="text-2xl font-light tracking-[0.3em] uppercase mb-2">Temple</h1>
        <div className="text-[10px] text-gray-500 tracking-widest">DIGITAL SANCTUARY</div>
      </div>

      {/* ЛОГИ (Тишина...) */}
      <div className="w-full max-w-xs mb-8 min-h-[80px] flex flex-col justify-end items-center gap-2 pointer-events-none z-0 opacity-60">
        {logs.length === 0 && <div className="text-xs text-gray-600 animate-pulse">...тишина...</div>}
        {logs.map((log) => (
           <div key={log.id} className="text-[11px] text-gray-400 text-center">
              {log.message}
           </div>
        ))}
      </div>

      {/* МЕНЮ */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10">
        <Link href="/vigil?mode=temple" onClick={() => handleNavClick('Vigil')} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform">
           <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_red] animate-pulse"></div>
           <div className="text-xs font-bold tracking-widest">VIGIL</div>
        </Link>

        <Link href="/heartandangel/letitgo?mode=temple" onClick={() => handleNavClick('Let It Go')} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform">
           <div className="w-2 h-2 rounded-full bg-gray-600"></div>
           <div className="text-xs font-bold tracking-widest">LET IT GO</div>
        </Link>

        <Link href="/absolution?mode=temple" onClick={() => handleNavClick('Absolution')} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform">
           <div className="w-2 h-2 rounded-full bg-gray-600"></div>
           <div className="text-xs font-bold tracking-widest">ABSOLVE</div>
        </Link>

        <Link href="/cast?mode=temple" onClick={() => handleNavClick('Cast')} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 active:scale-95 transition-transform">
           <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_red] animate-pulse"></div>
           <div className="text-xs font-bold tracking-widest">CAST</div>
        </Link>
      </div>

      {!isTelegram && (
         <div className="mt-12 text-xs text-gray-600">
             Откройте через Telegram Bot для входа
         </div>
      )}
    </div>
  );
}