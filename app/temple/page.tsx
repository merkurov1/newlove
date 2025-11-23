'use client';

import { useEffect, useState, useCallback } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client'; 

const supabase = createClient();

export default function LoveTemple() {
  const [isTelegram, setIsTelegram] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const initTelegram = useCallback(() => {
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      
      if (tg.initData || tg.platform !== 'unknown') {
        setIsTelegram(true);
        tg.ready();
        tg.expand();
        
        try { tg.BackButton?.hide(); } catch (e) {}
        try {
            tg.setHeaderColor?.('#000000');
            tg.setBackgroundColor?.('#000000');
        } catch (e) {}

        // === ВОТ ГЛАВНОЕ ИЗМЕНЕНИЕ ===
        // Мы не пишем в базу напрямую. Мы зовем наш API.
        const user = tg.initDataUnsafe?.user;
        if (user) {
            fetch('/api/temple/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            }).then(() => console.log('User synced via API'));
        }
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (!isTelegram) initTelegram(); }, 500);
    return () => clearTimeout(timer);
  }, [initTelegram, isTelegram]);

  // Логи через публичную подписку (это безопасно)
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

  // Сигнал тоже можно перевести на API, если будут ошибки, но пока оставим так
  const sendSignal = async (type: string, message: string) => {
    if (!supabase) return;
    await supabase.from('temple_log').insert({ event_type: type, message: message });
  };

  return (
    <>
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

        <div className="grid">
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

        {isLoaded && !isTelegram && (
          <div className="web-footer">
            <a href="https://t.me/MerkurovLoveBot" className="tg-button">Telegram Login</a>
          </div>
        )}
      </main>

      <style jsx>{`
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
        .web-footer { m'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// Инициализация клиента (публичная часть)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export default function LoveTemple() {
  const [isTelegram, setIsTelegram] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  
  // == DEBUG STATE ==
  const [debugInfo, setDebugInfo] = useState<string>('Initializing...');
  const [userId, setUserId] = useState<string | number>('none');
  const [apiStatus, setApiStatus] = useState<string>('idle');

  useEffect(() => {
    // Логируем каждый шаг
    const addLog = (msg: string) => setDebugInfo(prev => prev + '\n> ' + msg);

    // 1. Жесткая проверка наличия Telegram SDK через интервал
    // (onLoad иногда срабатывает слишком рано или поздно в Next.js)
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
        const tg = (window as any).Telegram.WebApp;
        
        addLog('Telegram object found');
        
        if (tg.initDataUnsafe?.user) {
            const user = tg.initDataUnsafe.user;
            setIsTelegram(true);
            setUserId(user.id);
            addLog(`User found: ${user.id} (${user.username})`);
            
            // Настраиваем UI
            tg.ready();
            tg.expand();
            try { tg.BackButton.hide(); } catch (e) {}
            try {
                tg.setHeaderColor('#000000');
                tg.setBackgroundColor('#000000');
            } catch (e) {}

            // Пробуем отправить на API
            setApiStatus('sending...');
            fetch('/api/temple/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(user)
            })
            .then(async (res) => {
                const text = await res.text(); // Читаем как текст, чтобы видеть HTML ошибки если есть
                addLog(`API Response (${res.status}): ${text.slice(0, 50)}...`);
                if (res.ok) setApiStatus('success');
                else setApiStatus(`error: ${res.status}`);
            })
            .catch(err => {
                addLog(`Fetch error: ${err.message}`);
                setApiStatus('fetch_failed');
            });

            clearInterval(interval); // Останавливаем проверку, раз нашли
        } else {
            addLog('Telegram found, but NO USER data (opened externally?)');
            // Если открыто не в телеграме, но скрипт есть - останавливаем
            clearInterval(interval); 
        }
      } else {
          // addLog('Waiting for Telegram SDK...');
      }
    }, 500);

    // Стоп через 5 секунд, если не нашли
    setTimeout(() => clearInterval(interval), 5000);

    // Realtime логи (не зависят от телеграма)
    if (supabase) {
      const channel = supabase
        .channel('temple-live')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'temple_log' }, (payload: any) => {
            setLogs((prev) => [payload.new, ...prev].slice(0, 5));
        })
        .subscribe();
      
      supabase.from('temple_log').select('*').order('created_at', { ascending: false }).limit(3)
        .then(({ data }) => { if (data) setLogs(data); });
        
      return () => { supabase.removeChannel(channel); };
    } else {
        addLog('Supabase client missing keys');
    }
  }, []);

  const sendSignal = async (type: string, message: string) => {
    if (!supabase) return;
    await supabase.from('temple_log').insert({ event_type: type, message: message });
  };

  return (
    <>
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />

      <main className="temple-overlay">
        <header className="temple-header">
          <h1>LOVE TEMPLE</h1>
          <div className="subtitle">DIGITAL SANCTUARY</div>
        </header>

        {/* LIVEDATA */}
        <div className="chronicle-container">
            {logs.map((log) => (
                <div key={log.id} className="log-item fade-in">
                    {log.message}
                </div>
            ))}
        </div>

        {/* MENU */}
        <div className="grid">
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

        {/* === DEBUG PANEL (ВРЕМЕННО) === */}
        <div className="mt-8 w-[90%] p-4 bg-gray-900 border border-gray-700 rounded font-mono text-[10px] text-green-400 overflow-hidden break-all">
            <p>STATUS: {isTelegram ? 'TG APP DETECTED' : 'WEB BROWSER'}</p>
            <p>USER ID: {userId}</p>
            <p>API STATUS: {apiStatus}</p>
            <hr className="border-gray-700 my-2"/>
            <pre className="whitespace-pre-wrap">{debugInfo}</pre>
        </div>

      </main>

      <style jsx global>{`
        header, footer, nav { display: none !important; }
        body { background: #000 !important; }
      `}</style>

      <style jsx>{`
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
        .log-item { font-size: 12px; color: #888; margin-bottom: 4px; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 90%; max-width: 400px; }
        :global(.card) {
            background: #111111; border: 1px solid #333333; border-radius: 16px;
            padding: 20px; text-decoration: none; color: white;
            display: flex; flex-direction: column; justify-content: space-between;
            height: 120px; position: relative;
        }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background-color: #333; position: absolute; top: 15px; right: 15px; }
        .status-dot.active { background-color: #ff3b30; box-shadow: 0 0 8px #ff3b30; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
      `}</style>
    </>
  );
}argin-top: auto; padding-bottom: 40px; animation: fadeIn 1s ease; }
        .tg-button { background: #fff; color: #000; padding: 10px 20px; border-radius: 20px; text-decoration: none; font-size: 12px; font-weight: bold;}
        @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </>
  );
}