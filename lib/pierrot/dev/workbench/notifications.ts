import { assertServerOnly } from '@/lib/serverOnly';
import { sendTelegramMessage } from '@/lib/telegram';
import { getNotificationOwnerId } from '@/lib/telegram/notifications';
import { getSetting, setSetting } from './store';

assertServerOnly('lib/pierrot/dev/workbench/notifications');

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Owner notifications for the engineering workbench.
 *
 * The existing Telegram notification channel is reused. Delivery is
 * best-effort and deduplicated by the caller's event key so a retried request
 * cannot spam the owner. Heartbeats never call this helper.
 */
export async function notifyDevOwner(input: {
  eventKey: string;
  title: string;
  lines: string[];
  url?: string | null;
}): Promise<boolean> {
  const owner = getNotificationOwnerId();
  if (!owner) return false;

  const key = `notified:${input.eventKey}`.slice(0, 240);
  try {
    const existing = await getSetting<unknown>(key, null);
    if (existing) return false;
  } catch {
    // If the dedupe store is unavailable, do not risk a notification storm.
    return false;
  }

  const text = [
    `<b>${escapeHtml(input.title)}</b>`,
    '',
    ...input.lines.map((line) => escapeHtml(line)),
    ...(input.url ? ['', escapeHtml(input.url)] : []),
  ]
    .join('\n')
    .slice(0, 4000);

  const sent = await sendTelegramMessage(owner, text, {
    disableLinkPreview: true,
    timeoutMs: 8000,
  });
  if (!sent) return false;

  await setSetting(key, { at: new Date().toISOString() }).catch(() => {});
  return true;
}
