import { createHash } from 'crypto';
import { PIERROT_SECTIONS, type PierrotSectionId } from '@/lib/pierrot/navigation';
import type { PierrotOfferCta } from '@/lib/pierrot/offers';

export type TelegramPierrotIds = {
  conversationId: string;
  sessionId: string;
  userMessageId: string;
};

export type TelegramPierrotButton = {
  text: string;
  url?: string;
  callbackData?: string;
};

type TelegramPierrotAction =
  | { kind: 'navigate'; label: string; sectionId: PierrotSectionId }
  | { kind: 'prompt'; label: string; prompt: string };

type TelegramPierrotResponse = {
  actions?: TelegramPierrotAction[];
  links?: Array<{ label: string; href: string }>;
  cta?: PierrotOfferCta;
};

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 40);
}

/**
 * Stable, opaque ids derived from a Telegram chat and message. The same
 * update retried by Telegram maps to the same conversation/message, so the
 * web pipeline's replay protection applies.
 */
export function createTelegramPierrotIds(
  chatId: string | number,
  messageId: string | number
): TelegramPierrotIds {
  const chat = String(chatId);
  const message = String(messageId);

  return {
    conversationId: `tgc_${digest(`conversation:${chat}`)}`,
    sessionId: `tgs_${digest(`session:${chat}`)}`,
    userMessageId: `tgu_${digest(`message:${chat}:${message}`)}`,
  };
}

export function telegramSiteUrl(baseUrl: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;

  const base = baseUrl.replace(/\/+$/, '');

  return href.startsWith('/') ? `${base}${href}` : base;
}

export function createPromptCallbackData(prompt: string): string | null {
  const data = `p:${Buffer.from(prompt, 'utf8').toString('base64url')}`;

  return data.length <= 64 ? data : null;
}

/**
 * Maps the same actions/links/CTA returned by /api/pierrot-web to Telegram
 * inline buttons. Prompt actions become callback buttons when the encoded
 * payload fits Telegram's 64-byte callback limit.
 */
export function buildTelegramButtons(
  response: TelegramPierrotResponse,
  baseUrl: string
): TelegramPierrotButton[] {
  const buttons: TelegramPierrotButton[] = [];
  const seen = new Set<string>();

  const add = (button: TelegramPierrotButton) => {
    const key = button.url ?? button.callbackData ?? button.text;

    if (!key || seen.has(key)) return;
    if (button.url && !/^https?:\/\//i.test(button.url)) return;

    seen.add(key);
    buttons.push(button);
  };

  for (const action of response.actions ?? []) {
    if (action.kind === 'navigate') {
      const section = PIERROT_SECTIONS[action.sectionId];

      if (section) {
        add({
          text: action.label,
          url: telegramSiteUrl(baseUrl, section.route),
        });
      }
      continue;
    }

    const callbackData = createPromptCallbackData(action.prompt);

    if (callbackData) {
      add({ text: action.label, callbackData });
    }
  }

  for (const link of response.links ?? []) {
    add({ text: link.label, url: telegramSiteUrl(baseUrl, link.href) });
  }

  if (response.cta) {
    add({ text: response.cta.label, url: telegramSiteUrl(baseUrl, response.cta.href) });
  }

  return buttons.slice(0, 10);
}
