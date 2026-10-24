/**
 * Access policy for the private Telegram Research pages.
 *
 * This module is intentionally pure: the server route/layout resolves the
 * current Supabase user and this function decides what to do. Keeping the
 * decision here makes the security boundary testable without Next.js.
 *
 * The project's verified administrator mechanism is `users.role = 'ADMIN'`
 * (see `requireAdmin` / `getCurrentUser` in lib/serverAuth.ts). There is no
 * separate owner flag, so the owner-level role is the single source of truth.
 */

export const TELEGRAM_RESEARCH_LOGIN_PATH = '/login?next=%2Fresearch%2Ftelegram';
export const TELEGRAM_RESEARCH_FORBIDDEN_PATH = '/403';

export type TelegramResearchAccessDecision = 'allow' | 'login' | 'forbidden';

export interface TelegramResearchAccessUser {
  role?: string | null;
}

export function telegramResearchAccessDecision(
  user: TelegramResearchAccessUser | null | undefined
): TelegramResearchAccessDecision {
  if (!user) return 'login';
  return user.role === 'ADMIN' ? 'allow' : 'forbidden';
}

/**
 * Returns the redirect target for a denied visitor, or `null` when the
 * server should render the private research pages.
 */
export function telegramResearchAccessRedirect(
  user: TelegramResearchAccessUser | null | undefined
): string | null {
  const decision = telegramResearchAccessDecision(user);
  if (decision === 'login') return TELEGRAM_RESEARCH_LOGIN_PATH;
  if (decision === 'forbidden') return TELEGRAM_RESEARCH_FORBIDDEN_PATH;
  return null;
}
