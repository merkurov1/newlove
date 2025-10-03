'use client';

import { useState, useEffect } from 'react';

interface BannerSettings {
  [bannerId: string]: {
    lastShown?: string;
    dismissedUntil?: string;
    totalShows?: number;
  };
}

/**
 * Хук для управления настройками показа баннеров
 * 
 * Использует localStorage для хранения пользовательских предпочтений
 * и статистики показов баннеров
 */
export function useBannerSettings() {
  const [settings, setSettings] = useState<BannerSettings>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Загрузка настроек из localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('banner-settings');
        if (stored) {
          setSettings(JSON.parse(stored));
        }
      } catch (error) {
        console.error('Error loading banner settings:', error);
      } finally {
        setIsLoaded(true);
      }
    }
  }, []);

  // Сохранение настроек в localStorage
  const saveSettings = (newSettings: BannerSettings) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('banner-settings', JSON.stringify(newSettings));
        setSettings(newSettings);
      } catch (error) {
        console.error('Error saving banner settings:', error);
      }
    }
  };

  // Отметить показ баннера
  const markBannerShown = (bannerId: string) => {
    const newSettings = {
      ...settings,
      [bannerId]: {
        ...settings[bannerId],
        lastShown: new Date().toISOString(),
        totalShows: (settings[bannerId]?.totalShows || 0) + 1
      }
    };
    saveSettings(newSettings);
  };

  // Скрыть баннер на определенное время
  const dismissBanner = (bannerId: string, duration: 'week' | 'month' | 'permanent') => {
    const dismissUntil = new Date();
    
    switch (duration) {
      case 'week':
        dismissUntil.setDate(dismissUntil.getDate() + 7);
        break;
      case 'month':
        dismissUntil.setMonth(dismissUntil.getMonth() + 1);
        break;
      case 'permanent':
        dismissUntil.setFullYear(dismissUntil.getFullYear() + 10);
        break;
    }

    const newSettings = {
      ...settings,
      [bannerId]: {
        ...settings[bannerId],
        dismissedUntil: dismissUntil.toISOString()
      }
    };
    saveSettings(newSettings);
  };

  // Проверить, нужно ли показывать баннер
  const shouldShowBanner = (
    bannerId: string, 
    frequency: 'always' | 'once' | 'weekly' | 'monthly' = 'always'
  ): boolean => {
    if (!isLoaded) return false;

    const bannerData = settings[bannerId];
    
    // Проверяем на временное скрытие
    if (bannerData?.dismissedUntil) {
      const dismissedUntil = new Date(bannerData.dismissedUntil);
      if (new Date() < dismissedUntil) {
        return false;
      }
    }

    // Проверяем частоту показа
    switch (frequency) {
      case 'always':
        return true;
        
      case 'once':
        return !bannerData?.lastShown;
        
      case 'weekly':
        if (!bannerData?.lastShown) return true;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(bannerData.lastShown) < weekAgo;
        
      case 'monthly':
        if (!bannerData?.lastShown) return true;
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        return new Date(bannerData.lastShown) < monthAgo;
        
      default:
        return true;
    }
  };

  // Сбросить все настройки баннеров
  const resetAllSettings = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('banner-settings');
      setSettings({});
    }
  };

  // Получить статистику показов
  const getBannerStats = (bannerId: string) => {
    return settings[bannerId] || { totalShows: 0 };
  };

  return {
    isLoaded,
    shouldShowBanner,
    markBannerShown,
    dismissBanner,
    resetAllSettings,
    getBannerStats,
    settings
  };
}

export default useBannerSettings;