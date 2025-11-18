'use client';

import { useAuth } from '@/components/AuthContext';
import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import useBannerSettings from '@/hooks/useBannerSettings';

interface WelcomeBannerProps {
  onClose?: () => void;
  variant?: 'public' | 'authenticated' | 'admin';
  forceShow?: boolean;
}

interface BannerConfig {
  id: string;
  title: string;
  description: string;
  style: string;
  icon: string;
  showFrequency: 'always' | 'once' | 'weekly';
  showDuration?: number; // дни
}

const BANNER_CONFIGS: Record<string, BannerConfig> = {
  public: {
    id: 'public-welcome',
    title: 'Добро пожаловать в мир медиа и технологий',
    description: 'Исследуем пересечение искусства, любви и денег в цифровую эпоху. Зарегистрируйтесь, чтобы получить доступ к эксклюзивным материалам и закрытому сообществу.',
    style: 'bg-gradient-to-r from-pink-50 to-rose-50 border-pink-200',
    icon: '🌟',
    showFrequency: 'always'
  },
  authenticated: {
    id: 'auth-welcome',
    title: 'Добро пожаловать в круг близких!',
    description: 'Вам открыты все публикации, включая личные истории и творческие эксперименты. Впереди — запуск закрытого сообщества и новые проекты. Остаемся на связи.',
    style: 'bg-gradient-to-r from-rose-50 to-pink-100 border-rose-300',
    icon: '🤗',
    showFrequency: 'weekly'
  },
  admin: {
    id: 'admin-welcome', 
    title: 'Панель администратора',
    description: 'Добро пожаловать в круг близких! Вам открыты все публикации, включая личные истории и творческие эксперименты. Впереди — запуск закрытого сообщества и новые проекты.',
    style: 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200',
    icon: '👑',
    showFrequency: 'always'
  }
};

/**
 * Система умных баннеров приветствия
 * 
 * Архитектурные принципы:
 * - Адаптивное содержимое в зависимости от статуса пользователя
 * - Локальное хранение настроек показа
 * - Плавные анимации появления/исчезновения
 * - Современный дизайн с градиентами и закругленными углами
 */
export default function WelcomeBanner({ onClose, variant, forceShow = false }: WelcomeBannerProps) {
  const { session, isLoading } = useAuth();
  const status = isLoading ? 'loading' : (session ? 'authenticated' : 'unauthenticated');
  const [isVisible, setIsVisible] = useState(false);
  const [bannerConfig, setBannerConfig] = useState<BannerConfig | null>(null);
  const { isLoaded, shouldShowBanner, markBannerShown, dismissBanner } = useBannerSettings();

  // Определяем вариант баннера (memoized для стабильной identity в эффектах)
  const currentVariant = useMemo(() => {
    if (variant) return variant;
    if (status === 'loading') return 'public';
    if (session?.user?.role === 'ADMIN') return 'admin';
    if (session?.user) return 'authenticated';
    return 'public';
  }, [variant, session, status]);

  // Инициализация баннера
  useEffect(() => {
    if (!isLoaded && !forceShow) return;
    
    const config = BANNER_CONFIGS[currentVariant];
    
    if (config && (forceShow || shouldShowBanner(config.id, config.showFrequency))) {
      setBannerConfig(config);
      setIsVisible(true);
      
      // Отмечаем показ через хук
      if (!forceShow) {
        markBannerShown(config.id);
      }
    }
  }, [currentVariant, forceShow, isLoaded, markBannerShown, shouldShowBanner]);

  // Обработка закрытия
  const handleClose = (type: 'temporary' | 'week' | 'permanent' = 'temporary') => {
    if (!bannerConfig) return;
    
    setIsVisible(false);
    
    if (type !== 'temporary') {
      const duration = type === 'week' ? 'week' : 'permanent';
      dismissBanner(bannerConfig.id, duration);
    }
    
    onClose?.();
  };

  if (!isVisible || !bannerConfig) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={`
          relative rounded-2xl border-2 p-6 md:p-8 shadow-sm hover:shadow-md 
          transition-all duration-300 mb-8 overflow-hidden
          ${bannerConfig.style}
        `}
      >
        {/* Фоновый паттерн */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(120,119,198,0.3),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(255,119,198,0.2),transparent_50%)]" />
        </div>

        <div className="relative flex items-start justify-between">
          <div className="flex-1 pr-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-2xl" role="img" aria-label="Иконка">
                {bannerConfig.icon}
              </span>
              <h2 className="text-xl md:text-2xl font-bold text-gray-900 leading-tight">
                {bannerConfig.title}
              </h2>
            </div>
            
            <p className="text-gray-700 leading-relaxed text-base md:text-lg max-w-4xl">
              {bannerConfig.description}
            </p>
            
            {/* Call to Action для незарегистрированных */}
            {currentVariant === 'public' && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button 
                  onClick={() => alert('Use the login button above or wallet login below.')}
                  className="bg-gray-900 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors"
                >
                  Войти
                </button>
                <button 
                  onClick={() => handleClose('week')}
                  className="text-gray-600 hover:text-gray-800 px-4 py-2 text-sm transition-colors"
                >
                  Напомнить через неделю
                </button>
              </div>
            )}
            
            {/* Quick actions для аутентифицированных */}
            {currentVariant === 'authenticated' && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link 
                  href={session?.user?.username ? `/you/${session.user.username}` : '/profile'}
                  className="bg-rose-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-rose-700 transition-colors text-center"
                >
                  Мой профиль
                </Link>
                <Link 
                  href="/selection"
                  className="text-rose-600 hover:text-rose-800 px-4 py-2 text-sm transition-colors border border-rose-200 rounded-lg hover:bg-rose-50 text-center"
                >
                  Читать статьи
                </Link>
              </div>
            )}
            
            {/* Quick actions для админов */}
            {currentVariant === 'admin' && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link 
                  href="/admin"
                  className="bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors text-center"
                >
                  Панель управления
                </Link>
                <Link 
                  href="/admin/articles/new"
                  className="text-purple-600 hover:text-purple-800 px-4 py-2 text-sm transition-colors border border-purple-200 rounded-lg hover:bg-purple-50 text-center"
                >
                  Написать статью
                </Link>
              </div>
            )}
          </div>

          {/* Кнопки управления */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => handleClose('temporary')}
              className="p-2 rounded-full hover:bg-white/50 transition-colors group"
              title="Закрыть"
            >
              <svg 
                className="w-5 h-5 text-gray-500 group-hover:text-gray-700" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Дополнительные опции для аутентифицированных пользователей */}
            {currentVariant !== 'public' && (
              <div className="relative group">
                <button 
                  className="p-2 rounded-full hover:bg-white/50 transition-colors"
                  title="Настройки показа"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                  </svg>
                </button>
                
                {/* Выпадающее меню */}
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-10 whitespace-nowrap">
                  <button 
                    onClick={() => handleClose('week')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Скрыть на неделю
                  </button>
                  <button 
                    onClick={() => handleClose('permanent')}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Больше не показывать
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}