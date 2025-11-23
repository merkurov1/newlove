'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';
import Link from 'next/link';

export default function LoveTemple() {
  const [isTelegram, setIsTelegram] = useState(false);

  useEffect(() => {
    // Этот код сработает только на клиенте после загрузки
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp) {
      const tg = (window as any).Telegram.WebApp;
      
      // Проверяем, запущены ли мы внутри Телеграма
      if (tg.initData || tg.platform !== 'unknown') {
        setIsTelegram(true);
        tg.ready();
        tg.expand(); // Раскрываем на весь экран
        
        // Настраиваем цвета "шапки" телеграма под наш черный стиль
        try {
            tg.setHeaderColor('#000000');
            tg.setBackgroundColor('#000000');
        } catch (e) {
            console.log('Styling TG header not supported');
        }
      }
    }
  }, []);

  return (
    <>
      {/* Подключаем скрипт Телеграма. strategy="beforeInteractive" загрузит его быстро */}
      <Script 
        src="https://telegram.org/js/telegram-web-app.js" 
        strategy="beforeInteractive" 
      />

      <main className="temple-container">
        <header>
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

        {/* Показываем кнопку "Войти через Telegram" только если мы в обычном браузере */}
        {!isTelegram && (
          <div className="web-footer">
            <p>Для полного погружения</p>
            <a href="https://t.me/MerkurovLoveBot" className="tg-button">
              Войти через Telegram
            </a>
          </div>
        )}
      </main>

      {/* Стили - Next.js style jsx (встроено) */}
      <style jsx global>{`
        body {
          background-color: #000000;
          color: #ffffff;
          margin: 0;
        }
      `}</style>
      
      <style jsx>{`
        .temple-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding-bottom: 20px;
        }

        header {
            margin-top: 40px;
            margin-bottom: 30px;
            text-align: center;
            animation: fadeIn 2s ease;
        }

        h1 {
            font-weight: 300;
            letter-spacing: 4px;
            font-size: 24px;
            margin: 0;
            text-transform: uppercase;
        }

        .subtitle {
            font-size: 12px;
            color: #666;
            margin-top: 5px;
            letter-spacing: 1px;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
            width: 90%;
            max-width: 400px;
        }

        /* Мы используем :global для ссылок, так как Link в Next.js оборачивает их */
        :global(.card) {
            background: #111111;
            border: 1px solid #333333;
            border-radius: 16px;
            padding: 20px;
            text-decoration: none;
            color: white;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 120px;
            transition: transform 0.2s, border-color 0.2s;
            position: relative;
            overflow: hidden;
        }

        :global(.card:active) {
            transform: scale(0.98);
        }

        h2 {
            font-size: 16px;
            margin: 0;
            font-weight: 500;
            letter-spacing: 1px;
        }

        p {
            font-size: 12px;
            color: #888;
            margin: 5px 0 0 0;
        }

        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #333;
            position: absolute;
            top: 15px;
            right: 15px;
        }

        .status-dot.active {
            background-color: #ff3b30;
            box-shadow: 0 0 8px #ff3b30;
            animation: pulse 2s infinite;
        }

        .web-footer {
            margin-top: auto;
            padding-bottom: 40px;
            text-align: center;
        }
        
        .web-footer p {
            margin-bottom: 15px;
            color: #555;
        }

        .tg-button {
            background: #fff;
            color: #000;
            padding: 12px 24px;
            border-radius: 30px;
            text-decoration: none;
            font-weight: 600;
            font-size: 14px;
            display: inline-block;
        }

        @keyframes pulse {
            0% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
            100% { opacity: 1; transform: scale(1); }
        }
        
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}