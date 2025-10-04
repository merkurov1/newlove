"use client";

import { useEffect } from 'react';

export default function GlobalErrorHandler() {
  useEffect(() => {
    // Обработчик для неперехваченных ошибок
    const handleUnhandledRejection = (event) => {
      // Фильтруем ошибки браузерных расширений
      if (
        event.reason?.message?.includes('runtime.sendMessage') ||
        event.reason?.message?.includes('Extension context invalidated') ||
        event.reason?.message?.includes('Tab not found') ||
        event.reason?.stack?.includes('chrome-extension://') ||
        event.reason?.stack?.includes('safari-extension://') ||
        event.reason?.stack?.includes('moz-extension://')
      ) {
        // Подавляем ошибки расширений
        event.preventDefault();
        console.debug('Suppressed browser extension error:', event.reason?.message);
        return;
      }
      
      // Остальные ошибки пропускаем для обработки Sentry
      console.error('Unhandled promise rejection:', event.reason);
    };

    // Обработчик для глобальных ошибок
    const handleError = (event) => {
      // Фильтруем ошибки браузерных расширений
      if (
        event.error?.message?.includes('runtime.sendMessage') ||
        event.error?.message?.includes('Extension context invalidated') ||
        event.error?.message?.includes('Tab not found') ||
        event.error?.stack?.includes('chrome-extension://') ||
        event.error?.stack?.includes('safari-extension://') ||
        event.error?.stack?.includes('moz-extension://')
      ) {
        // Подавляем ошибки расширений
        event.preventDefault();
        console.debug('Suppressed browser extension error:', event.error?.message);
        return;
      }
      
      // Остальные ошибки пропускаем для обработки Sentry
      console.error('Global error:', event.error);
    };

    // Добавляем обработчики
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Убираем обработчики при размонтировании
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return null; // Компонент ничего не рендерит
}