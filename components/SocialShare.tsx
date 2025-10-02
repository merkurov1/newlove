'use client';

import React from 'react';

interface SocialShareProps {
  title: string;
  url: string;
  description?: string;
}

interface SharePlatform {
  name: string;
  icon: string;
  shareUrl: (url: string, title: string, description?: string) => string;
  color: string;
}

const platforms: SharePlatform[] = [
  {
    name: 'Twitter',
    icon: '𝕏',
    shareUrl: (url, title) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`,
    color: 'hover:bg-black hover:text-white'
  },
  {
    name: 'Telegram',
    icon: '✈️',
    shareUrl: (url, title) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`,
    color: 'hover:bg-blue-500 hover:text-white'
  },
  {
    name: 'WhatsApp',
    icon: '💬',
    shareUrl: (url, title) => `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`,
    color: 'hover:bg-green-500 hover:text-white'
  },
  {
    name: 'Bluesky',
    icon: '🦋',
    shareUrl: (url, title) => `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title} ${url}`)}`,
    color: 'hover:bg-blue-400 hover:text-white'
  },
  {
    name: 'LinkedIn',
    icon: '💼',
    shareUrl: (url, title) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    color: 'hover:bg-blue-700 hover:text-white'
  },
  {
    name: 'Facebook',
    icon: '📘',
    shareUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    color: 'hover:bg-blue-600 hover:text-white'
  },
  {
    name: 'Email',
    icon: '📧',
    shareUrl: (url, title, description) => 
      `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${description || title}\n\n${url}`)}`,
    color: 'hover:bg-gray-600 hover:text-white'
  },
  {
    name: 'Копировать',
    icon: '📋',
    shareUrl: () => '', // Специальная обработка
    color: 'hover:bg-gray-500 hover:text-white'
  }
];

export default function SocialShare({ title, url, description }: SocialShareProps) {
  const handleShare = async (platform: SharePlatform) => {
    if (platform.name === 'Копировать') {
      try {
        await navigator.clipboard.writeText(url);
        // Можно добавить уведомление о копировании
        const button = document.activeElement as HTMLElement;
        if (button) {
          const originalText = button.textContent;
          button.textContent = '✓';
          setTimeout(() => {
            button.textContent = originalText;
          }, 1000);
        }
      } catch (err) {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea');
        textArea.value = url;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      return;
    }

    const shareUrl = platform.shareUrl(url, title, description);
    window.open(shareUrl, '_blank', 'width=600,height=400');
  };

  return (
    <div className="border-t border-gray-200 pt-8 mt-8">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Поделиться статьей</h3>
      <div className="flex flex-wrap gap-3">
        {platforms.map((platform) => (
          <button
            key={platform.name}
            onClick={() => handleShare(platform)}
            className={`
              flex items-center gap-2 px-3 py-2 
              border border-gray-300 rounded-lg 
              text-sm font-medium text-gray-700 
              bg-white transition-all duration-200
              ${platform.color}
              hover:border-transparent hover:shadow-md
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1
            `}
            title={`Поделиться в ${platform.name}`}
          >
            <span className="text-base">{platform.icon}</span>
            <span className="hidden sm:inline">{platform.name}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Нажмите на платформу, чтобы поделиться этой статьей
      </p>
    </div>
  );
}