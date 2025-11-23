'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TemplePage() {
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [status, setStatus] = useState("Waiting for Telegram...");
  const [isTelegram, setIsTelegram] = useState(false);

  // Функция логирования на экран
  const log = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [msg, ...prev].slice(0, 10));
  };

  useEffect(() => {
    // 1. Ручная загрузка скрипта Telegram
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    
    script.onload = () => {
      log("Script loaded. Checking window.Telegram...");
      
      const tg = (window as any).Telegram?.WebApp;
      if (tg) {
        log("Telegram WebApp object found.");
        
        // Расширяем приложение
        tg.ready();
        tg.expand();
        
        // Проверяем данные
        const user = tg.initDataUnsafe?.user;
        
        if (user) {
          setIsTelegram(true);
          setStatus(`User found: ${user.first_name} (${user.id})`);
          log(`Auth data: ${JSON.stringify(user)}`);
          
          // Отправка на сервер
          log("Sending to API...");
          fetch('/api/temple/auth', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
          })
          .then(async (res) => {
            const text = await res.text();
            log(`API Status: ${res.status}`);
            log(`API Body: ${text}`);
            if (res.ok) setStatus("Authorized & Synced ✅");
            else setStatus("API Error ❌");
          })
          .catch(err => {
            log(`Network Error: ${err.message}`);
            setStatus("Network Error ❌");
          });

        } else {
          log("No user data in initDataUnsafe.");
          setStatus("Opened outside Telegram?");
        }
      } else {
        log("window.Telegram is undefined after load.");
      }
    };

    script.onerror = () => log("Failed to load Telegram script.");
    document.head.appendChild(script);

    return () => {
      // Cleanup
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-4 relative overflow-hidden">
      
      {/* HEADER */}
      <div className="mt-8 mb-8 text-center z-10">
        <h1 className="text-3xl font-bold tracking-[0.2em] mb-1">TEMPLE</h1>
        <div className="text-xs text-green-500 tracking-widest uppercase mb-4">
           STATUS: {status}
        </div>
      </div>

      {/* MENU */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10 mx-auto">
        <Link href="/vigil?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3">
           <div className="text-xl">🕯</div>
           <div className="text-xs font-bold tracking-widest">VIGIL</div>
        </Link>

        <Link href="/heartandangel/letitgo?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3">
           <div className="text-xl">❤️</div>
           <div className="text-xs font-bold tracking-widest">LET IT GO</div>
        </Link>

        <Link href="/absolution?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3">
           <div className="text-xl">🧾</div>
           <div className="text-xs font-bold tracking-widest">ABSOLVE</div>
        </Link>

        <Link href="/cast?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3">
           <div className="text-xl">💀</div>
           <div className="text-xs font-bold tracking-widest">CAST</div>
        </Link>
      </div>

      {/* === DEBUG CONSOLE (Видна всегда) === */}
      <div className="mt-8 p-4 border border-red-900 bg-red-900/10 rounded text-[10px] text-red-300 w-full max-w-md mx-auto break-all">
        <p className="font-bold mb-2 border-b border-red-800 pb-1">DEBUG LOG (Last 10):</p>
        {debugLog.map((line, i) => (
          <div key={i} className="mb-1 font-mono">{`> ${line}`}</div>
        ))}
      </div>

      {!isTelegram && (
         <div className="mt-4 text-center text-xs text-gray-600">
             Не в Telegram? <a href="https://t.me/MerkurovLoveBot" className="underline">Открыть бота</a>
         </div>
      )}
    </div>
  );
}