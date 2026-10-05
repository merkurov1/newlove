// src/hooks/useTelegramAuth.ts
import { useEffect, useState } from 'react';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export function useTelegramAuth() {
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [initData, setInitData] = useState<string>('');
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const tg = (window as any).Telegram?.WebApp;
    
    if (tg) {
      tg.ready();
      if (tg.initData) {
        setInitData(tg.initData);
        // Дублируем в cookie для серверных компонентов (если нужно)
        document.cookie = `tg_init_data=${encodeURIComponent(tg.initData)}; path=/; max-age=86400`;
      }
      
      if (tg.initDataUnsafe?.user) {
        const tgUser = tg.initDataUnsafe.user;
        setUser(tgUser);
        localStorage.setItem('tg_user', JSON.stringify(tgUser));
        setIsLoaded(true);
        return;
      }
    }

    // Fallback: если объект WebApp недоступен (переход по роутам), пробуем взять из localStorage
    const savedUser = localStorage.getItem('tg_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('Failed to parse saved telegram user', e);
      }
    }
    
    setIsLoaded(true);
  }, []);

  return { user, initData, isLoaded };
}
