/**
 * Add-to-Home-Screen state machine.
 *
 * The prompt is discretionary and must never block the Temple. This module is
 * pure so the "no nagging" rules are testable without a Telegram client.
 */

export type HomeScreenStatus = 'unsupported' | 'unknown' | 'added' | 'promptable' | 'missed';

export type HomeScreenPromptAction = 'hide' | 'offer' | 'already-added' | 'unsupported';

export const HOME_SCREEN_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeHomeScreenStatus(value: unknown): HomeScreenStatus {
  switch (value) {
    case 'added':
    case 'missed':
    case 'promptable':
      return value;
    case 'unsupported':
    case 'unknown':
      return value;
    default:
      return 'unknown';
  }
}

export function resolveHomeScreenPrompt(options: {
  isTelegram: boolean;
  supported: boolean;
  status: HomeScreenStatus;
  dismissedAtMs?: number | null;
  nowMs?: number;
}): HomeScreenPromptAction {
  const { isTelegram, supported, status } = options;

  if (!isTelegram) return 'hide';
  if (!supported || status === 'unsupported') return 'unsupported';
  if (status === 'added') return 'already-added';
  if (status !== 'promptable') return 'hide';

  const now = options.nowMs ?? Date.now();
  const dismissedAt = options.dismissedAtMs ?? null;

  if (dismissedAt && now - dismissedAt < HOME_SCREEN_PROMPT_COOLDOWN_MS) {
    return 'hide';
  }

  return 'offer';
}

export function readHomeScreenDismissedAt(storage?: Pick<Storage, 'getItem'> | null): number | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem('temple_home_screen_dismissed_at');
    const value = raw ? Number(raw) : NaN;

    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberHomeScreenDismissal(
  storage?: Pick<Storage, 'setItem'> | null,
  nowMs = Date.now()
) {
  if (!storage) return;

  try {
    storage.setItem('temple_home_screen_dismissed_at', String(nowMs));
  } catch {
    /* Storage can be unavailable in private webviews. */
  }
}
