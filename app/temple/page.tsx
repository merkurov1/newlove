'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';

export default function TemplePage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState("Waiting...");
  const [isTelegram, setIsTelegram] = useState(false);
  const [userId, setUserId] = useState<string | number>('?');

  // Функция для записи логов на экран
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString().split(' ')[0];
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 15));
    console.log(`[Temple] ${msg}`);
  };

  useEffect(() => {
    addLog("Starting manual initialization...");

    // 1. Создаем тег скрипта вручную
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;

    // 2. Обработчик успешной загрузки
    script.onload = () => {
      addLog("Script loaded event fired.");
      
      // Начинаем искать объект Telegram (иногда он появляется с задержкой)
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const tg = (window as any).Telegram?.WebApp;
        
        if (tg) {
          clearInterval(interval);
          addLog("Telegram WebApp object found!");
          setIsTelegram(true);
          setStatus("CONNECTED");
          
          // Инициализация
          try {
              tg.ready();
              tg.expand();
              addLog(`Platform: ${tg.platform}, ColorScheme: ${tg.colorScheme}`);
              
              // Прячем кнопку назад
              if (tg.BackButton) tg.BackButton.hide();
              
              // Красим хедер
              if (tg.setHeaderColor) tg.setHeaderColor('#000000');
              if (tg.setBackgroundColor) tg.setBackgroundColor('#000000');
          } catch (e: any) {
              addLog(`UI Setup Error: ${e.message}`);
          }

          // Данные юзера
          const user = tg.initDataUnsafe?.user;
          if (user) {
            setUserId(user.id);
            addLog(`User: ${user.username || user.first_name} (${user.id})`);
            
            // Отправка на сервер
            addLog("Sending auth request...");
            fetch('/api/temple/auth', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(user)
            })
            .then(async res => {
                const text = await res.text();
                addLog(`API [${res.status}]: ${text.slice(0, 30)}`);
            })
            .catch(err => addLog(`API Error: ${err.message}`));
          } else {
            addLog("No user data in initDataUnsafe (Browser?)");
          }
          
        } else if (attempts > 20) { // 2 секунды
          clearInterval(interval);
          addLog("Timeout: window.Telegram not found after script load");
        }
      }, 100);
    };

    // 3. Обработчик ошибки загрузки (CSP или Сеть)
    script.onerror = () => {
      addLog("CRITICAL: Failed to load Telegram script. Checked CSP?");
      setStatus("SCRIPT BLOCKED");
    };

    // Добавляем в head
    document.head.appendChild(script);

    return () => {
      // Чистим за собой
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col p-4 relative">
      
      {/* ЯДЕРНЫЙ CSS: Скрываем все лишнее и делаем оверлей */}
      <style jsx global>{`
        /* Скрываем хедеры и футеры по тегам и популярным классам */
        header, footer, nav, .header, .footer, #header, #footer {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            height: 0 !important;
            pointer-events: none !important;
        }
        /* Принудительный черный фон */
        html, body {
            background-color: #000000 !important;
            overflow-x: hidden;
        }
      `}</style>

      {/* Оверлей на случай, если CSS выше не сработал, этот div перекроет всё */}
      <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'black',
          zIndex: -1 
      }}></div>

      {/* HEADER */}
      <div className="mt-6 mb-6 text-center z-10">
        <h1 className="text-3xl font-bold tracking-[0.2em] mb-1 text-white">TEMPLE</h1>
        <div className="text-[10px] font-bold tracking-widest uppercase mb-4" style={{ color: status === 'CONNECTED' ? '#0f0' : '#f00' }}>
           STATUS: {status}
        </div>
      </div>

      {/* DEBUG CONSOLE (Самое важное сейчас) */}
      <div className="w-full max-w-md mx-auto mb-6 p-3 border border-zinc-800 bg-zinc-900/50 rounded text-[10px] font-mono text-green-400 overflow-hidden break-all">
        <div className="border-b border-zinc-700 pb-1 mb-2 flex justify-between">
            <span>DEBUG LOG</span>
            <span>UID: {userId}</span>
        </div>
        <div className="flex flex-col gap-1">
            {logs.length === 0 && <span className="text-gray-500">Waiting for logs...</span>}
            {logs.map((line, i) => (
                <div key={i}>{line}</div>
            ))}
        </div>
      </div>

      {/* MENU */}
      <div className="grid grid-cols-2 gap-4 w-full max-w-sm z-10 mx-auto pb-10">
        <Link href="/vigil?mode=temple" className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-white no-underline active:opacity-50">
           <span className="text-xl">🕯</span>
           <span className="text-xs font-bold tracking-widest">VIGIL</span>
        </Link>

        <Link href="/heartandangel/letitgo?mode=temple" className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-white no-underline active:opacity-50">
           <span className="text-xl">❤️</span>
           <span className="text-xs font-bold tracking-widest">LET IT GO</span>
        </Link>

        <Link href="/absolution?mode=temple" className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-white no-underline active:opacity-50">
           <span className="text-xl">🧾</span>
           <span className="text-xs font-bold tracking-widest">ABSOLVE</span>
        </Link>

        <Link href="/cast?mode=temple" className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex flex-col items-center justify-center gap-2 text-white no-underline active:opacity-50">
           <span className="text-xl">💀</span>
           <span className="text-xs font-bold tracking-widest">CAST</span>
        </Link>
      </div>
    </div>
  );
}