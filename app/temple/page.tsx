'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';

export default function TemplePage() {
  const [debugLog, setDebugLog] = useState<string[]>([]);
  const [status, setStatus] = useState("Waiting for Telegram...");
  const [isTelegram, setIsTelegram] = useState(false);

  const log = (msg: string) => {
    console.log(msg);
    setDebugLog(prev => [msg, ...prev].slice(0, 8));
  };

  // Проверка Телеграма
  const checkTelegram = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      setIsTelegram(true);
      setStatus("TG Connected ✅");
      
      tg.ready();
      tg.expand();
      try { tg.BackButton.hide(); } catch (e) {}
      // Красим системные бары телеграма в черный
      try { tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000'); } catch (e) {}
      
      const user = tg.initDataUnsafe?.user;
      if (user) {
         log(`User: ${user.first_name} (${user.id})`);
         // Пытаемся записать юзера через API
         fetch('/api/temple/auth', {
            method: 'POST',
            body: JSON.stringify(user)
         }).then(r => log(`Auth API: ${r.status}`)).catch(e => log(`Auth API Error: ${e}`));
      } else {
         log("Anon user (Browser?)");
      }
    }
  };

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-4 relative overflow-hidden">
      
      <Script 
        src="https://telegram.org/js/telegram-web-app.js" 
        strategy="beforeInteractive"
        onLoad={() => {
            log("Script Loaded");
            checkTelegram();
        }}
        onError={(e) => log("Script Blocked by CSP!")}
      />

      {/* === ЯДЕРНЫЙ CSS ДЛЯ СКРЫТИЯ ХЕДЕРА === */}
      <style jsx global>{`
        /* Скрываем любой тег header, footer, nav */
        header, footer, nav {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
        }
        /* На всякий случай по классам, если они используются */
        .site-header, .site-footer, [class*="Header"], [class*="Footer"] {
            display: none !important;
        }
        /* Принудительный черный фон */
        html, body { 
            background-color: #000000 !important; 
            overflow-x: hidden;
            min-height: 100vh;
        }
      `}</style>
      
      {/* ЛОГОТИП ХРАМА */}
      <div className="mt-8 mb-8 text-center z-10">
        <h1 className="text-3xl font-bold tracking-[0.2em] mb-1 text-white">TEMPLE</h1>
        <div className="text-[10px] text-green-500 tracking-widest uppercase mb-4">
           {status}
        </div>
      </div>

      {/* МЕНЮ */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10 mx-auto">
        <Link href="/vigil?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-white no-underline">
           <div className="text-xl">🕯</div>
           <div className="text-xs font-bold tracking-widest">VIGIL</div>
        </Link>

        <Link href="/heartandangel/letitgo?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-white no-underline">
           <div className="text-xl">❤️</div>
           <div className="text-xs font-bold tracking-widest">LET IT GO</div>
        </Link>

        <Link href="/absolution?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-white no-underline">
           <div className="text-xl">🧾</div>
           <div className="text-xs font-bold tracking-widest">ABSOLVE</div>
        </Link>

        <Link href="/cast?mode=temple" className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col items-center justify-center gap-3 text-white no-underline">
           <div className="text-xl">💀</div>
           <div className="text-xs font-bold tracking-widest">CAST</div>
        </Link>
      </div>

      {/* DEBUG LOG */}
      <div className="mt-8 p-4 border border-red-900 bg-red-900/10 rounded text-[10px] text-red-300 w-full max-w-md mx-auto break-all">
        <p className="font-bold mb-2 border-b border-red-800 pb-1">DEBUG:</p>
        {debugLog.map((line, i) => (
          <div key={i} className="mb-1 font-mono">{`> ${line}`}</div>
        ))}
      </div>

      {!isTelegram && (
         <div className="mt-4 text-center text-xs text-gray-600">
             Not in Telegram? <a href="https://t.me/MerkurovLoveBot" className="underline">Open Bot</a>
         </div>
      )}
    </div>
  );
}