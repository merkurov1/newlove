/**
 * Client-side helper that attaches the raw Telegram initData string so the
 * server can verify it. This is not authentication by itself: the server
 * validates the HMAC signature, freshness and allowlist.
 */
export function telegramAuthHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};

  const initData = (
    window as Window & { Telegram?: { WebApp?: { initData?: string } } }
  ).Telegram?.WebApp?.initData;

  return typeof initData === 'string' && initData.length > 0
    ? { 'x-telegram-init-data': initData }
    : {};
}
