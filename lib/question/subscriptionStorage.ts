/** Client-safe key/value helpers for anonymous subscription UI state. */

export type QuestionLocalChannelState = 'pending' | 'active' | 'disabled';

export type QuestionLocalSubscriptionState = {
  email?: QuestionLocalChannelState;
  telegram?: QuestionLocalChannelState;
};

const PREFIX = 'question:subscription:';

function storageKey(questionId: string): string {
  return `${PREFIX}${questionId}`;
}

export function readLocalSubscriptionState(
  questionId: string
): QuestionLocalSubscriptionState {
  if (!questionId) return {};

  try {
    const raw = window.localStorage.getItem(storageKey(questionId));
    if (!raw) return {};

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const result: QuestionLocalSubscriptionState = {};

    if (
      parsed.email === 'pending' ||
      parsed.email === 'active' ||
      parsed.email === 'disabled'
    ) {
      result.email = parsed.email;
    }

    if (
      parsed.telegram === 'pending' ||
      parsed.telegram === 'active' ||
      parsed.telegram === 'disabled'
    ) {
      result.telegram = parsed.telegram;
    }

    return result;
  } catch {
    return {};
  }
}

export function writeLocalSubscriptionState(
  questionId: string,
  patch: QuestionLocalSubscriptionState
): void {
  if (!questionId) return;

  try {
    const current = readLocalSubscriptionState(questionId);
    window.localStorage.setItem(
      storageKey(questionId),
      JSON.stringify({ ...current, ...patch })
    );
  } catch {
    // Private browsing may deny storage. The server state still works.
  }
}

export function clearLocalSubscriptionState(questionId: string): void {
  if (!questionId) return;

  try {
    window.localStorage.removeItem(storageKey(questionId));
  } catch {
    // Storage is optional.
  }
}
