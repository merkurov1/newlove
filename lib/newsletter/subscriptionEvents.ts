import type { SupabaseClient } from '@supabase/supabase-js';

export const SUBSCRIPTION_EVENT_NAMES = [
  'subscription_submitted',
  'subscription_confirmed',
  'subscription_failed',
  'unsubscribe',
] as const;

export type SubscriptionEventName = (typeof SUBSCRIPTION_EVENT_NAMES)[number];

/**
 * Server-only analytics for the subscription lifecycle. The payload is
 * deliberately limited to non-personal metadata: no email, name or message.
 */
export async function recordSubscriptionEvent(
  store: SupabaseClient,
  input: {
    eventName: SubscriptionEventName;
    eventKey: string;
    subscriberId?: string | number | null;
    conversationId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const { error } = await store.from('subscription_events').upsert(
      {
        event_name: input.eventName,
        event_key: input.eventKey,
        subscriber_id:
          input.subscriberId === null || input.subscriberId === undefined
            ? null
            : String(input.subscriberId),
        conversation_id: input.conversationId || null,
        payload: input.payload || {},
      },
      { onConflict: 'event_key', ignoreDuplicates: true }
    );

    if (error) {
      console.warn('[Subscription analytics] event write failed');
      return false;
    }

    return true;
  } catch {
    console.warn('[Subscription analytics] event write failed');
    return false;
  }
}
