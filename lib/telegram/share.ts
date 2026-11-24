/**
 * Pure share planning helpers.
 *
 * Telegram requires a server-created prepared inline message for `shareMessage`
 * and real media for `shareToStory`. This module never invents identifiers: it
 * describes what is possible and the caller supplies the actual prepared id.
 */

export type ShareKind = 'temple' | 'vigil' | 'flow' | 'chronicle';

export type ShareRequest = {
  kind: ShareKind;
  title: string;
  url: string;
  imageUrl?: string | null;
  excerpt?: string | null;
};

const MAX_SHARE_TEXT = 240;

export function isSafeShareUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;

  try {
    const url = new URL(value.trim());

    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isSafeStoryMediaUrl(value: unknown): value is string {
  if (!isSafeShareUrl(value)) return false;

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function short(text: string, limit = MAX_SHARE_TEXT) {
  const clean = text.replace(/\s+/g, ' ').trim();

  return clean.length > limit ? `${clean.slice(0, limit - 1).trimEnd()}…` : clean;
}

export function buildShareText(input: ShareRequest): string {
  const title = short(input.title || 'The Temple', 90);
  const body = short(input.excerpt || '', 120);
  const prefix =
    input.kind === 'vigil'
      ? 'The Vigil is shared.'
      : input.kind === 'chronicle'
        ? 'A trace in the Temple.'
        : input.kind === 'flow'
          ? ''
          : 'The Temple is open.';

  return [prefix, title, body].filter(Boolean).join(' ');
}

export function buildShareWidgetLink(input: ShareRequest) {
  if (!isSafeShareUrl(input.url)) return undefined;

  return {
    url: input.url,
    name: input.kind === 'flow' ? 'Read on Flow' : 'Enter the Temple',
  };
}

export type StoryPlan =
  | { supported: true; mediaUrl: string; text: string }
  | { supported: false; reason: 'no-media' | 'invalid-media' };

export function planStoryShare(input: ShareRequest): StoryPlan {
  if (!input.imageUrl) return { supported: false, reason: 'no-media' };
  if (!isSafeStoryMediaUrl(input.imageUrl)) {
    return { supported: false, reason: 'invalid-media' };
  }

  return {
    supported: true,
    mediaUrl: input.imageUrl,
    text: short(buildShareText(input), 180),
  };
}

export type ShareFallbackTarget = 'telegram-link' | 'navigator-share' | 'copy';

export function planShareFallbacks(options: {
  telegramDeepLink: string;
  navigatorShare: boolean;
}): ShareFallbackTarget[] {
  const plan: ShareFallbackTarget[] = [];

  if (isSafeShareUrl(options.telegramDeepLink)) plan.push('telegram-link');
  if (options.navigatorShare) plan.push('navigator-share');

  plan.push('copy');

  return plan;
}

export function buildTelegramShareDeepLink(url: string, text?: string): string | null {
  if (!isSafeShareUrl(url)) return null;

  const params = new URLSearchParams({ url });

  if (text) params.set('text', short(text, 200));

  return `https://t.me/share/url?${params.toString()}`;
}

export type ShareOutcome =
  | 'story'
  | 'message'
  | 'telegram-link'
  | 'native'
  | 'copied'
  | 'dismissed'
  | 'failed';

type StoryApi = {
  shareToStory?: (mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }) => void;
};

type MessageApi = {
  shareMessage?: (messageId: string, callback?: (sent: boolean) => void) => void;
};

/**
 * Execute the best supported share path. Dismissal is a normal outcome and is
 * never surfaced as an error that could interrupt a ritual or reading.
 */
export async function performShare(input: {
  request: ShareRequest;
  storyApi?: StoryApi | null;
  messageApi?: MessageApi | null;
  prepareMessage?: () => Promise<string | null>;
  openTelegramLink?: (url: string) => void;
  copy?: (text: string) => Promise<void>;
}): Promise<ShareOutcome> {
  const story = planStoryShare(input.request);

  if (story.supported && typeof input.storyApi?.shareToStory === 'function') {
    try {
      input.storyApi.shareToStory(
        story.mediaUrl,
        story.text
          ? { text: story.text, widget_link: buildShareWidgetLink(input.request) }
          : undefined
      );
      return 'story';
    } catch {
      return 'dismissed';
    }
  }

  if (typeof input.messageApi?.shareMessage === 'function' && input.prepareMessage) {
    try {
      const preparedId = await input.prepareMessage();

      if (preparedId) {
        input.messageApi.shareMessage(preparedId);
        return 'message';
      }
    } catch {
      // Continue to the safer fallbacks.
    }
  }

  const text = buildShareText(input.request);
  const deepLink = buildTelegramShareDeepLink(input.request.url, text);

  if (deepLink && input.openTelegramLink) {
    try {
      input.openTelegramLink(deepLink);
      return 'telegram-link';
    } catch {
      // Fall through to browser sharing.
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: input.request.title, text, url: input.request.url });

      return 'native';
    } catch (error) {
      // A user dismissing the native sheet is not a failure worth reporting.
      if (error instanceof Error && /abort/i.test(error.name + error.message)) {
        return 'dismissed';
      }
    }
  }

  const copy =
    input.copy ??
    (typeof navigator !== 'undefined' && navigator.clipboard
      ? navigator.clipboard.writeText.bind(navigator.clipboard)
      : null);

  if (copy) {
    try {
      await copy(input.request.url);

      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}
