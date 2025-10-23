'use client';

import { useState } from 'react';
import { Card, CardHeader, CardContent } from '@/components/admin/Card';
import { Button } from '@/components/admin/Button';
import WelcomeBanner from '@/components/WelcomeBanner';
import useBannerSettings from '@/hooks/useBannerSettings';

export default function BannersAdminPage() {
  const [previewVariant, setPreviewVariant] = useState<'public' | 'authenticated' | 'admin'>('public');
  const { settings, resetAllSettings, getBannerStats } = useBannerSettings();

  const variants = [
    { key: 'public', label: 'Для незарегистрированных', color: 'bg-pink-50' },
    { key: 'authenticated', label: 'Для пользователей', color: 'bg-rose-50' },
    { key: 'admin', label: 'Для админов', color: 'bg-purple-50' }
  ] as const;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Управление баннерами</h1>
        <p className="text-gray-600 mt-1">Настройка и предпросмотр приветственных баннеров</p>
      </div>

      {/* Preview Section */}
      <Card>
        <CardHeader title="Предпросмотр баннеров" />
        <CardContent>
          <div className="space-y-6">
            {/* Selector */}
            <div className="flex flex-wrap gap-2">
              {variants.map(variant => (
                <button
                  key={variant.key}
                  onClick={() => setPreviewVariant(variant.key)}
                  className={`
                    px-4 py-2 rounded-lg border transition-all
                    ${previewVariant === variant.key 
                      ? 'border-blue-500 bg-blue-50 text-blue-700' 
                      : 'border-gray-200 hover:border-gray-300'
                    }
                  `}
                >
                  {variant.label}
                </button>
              ))}
            </div>

            {/* Preview */}
            <div className="border rounded-lg p-6 bg-gray-50">
              <WelcomeBanner 
                variant={previewVariant} 
                forceShow={true}
                onClose={() => console.log('Preview banner closed')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader title="Статистика показов" />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {variants.map(variant => {
              const stats = getBannerStats(`${variant.key}-welcome`);
              return (
                <div key={variant.key} className={`p-4 rounded-lg border ${variant.color}`}>
                  <h3 className="font-semibold text-gray-900">{variant.label}</h3>
                  <div className="mt-2 space-y-1 text-sm text-gray-600">
                    <div>Показов: {stats.totalShows || 0}</div>
                    <div>
                      Последний показ: {
                        stats.lastShown 
                          ? new Date(stats.lastShown).toLocaleDateString('ru-RU')
                          : 'Никогда'
                      }
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Settings Management */}
      <Card>
        <CardHeader title="Управление настройками" />
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <h3 className="font-medium">Сбросить все настройки</h3>
                <p className="text-sm text-gray-600">
                  Удаляет все сохраненные настройки показа баннеров для всех пользователей
                </p>
              </div>
              <Button 
                variant="danger" 
                onClick={() => {
                  if (confirm('Вы уверены? Это действие нельзя отменить.')) {
                    resetAllSettings();
                    alert('Настройки сброшены');
                  }
                }}
              >
                Сбросить
              </Button>
            </div>

            <div className="p-4 border rounded-lg bg-blue-50">
              <h3 className="font-medium text-blue-900">Логика показа баннеров</h3>
              <ul className="mt-2 space-y-1 text-sm text-blue-800">
                <li>• <strong>Публичный баннер:</strong> показывается всегда неавторизованным пользователям</li>
                <li>• <strong>Баннер пользователей:</strong> показывается раз в неделю авторизованным</li>
                <li>• <strong>Баннер админа:</strong> показывается каждый день админам</li>
                <li>• Пользователи могут скрыть баннер на неделю или навсегда</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Raw Settings Debug */}
      <Card>
        <CardHeader title="Отладочная информация" />
        <CardContent>
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
              Показать raw настройки localStorage
            </summary>
            <pre className="mt-4 p-4 bg-gray-100 rounded text-xs overflow-auto">
              {JSON.stringify(settings, null, 2)}
            </pre>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}