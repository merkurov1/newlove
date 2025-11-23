'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

// === БЕРЕМ КЛЮЧИ ИЗ VERCEL ===
// Обычно в Next.js проектах Supabase переменные называются так:
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Создаем клиент только если ключи есть, чтобы не упало с ошибкой
const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export default function LoveTemple() {
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    // Проверка на случай, если ключи не подтянулись
    if (!supabase) {
        console.error('Supabase keys not found! Check Vercel environment variables (need NEXT_PUBLIC_ prefix).');
    }

    if (typeof window !== 'undefined') {
      // Небольшая задержка для инициализации API Телеграма
      setTimeout(() => {
        const tg = (window as any).Telegram?.WebApp;
        
        if (tg && (tg.initData || tg.platform !== 'unknown')) {
          initTelegramMode(tg);
        }
      }, 100);
    }
  }, []);

  const initTelegramMode = async (tg: any) => {
    setIsTelegram(true);
    tg.ready();
    tg.expand();
    
    // Красим шапку
    try {
        tg.setHeaderColor('#000000');
        tg.setBackgroundColor('#000000');
    } catch (e) {}

    // === ЛОГИКА ЗАПИСИ В БАЗУ ===
    const user = tg.initDataUnsafe?.user;
    
    if (user && supabase) {
        console.log("Пилигрим прибыл:", user);
        
        // Пишем в таблицу temple_users
        const { error } = await supabase
            .from('temple_users')
            .upsert({
                telegram_id: user.id,
                username: user.username || '',
                first_name: user.first_name || '',
                language_code: user.language_code || 'en',
                last_seen_at: new Date().toISOString()
            }, { onConflict: 'telegram_id' });

        if (error) console.error('Ошибка записи прихожанина:', error);
    }
  };

  return (
    <>
      <Script 
        src="https://telegram.org/js/telegram-web-app.js" 
        strategy="beforeInteractive" 
      />

      <main className="temple-container">
        
        {/* Заголовок (виден только здесь) */}
        <header className="temple-header">
          <h1>LOVE TEMPLE</h1>
          <div className="subtitle">DIGITAL SANCTUARY</div>
        </header>

        <div className="grid">
          {/* VIGIL */}
          <Link href="/vigil" className="card">
            <div className="status-dot active"></div>
            <div>
              <h2>VIGIL</h2>
              <p>Бдение</p>
            </div>
          </Link>

          {/* LET IT GO */}
          <Link href="/heartandangel/letitgo" className="card">
            <div className="status-dot"></div>
            <div>
              <h2>LET IT GO</h2>
              <p>Отпусти</p>
            </div>
          </Link>

          {/* ABSOLUTION */}
          <Link href="/absolution" className="card">
            <div className="status-dot"></div>
            <div>
              <h2>ABSOLUTION</h2>
              <p>Искупление</p>
            </div>
          </Link>

          {/* CAST */}
          <Link href="/cast" className="card">
            <div className="status-dot active"></div>
            <div>
              <h2>CAST</h2>
              <p>Голос</p>
            </div>
          </Link>
        </div>

        {/* Кнопка входа для веба */}
        {!isTelegram && (
          <div className="web-footer">
            <p>Для полного погружения</p>
            <a href="https://t.me/MerkurovLoveBot" className="tg-button">
              Войти через Telegram
            </a>
          </div>
        )}
      </main>

      {/* === ГРЯЗНЫЙ ХАК: Вырезаем шапку основного сайта === */}
      <style jsx global>{`
        /* Скрываем стандартные хедеры и футеры Next.js layout */
        body > header:not(.temple-header), 
        body > footer, 
        body > nav,
        .nextjs-portal, /* Иногда Next создает порталы */
        [class*="Header"], [class*="header"], /* Пытаемся угадать классы */
        [class*="Footer"], [class*="footer"] {
            display: none !important;
        }

        /* Принудительный черный фон */
        body, html {
            background-color: #000000 !important;
            color: #ffffff;
            margin: 0;
            overflow-x: hidden;
        }
      `}</style>
      
      {/* Локальные стили храма */}
      <style jsx>{`
        .temple-container {
          display: flex; flex-direction: column; align-items: center;
          min-height: 100vh; font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
          padding-bottom: 20px;
          background-color: #000;
          width: 100%;
          position: relative;
          z-index: 9999;
        }

        .temple-header {
            margin-top: 40px; margin-bottom: 30px; text-align: center;
            display: block !important;
        }

        h1 { font-weight: 300; letter-spacing: 4px; font-size: 24px; margin: 0; text-transform: uppercase; }
        .subtitle { font-size: 12px; color: #666; margin-top: 5px; letter-spacing: 1px; }
        
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; width: 90%; max-width: 400px; }
        
        :global(.card) {
            background: #111111; border: 1px solid #333333; border-radius: 16px;
            padding: 20px; text-decoration: none; color: white;
            display: flex; flex-direction: column; justify-content: space-between;
            height: 120px; position: relative;
        }
        
        h2 { font-size: 16px; margin: 0; }
        p { font-size: 12px; color: #888; margin: 5px 0 0 0; }
        
        .status-dot {
            width: 8px; height: 8px; border-radius: 50%; background-color: #333;
            position: absolute; top: 15px; right: 15px;
        }
        .status-dot.active {
            background-color: #ff3b30; box-shadow: 0 0 8px #ff3b30; animation: pulse 2s infinite;
        }
        .web-footer { margin-top: auto; padding-bottom: 40px; text-align: center; }
        .tg-button { background: #fff; color: #000; padding: 12px 24px; border-radius: 30px; text-decoration: none; font-size: 14px; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
      `}</style>
    </>
  );
}