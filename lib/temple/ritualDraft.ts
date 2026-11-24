/**
 * Session-scoped drafts keep a ritual's answers/results across modal
 * navigation, refresh and Telegram webview restores. Drafts never leave the
 * visitor's browser and are cleared by the caller when a ritual restarts.
 */
export function readRitualDraft<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.sessionStorage.getItem(key);

    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeRitualDraft<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full or blocked storage must not break the ritual.
  }
}

export function clearRitualDraft(key: string): void {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}
