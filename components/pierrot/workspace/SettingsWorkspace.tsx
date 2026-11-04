'use client';

import { useState } from 'react';
import { Check, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import type {
  IntegrationSnapshot,
  ModelSnapshot,
} from '@/lib/pierrot/workspace/types';
import { WORKSPACE_ROUTES } from '@/lib/pierrot/workspace/navigation';
import { clearWorkspaceHandoff } from '@/lib/pierrot/workspace/handoff';
import { useOnlineStatus } from './useOnlineStatus';

type UserSnapshot = {
  name: string | null;
  email: string | null;
  image: string | null;
};

export default function SettingsWorkspace({
  user,
  model,
  integrations,
}: {
  user: UserSnapshot;
  model: ModelSnapshot;
  integrations: IntegrationSnapshot;
}) {
  const online = useOnlineStatus();
  const [blueskyCheck, setBlueskyCheck] = useState<
    'idle' | 'checking' | 'ok' | 'fail'
  >('idle');
  const [blueskyError, setBlueskyError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = user.name || user.email?.split('@')[0] || 'Владелец';
  const initials = displayName.slice(0, 1).toUpperCase();

  async function verifyBluesky() {
    if (!online) return;
    setBlueskyCheck('checking');
    setBlueskyError(null);

    try {
      const response = await fetch('/api/bluesky/posts?limit=1');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }
      setBlueskyCheck('ok');
    } catch (caught) {
      setBlueskyCheck('fail');
      setBlueskyError(caught instanceof Error ? caught.message : 'Проверка не удалась.');
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Continue with local cleanup even if the remote session is already gone.
    }

    try {
      navigator.serviceWorker?.controller?.postMessage({ type: 'PIERROT_CLEAR_CACHES' });
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Cache API may be unavailable; there is no private owner API cache.
    }

    clearWorkspaceHandoff();
    window.localStorage.removeItem('pierrot_consent_v1');
    window.location.assign('/');
  }

  return (
    <div className="pw-page-inner pw-settings">
      <p className="pw-kicker">SETTINGS · только владелец</p>
      <h1 className="pw-page-title">Настройки</h1>

      <section className="pw-setting-group" aria-labelledby="pw-settings-account">
        <h2 id="pw-settings-account" className="pw-section-title">
          Аккаунт
        </h2>
        <div className="pw-setting-row">
          <span className="pw-setting-name">Профиль</span>
          <div className="pw-setting-value">
            <div className="pw-account">
              <span className="pw-avatar">
                {user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.image} alt="" />
                ) : (
                  initials
                )}
              </span>
              <span>
                <strong>{displayName}</strong>
                <br />
                {user.email || 'email не передан'}
              </span>
            </div>
          </div>
          <span />
        </div>
        <div className="pw-setting-row">
          <span className="pw-setting-name">Авторизация</span>
          <span className="pw-setting-value">
            <strong>ADMIN</strong> · Supabase session
          </span>
          <span />
        </div>
        <div className="pw-setting-row">
          <span className="pw-setting-name">Сессия</span>
          <span className="pw-setting-value">
            Выход очистит локальный handoff и Cache Storage. Приватные API никогда не
            кэшируются.
          </span>
          <button
            type="button"
            className="pw-button pw-button-danger"
            onClick={() => void logout()}
            disabled={loggingOut}
          >
            <LogOut size={14} aria-hidden="true" />
            {loggingOut ? 'Выхожу…' : 'Выйти'}
          </button>
        </div>
      </section>

      <section className="pw-setting-group" aria-labelledby="pw-settings-model">
        <h2 id="pw-settings-model" className="pw-section-title">
          Модель
        </h2>
        <div className="pw-setting-row">
          <span className="pw-setting-name">По умолчанию</span>
          <span className="pw-setting-value">
            <strong>{model.primary || 'не настроена'}</strong>
          </span>
          <span className="pw-channel-state">
            {model.configured ? 'настроено' : 'нет ключа'}
          </span>
        </div>
        <div className="pw-setting-row">
          <span className="pw-setting-name">Fallback</span>
          <span className="pw-setting-value">
            {model.fallback.length > 0 ? model.fallback.join(' → ') : 'нет'}
          </span>
          <span />
        </div>
        <p className="pw-kicker" style={{ marginTop: 14 }}>
          Переключатель моделей не добавлен: существующий backend не предоставляет
          безопасную операцию смены модели из интерфейса владельца. Секреты и переменные
          окружения в браузер не передаются.
        </p>
      </section>

      <section className="pw-setting-group" aria-labelledby="pw-settings-connections">
        <h2 id="pw-settings-connections" className="pw-section-title">
          Подключения
        </h2>

        <div className="pw-setting-row">
          <span className="pw-setting-name">GitHub</span>
          <span className="pw-setting-value">
            OAuth-подключение в репозитории отсутствует. Токен knowledge-админки не является
            пользовательским подключением.
          </span>
          <a
            className="pw-button pw-button-small"
            href="https://github.com/merkurov1"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={13} aria-hidden="true" />
            GitHub
          </a>
        </div>

        <div className="pw-setting-row">
          <span className="pw-setting-name">Bluesky</span>
          <span className="pw-setting-value">
            {integrations.blueskyConfigured
              ? 'Ключи присутствуют на сервере. Статус можно проверить запросом к существующему API.'
              : 'Не настроено на сервере.'}
            {blueskyCheck === 'ok' && (
              <span style={{ display: 'block', marginTop: 6 }}>
                <Check size={13} aria-hidden="true" /> Проверено: API отвечает.
              </span>
            )}
            {blueskyCheck === 'fail' && (
              <span style={{ display: 'block', marginTop: 6 }}>
                Проверка не прошла: {blueskyError}
              </span>
            )}
          </span>
          {integrations.blueskyConfigured ? (
            <button
              type="button"
              className="pw-button pw-button-small"
              onClick={() => void verifyBluesky()}
              disabled={!online || blueskyCheck === 'checking'}
            >
              <RefreshCw size={13} aria-hidden="true" />
              {blueskyCheck === 'checking' ? 'Проверяю…' : 'Проверить'}
            </button>
          ) : (
            <span className="pw-channel-state">не подключено</span>
          )}
        </div>

        <div className="pw-setting-row">
          <span className="pw-setting-name">Telegram</span>
          <span className="pw-setting-value">
            {integrations.telegramConfigured
              ? 'Бот и канал настроены на сервере. Подключение проверяется существующим crosspost при публикации.'
              : 'Не настроено на сервере.'}
          </span>
          <span className="pw-channel-state">
            {integrations.telegramConfigured ? 'настроено · без OAuth' : 'не подключено'}
          </span>
        </div>

        <p className="pw-kicker" style={{ marginTop: 14 }}>
          Фиктивные кнопки «Подключить» не добавлены: для GitHub и Telegram в текущем
          backend нет пользовательского OAuth-flow. Статус Bluesky проверяется реальным
          запросом, а не только наличием переменной окружения.
        </p>
      </section>

      <section className="pw-setting-group" aria-labelledby="pw-settings-shortcuts">
        <h2 id="pw-settings-shortcuts" className="pw-section-title">
          Горячие клавиши
        </h2>
        <ul className="pw-shortcuts">
          {WORKSPACE_ROUTES.map((route) => (
            <li key={route.key}>
              <span>{route.label}</span>
              <span className="pw-kbd">⌘ {route.shortcut}</span>
            </li>
          ))}
          <li>
            <span>Новый диалог</span>
            <span className="pw-kbd">⌘ N</span>
          </li>
        </ul>
        <p className="pw-kicker" style={{ marginTop: 12 }}>
          На Windows и Linux используйте Ctrl. Сочетания не перехватываются в input,
          textarea, select и contenteditable.
        </p>
      </section>

      <section className="pw-setting-group" aria-labelledby="pw-settings-legacy">
        <h2 id="pw-settings-legacy" className="pw-section-title">
          Сохранённые разделы
        </h2>
        <div className="pw-form-row">
          <a className="pw-button pw-button-small" href="/admin/pierrot/intelligence">
            Pierrot Intelligence
          </a>
          <a className="pw-button pw-button-small" href="/admin/pierrot/offers">
            Offer policy
          </a>
          <a className="pw-button pw-button-small" href="/admin/brain">
            Brain Injection
          </a>
        </div>
      </section>
    </div>
  );
}
