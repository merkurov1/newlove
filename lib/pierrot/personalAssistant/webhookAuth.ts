import { assertServerOnly } from '@/lib/serverOnly';
import { timingSafeEqual } from 'node:crypto';
import { inspectPersonalAssistantUpdate } from './identity';

assertServerOnly('lib/pierrot/personalAssistant/webhookAuth');

export type HeaderReader = {
  get(name: string): string | null;
};

export type WebhookAuthEnvironment = Record<string, string | undefined>;

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');

  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Fails closed. The personal assistant profile is available only when webhook
 * secret enforcement is explicitly enabled, the secret is configured and the
 * incoming update carries the exact Telegram secret token.
 *
 * Existing owner/public flows keep their opt-in behaviour; this stricter check
 * applies only when an update claims the personal assistant identity.
 */
export function isTelegramWebhookAuthentic(
  headers: HeaderReader,
  env: WebhookAuthEnvironment = process.env
): boolean {
  if (env.TELEGRAM_WEBHOOK_ENFORCE_SECRET !== '1') return false;

  const expected = (env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (!expected) return false;

  const provided = headers.get('x-telegram-bot-api-secret-token');
  if (!provided) return false;

  return constantTimeEquals(provided, expected);
}

export type PersonalAssistantUpdateAuthorization =
  | 'ignore'
  | 'allow'
  | 'reject_unauthenticated'
  | 'reject_context';

/**
 * One decision point for the personal assistant webhook.
 *
 * The sender is read only from the Telegram update. An unverified update that
 * claims the allowlisted sender is rejected before any handler runs. A valid
 * secret is not enough to make a group, supergroup or channel context valid.
 */
export function authorizePersonalAssistantUpdate(
  update: unknown,
  headers: HeaderReader,
  env: WebhookAuthEnvironment = process.env
): PersonalAssistantUpdateAuthorization {
  const inspection = inspectPersonalAssistantUpdate(update);

  if (inspection.kind === 'unrelated') return 'ignore';
  if (!isTelegramWebhookAuthentic(headers, env)) return 'reject_unauthenticated';
  if (inspection.kind === 'forbidden') return 'reject_context';

  return 'allow';
}
