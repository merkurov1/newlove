'use client';

import { useEffect, useState, useCallback } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// === Вставляем ключи (безопасно для публичного клиента) ===
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export default function LoveTemple() {
  const [isTelegram, setIsTelegram] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false); // Чтобы не мигало

  // Эта функция запускается, когда скрипт Телеграма точно загружен
  const initTelegram = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      
      // Если есть initData — мы точно в телеграме
      if (tg.initData || tg.platform !== 'unknown') {
        setIsTelegram(true);
        tg.ready();
        tg.expand();
        
        // Убираем кнопку назад в главном меню
        try { tg.BackButton?.hide(); } catch (e) {}
        
        // Красим шапку
        try {
            tg.setHeaderColor?.('#000000');
            tg.setBackgroundColor?.('#000000');
        } catch (e) {}

        // Регистрируем вход
        const user = tg.initDataUnsafe?.user;
        if (user && supabase) {
            // Пишем в базу "в тупую", без проверок авторизации
            supabase.from('temple_users').upsert({
                telegram_id: user.id,
                username: user.username || '',
                first_name: user.first_name || 'Anon',
                last_seen_at: new Date().toISOString()
            }, { onConflict: 'telegram_id' })
            .then(({ error }) => {
                if (error) console.error("Ошибка записи юзера:", error);
                else console.log("Юзер записан");
            });
        }
      }
    }
    setIsLoaded(true);
  }, []);

  // Запасной вариант: если onLoad не сработал, пробуем через таймер
  useEffect(() => {
    const timer = setTimeout(() => {
        if (!isTelegram) initTelegram();
    }, 500);
    return () => clearTimeout(timer);
  }, [initTelegram, isTelegram]);

  // Realtime логи
  useEffect(() => {
    if (supabase) {
      fetchRecentLogs();
      const channel = supabase
        .channel('temple-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, (payload: any) => {
            setLogs((prev) => [payload.new, ...prev].slice(0, 5));
        })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, []);

  const fetchRecentLogs = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('temple_log').select('*').order('created_at', { ascending: false }).limit(3);
    if (data) setLogs(data);
  };

  const sendSignal = async (type: string, message: string) => {
    if (!supabase) return;
    await supabase.from('temple_log').insert({ event_type: type, message: message });
  };

  return (
    <>
      {/* Скрипт с onLoad для быстрой инициализации */}
      <Script 
        src="https://telegram.org/js/telegram-web-app.js" 
        strategy="afterInteractive" 
        onLoad={initTelegram}
      />

      <main className="temple-overlay">
        
        <header className="temple-header">
          <h1>LOVE TEMPLE</h1>
          <div className="subtitle">DIGITAL SANCTUARY</div>
        </header>

        {/* ЛЕТОПИСЬ (Логи) */}
        <div className="chronicle-container">
            {logs.map((log) => (
                <div key={log.id} className="log-item fade-in">
                    <span className="log-icon">
                        {log.event_type === 'vigil' && '🕯️'}
                        {log.event_type === 'letitgo' && '❤️‍🔥'}
                        {log.event_type === 'absolution' && '🕊️'}
                        {log.event_type === 'cast' && '📡'}
                    </span>
                    {log.message}
                </div>
            ))}
            {logs.length === 0 && <div className="log-item" style={{opacity: 0.3}}>...тишина...</div>}
        </div>

        {/* МЕНЮ */}
        <div className="grid">
          {/* Добавляем ?mode=temple ко всем ссылкам */}
          
          <Link href="/vigil?mode=temple" className="card" onClick={() => sendSignal('vigil', 'Бдение')}>
            <div className="status-dot active"></div>
            <div><h2>VIGIL</h2><p>Бдение</p></div>
          </Link>

          <Link href="/heartandangel/letitgo?mode=temple" className="card" onClick={() => sendSignal('letitgo', 'Отпускание')}>
            <div className="status-dot"></div>
            <div><h2>LET IT GO</h2><p>Отпусти</p></div>
          </Link>

          <Link href="/absolution?mode=temple" className="card" onClick={() => sendSignal('absolution', 'Искупление')}>
            <div className="status-dot"></div>
            <div><h2>ABSOLUTION</h2><p>Искупление</p></div>
          </Link>

          <Link href="/cast?mode=temple" className="card" onClick={() => sendSignal('cast', 'Голос')}>
            <div className="status-dot active"></div>
            <div><h2>CAST</h2><p>Голос</p></div>
          </Link>
        </div>

        {/* Кнопка показывается ТОЛЬКО если мы точно не в телеграме и страница загрузилась */}
        {isLoaded && !isTelegram && (
          <div className="web-footer">
            <a href="https://t.me/MerkurovLoveBot" className="tg-button">Telegram Login</a>
          </div>
        )}
      </main>

      <style jsx>{`
        /* Перекрываем весь сайт */
        .temple-overlay {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background-color: #000; color: #fff; z-index: 99999;
            overflow-y: auto; display: flex; flex-direction: column; align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding-bottom: 20px;
        }

        .temple-header { margin-top: 40px; margin-bottom: 20px; text-align: center; }
        h1 { font-weight: 300; letter-spacing: 4px; font-size: 24px; margin: 0; text-transform: uppercase; color: white; }
        .subtitle { font-size: 12px; color: #666; margin-top: 5px; letter-spacing: 1px; }

        .chronicle-container {
            width: 90%; max-width: 400px; height: 80px; margin-bottom: 20px;
            display: flex; flex-direction: column; justify-content: flex-end; align-items: center;
            overflow: hidden; mask-image: linear-gradient(to top, black 50%, transparent 100%);
        }
        .log-item { font-size: 12px; color: #888; margin-bottom: 4px; display: flex; gap: 6px; animation: slideIn 0.5s ease-out; }
        
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 90%; max-width: 400px; }
        
        :global(.card) {
            background: #111111; border: 1px solid #333333; border-radius: 16px;
            padding: 20px; text-decoration: none; color: white;
            display: flex; flex-direction: column; justify-content: space-between;
            height: 120px; position: relative; transition: transform 0.1s;
        }
        :global(.card:active) { transform: scale(0.98); border-color: #555; }

        .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #333; position: absolute; top: 15px; right: 15px; }
        .status-dot.active { background-color: #ff3b30; box-shadow: 0 0 8px #ff3b30; animation: pulse 2s infinite; }
        
        .web-footer { margin-top: auto; padding-bottom: 40px; animation: fadeIn 1s ease; }
        .tg-button { background: #fff; color: #000; padding: 10px 20px; border-radius: 20px; text-decoration: none; font-size: 12px; font-weight: bold;}
        
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}