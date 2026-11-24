/**
 * Client-side *hint* that Telegram launched this Mini App from a group.
 *
 * This parses the raw initData string for UI capability detection only. It is
 * never used for authorization: the server re-verifies the signature and
 * derives the group from the signed payload.
 */

export type GroupContextHint = {
  available: boolean;
  chatType: 'group' | 'supergroup' | null;
  title: string | null;
};

export function readGroupContextHint(initData: string): GroupContextHint {
  if (!initData) return { available: false, chatType: null, title: null };

  try {
    const params = new URLSearchParams(initData);
    const chatType = params.get('chat_type');

    if (chatType !== 'group' && chatType !== 'supergroup') {
      return { available: false, chatType: null, title: null };
    }

    let title: string | null = null;
    const rawChat = params.get('chat');

    if (rawChat) {
      try {
        const parsed = JSON.parse(rawChat) as { title?: unknown };
        title = typeof parsed.title === 'string' ? parsed.title.slice(0, 80) : null;
      } catch {
        title = null;
      }
    }

    return { available: true, chatType, title };
  } catch {
    return { available: false, chatType: null, title: null };
  }
}
