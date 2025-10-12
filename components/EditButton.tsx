'use client';

import useSupabaseSession from '@/hooks/useSupabaseSession';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useEditContext } from './EditContext';

interface EditButtonProps {
  contentType?: 'article' | 'project' | 'page';
  contentId?: string;
  slug?: string;
  showLabel?: boolean;
  variant?: 'floating' | 'inline' | 'compact';
  className?: string;
}

/**
 * Современный компонент кнопки редактирования с контекстной логикой
 * 
 * Архитектурные принципы:
 * - Использует React Context для получения информации о контенте
 * - Автоматическое определение контекста страницы
 * - Умная маршрутизация в зависимости от типа контента
 * - Адаптивный дизайн с различными вариантами отображения
 * - Безопасность через проверку роли пользователя
 */
export default function EditButton({
  contentType,
  contentId,
  slug,
  showLabel = false,
  variant = 'floating',
  className = ''
}: EditButtonProps) {
  const { session } = useSupabaseSession();
  const pathname = usePathname();
  const router = useRouter();
  const [isHovered, setIsHovered] = useState(false);
  
  // Получаем контекст редактирования (если доступен)
  const editContext = useEditContext();

  // Проверка прав доступа
  if (!session?.user || session.user.role !== 'ADMIN') {
    return null;
  }

  // Объединяем пропы с контекстом (пропы имеют приоритет)
  const finalContentType = contentType || editContext.contentType;
  const finalContentId = contentId || editContext.contentId;
  const finalSlug = slug || editContext.slug;

  // Умное определение контекста и маршрута редактирования
  const getEditRoute = (): string => {
    // Если переданы явные параметры или контекст
    if (finalContentType && finalContentId) {
      switch (finalContentType) {
        case 'article':
          return `/admin/articles/edit/${finalContentId}`;
        case 'project':
          return `/admin/projects/edit/${finalContentId}`;
        default:
          return '/admin';
      }
    }

    // Автоматическое определение по URL
    if (pathname && (pathname.startsWith('/articles/') || pathname.includes('article'))) {
      const slugFromPath = finalSlug || pathname.split('/').pop();
      return `/admin/articles${slugFromPath ? `?slug=${slugFromPath}` : ''}`;
    }
    
    if (pathname && (pathname.startsWith('/projects/') || pathname.includes('project'))) {
      const slugFromPath = finalSlug || pathname.split('/').pop();
      return `/admin/projects${slugFromPath ? `?slug=${slugFromPath}` : ''}`;
    }

    // Специальные страницы
    if (pathname === '/') {
      return '/admin'; // Главная страница - в общую админку
    }

    // Fallback в основную админку
    return '/admin';
  };

  // Варианты дизайна
  const getVariantClasses = () => {
    const baseClasses = 'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2';
    
    switch (variant) {
      case 'floating':
        return `
          ${baseClasses}
          fixed bottom-6 right-6 z-50
          bg-blue-600 hover:bg-blue-700 text-white
          w-14 h-14 rounded-full shadow-lg hover:shadow-xl
          flex items-center justify-center
          transform hover:scale-110
          ${showLabel ? 'w-auto px-4' : ''}
        `;
      
      case 'inline':
        return `
          ${baseClasses}
          bg-blue-600 hover:bg-blue-700 text-white
          px-4 py-2 rounded-lg shadow-md hover:shadow-lg
          flex items-center gap-2
        `;
      
      case 'compact':
        return `
          ${baseClasses}
          bg-gray-100 hover:bg-blue-50 text-gray-600 hover:text-blue-600
          px-3 py-1.5 rounded-md text-sm border border-gray-200 hover:border-blue-300
          flex items-center gap-1.5
        `;
      
      default:
        return baseClasses;
    }
  };

  const editRoute = getEditRoute();

  const handleClick = () => {
    router.push(editRoute);
  };

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${getVariantClasses()} ${className}`}
      title={`Редактировать ${finalContentType || 'контент'}`}
      aria-label={`Перейти к редактированию ${finalContentType || 'контента'}`}
    >
      <svg 
        className={`${variant === 'compact' ? 'w-4 h-4' : 'w-5 h-5'} ${isHovered && variant === 'floating' ? 'rotate-12' : ''} transition-transform duration-200`} 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" 
        />
      </svg>
      
      {showLabel && (
        <span className={`${variant === 'compact' ? 'text-sm' : ''} font-medium`}>
          {variant === 'compact' ? 'Править' : 'Редактировать'}
        </span>
      )}
    </button>
  );
}